// ActionTester — the debug console's centrepiece. Pick an account + action and
// invoke it; params render as role-driven smart controls (pickers, switches,
// file sources) with a raw-JSON escape hatch. Read-only actions are badged
// green, side-effecting ones amber; destructive ones confirm first. Stream API
// actions invoke over the streaming transport and render frames live (tracked
// in the app-level task registry). Every call lands in localStorage history
// with one-click replay. Responses render in a collapsible JsonTree.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { motion, useReducedMotionConfig } from 'motion/react';
import {
    AlertTriangle,
    Braces,
    History,
    Loader2,
    Play,
    RotateCcw,
    ShieldCheck,
    Trash2,
    Zap,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Picker } from '@/components/ui/picker';
import { JsonTree } from '@/components/ui/json-tree';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ParamField } from '@/components/debug/param-field';
import { Segmented } from '@/components/debug/segmented';
import { useApi } from '@/lib/api';
import { useDebugTasks } from '@/contexts/DebugTaskContext';
import { buildActionParams } from '@/lib/action-params';
import { clearHistory, loadHistory, pushHistory, type InvokeRecord } from '@/lib/debug-history';
import { cn } from '@/lib/utils';
import type { DebugActionDoc, DebugStreamFrame, QQInfo } from '@/types';

// Name patterns for destructive actions → require a confirm. False
// positives just add one extra click; false negatives skip a confirm — both low
// stakes (the amber banner already warns that any write is real).
const DESTRUCTIVE_RE =
    /(kick|ban|mute|recall|withdraw|delete|del_|dismiss|disband|leave|quit|remove|revoke)/i;
// Cap retained stream frames so a long-running / runaway stream can't grow the
// array and DOM without bound. Generous enough to keep a full normal stream.
const MAX_STREAM_FRAMES = 2000;

function qqAvatarUrl(uin: string) {
    return `/avatar/${encodeURIComponent(uin)}`;
}

function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
    return (
        <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

export function ActionTester({
    accounts,
    docs,
    presetAction,
    onInvokingChange,
}: {
    accounts: QQInfo[];
    docs: DebugActionDoc[];
    presetAction?: { name: string; nonce: number };
    onInvokingChange?: (invoking: boolean) => void;
}) {
    const t = useT();
    const reduced = useReducedMotionConfig();
    const api = useApi();
    const tasks = useDebugTasks();

    const [uin, setUin] = useState('');
    const [actionName, setActionName] = useState('');
    const [fields, setFields] = useState<Record<string, string>>({});
    const [paramMode, setParamMode] = useState<'form' | 'json'>('form');
    const [rawJson, setRawJson] = useState('{}');
    const [invoking, setInvoking] = useState(false);
    const [result, setResult] = useState<DebugStreamFrame | { error: string } | null>(null);
    const [frames, setFrames] = useState<DebugStreamFrame[]>([]);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmClearHistory, setConfirmClearHistory] = useState(false);
    const [history, setHistory] = useState<InvokeRecord[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const streamAbort = useRef<AbortController | null>(null);
    const invokingRef = useRef(false);

    useEffect(() => {
        onInvokingChange?.(invoking);
    }, [invoking, onInvokingChange]);

    useEffect(() => {
        setHistory(loadHistory());
    }, []);
    useEffect(() => {
        if (accounts[0] && !uin) {
            setUin(accounts[0].uin);
        }
    }, [accounts, uin]);
    // Prefill from the API browser’s Try action button (nonce lets the same action re-trigger).
    useEffect(() => {
        if (presetAction && !invokingRef.current) {
            setActionName(presetAction.name);
            setFields({});
            setParamMode('form');
            setResult(null);
            setFrames([]);
            setShowHistory(false);
        }
    }, [presetAction]);

    const doc = useMemo(() => docs.find((d) => d.name === actionName), [docs, actionName]);
    const effectiveMode = paramMode === 'json' || !doc ? 'json' : 'form';
    const isStream = !!doc?.stream;
    const isDestructive = DESTRUCTIVE_RE.test(actionName);

    const accountOptions = useMemo(
        () =>
            accounts.length === 0
                ? [{ value: '', label: t('(无在线账号)', '(No online accounts)') }]
                : accounts.map((a) => ({
                      value: a.uin,
                      label: a.nickname || a.uin,
                      sub: a.nickname ? a.uin : undefined,
                      avatar: qqAvatarUrl(a.uin),
                  })),
        [accounts, t],
    );

    const actionOptions = useMemo(
        () => docs.map((d) => ({ value: d.name, label: d.name, sub: d.summary })),
        [docs],
    );

    const buildParams = (): Record<string, unknown> | { __error: string } => {
        if (effectiveMode === 'json') {
            let parsed: unknown;

            try {
                parsed = JSON.parse(rawJson || '{}');
            } catch {
                return { __error: t('参数 JSON 格式无效', 'Invalid parameter JSON') };
            }

            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                return { __error: t('参数必须是 JSON 对象', 'Parameters must be a JSON object') };
            }

            return parsed as Record<string, unknown>;
        }

        try {
            return buildActionParams(doc?.params ?? [], fields, t);
        } catch (error) {
            return { __error: error instanceof Error ? error.message : String(error) };
        }
    };

    const runInvoke = async () => {
        if (invokingRef.current) {
            return;
        }

        if (!uin) {
            setResult({ error: t('请选择账号', 'Select an account') });
            return;
        }

        if (!actionName.trim()) {
            setResult({ error: t('请选择或输入接口名称', 'Select or enter an action name') });
            return;
        }

        const params = buildParams();

        if ('__error' in params) {
            setResult({ error: params.__error as string });
            return;
        }

        invokingRef.current = true;
        setInvoking(true);
        setResult(null);
        setFrames([]);
        const startedAt = Date.now();

        if (isStream) {
            const ac = new AbortController();
            streamAbort.current = ac;
            const taskId = tasks.start({
                kind: 'stream',
                label: `${actionName} @ ${uin}`,
                progress: undefined,
                cancel: () => ac.abort(),
            });
            let last: DebugStreamFrame | null = null;

            try {
                await api.debug.invokeStream(
                    uin,
                    actionName.trim(),
                    params,
                    (frame) => {
                        last = frame;
                        setFrames((prev) =>
                            prev.length >= MAX_STREAM_FRAMES
                                ? [...prev.slice(-(MAX_STREAM_FRAMES - 1)), frame]
                                : [...prev, frame],
                        );
                        const d = frame.data as
                            | {
                                  type?: string;
                                  progress?: number;
                                  transferred?: number;
                                  total?: number;
                              }
                            | undefined;

                        if (d && typeof d.progress === 'number') {
                            tasks.update(taskId, { progress: d.progress });
                        } else if (
                            d &&
                            typeof d.transferred === 'number' &&
                            typeof d.total === 'number' &&
                            d.total > 0
                        ) {
                            tasks.update(taskId, { progress: d.transferred / d.total });
                        }
                    },
                    ac.signal,
                );
                // Success requires the terminal response marker, not just a
                // progress frame followed by a closed connection.
                const term = last as DebugStreamFrame | null;
                const ok =
                    !!term &&
                    term.status === 'ok' &&
                    (term.data as { type?: string } | undefined)?.type === 'response';
                setResult(
                    ok || term?.status === 'failed'
                        ? term
                        : {
                              error: t(
                                  '流已结束，但未收到完成响应',
                                  'The stream ended without a completion response',
                              ),
                          },
                );
                tasks.finish(taskId, ok ? 'done' : 'failed');
                setHistory(
                    pushHistory({
                        at: startedAt,
                        uin,
                        action: actionName.trim(),
                        params,
                        ok,
                        ms: Date.now() - startedAt,
                        stream: true,
                    }),
                );
            } catch (e) {
                const aborted = ac.signal.aborted;
                const msg =
                    e instanceof Error ? e.message : t('流式调用失败', 'Streaming action failed');

                if (!aborted) {
                    setResult({ error: msg });
                }

                tasks.finish(taskId, aborted ? 'canceled' : 'failed', msg);
                setHistory(
                    pushHistory({
                        at: startedAt,
                        uin,
                        action: actionName.trim(),
                        params,
                        ok: false,
                        ms: Date.now() - startedAt,
                        stream: true,
                    }),
                );
            } finally {
                streamAbort.current = null;
                invokingRef.current = false;
                setInvoking(false);
            }

            return;
        }

        try {
            const res = await api.debug.invoke(uin, actionName.trim(), params);
            setResult(res);
            setHistory(
                pushHistory({
                    at: startedAt,
                    uin,
                    action: actionName.trim(),
                    params,
                    ok: res.status === 'ok',
                    ms: Date.now() - startedAt,
                }),
            );
        } catch (e) {
            setResult({ error: e instanceof Error ? e.message : t('调用失败', 'Action failed') });
            setHistory(
                pushHistory({
                    at: startedAt,
                    uin,
                    action: actionName.trim(),
                    params,
                    ok: false,
                    ms: Date.now() - startedAt,
                }),
            );
        } finally {
            invokingRef.current = false;
            setInvoking(false);
        }
    };

    const onExecute = () => {
        if (invokingRef.current) {
            return;
        }

        if (isDestructive) {
            setConfirmOpen(true);
            return;
        }

        void runInvoke();
    };

    const replay = (rec: InvokeRecord) => {
        if (invokingRef.current) {
            return;
        }

        setUin(rec.uin);
        setActionName(rec.action);
        setParamMode('json');
        setRawJson(JSON.stringify(rec.params, null, 2));
        setResult(null);
        setFrames([]);
        setShowHistory(false);
    };

    const resultFailed = !!result && ('error' in result || result.status === 'failed');
    const runLabel = t(isStream ? '运行流式调用' : '运行调用', 'Run action');

    return (
        <div className="cp-debug-workbench">
            <div className="cp-debug-context relative z-30 flex min-w-0 flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t('账号', 'Account')}>
                        <Picker
                            ariaLabel={t('选择账号', 'Select account')}
                            value={uin}
                            onChange={(nextUin) => {
                                if (invokingRef.current || nextUin === uin) {
                                    return;
                                }

                                setUin(nextUin);
                                setResult(null);
                                setFrames([]);
                            }}
                            options={accountOptions}
                            placeholder={t('选择账号…', 'Select account…')}
                            validateRaw={() => false}
                            disabled={accounts.length === 0 || invoking}
                        />
                    </Field>
                    <div
                        className="flex min-w-0 flex-col gap-1.5"
                        data-tutorial-control="debug-action"
                    >
                        <span className="text-xs font-medium text-muted-foreground">
                            {t('接口', 'Action')}
                        </span>
                        <Picker
                            ariaLabel={t('选择接口', 'Select action')}
                            value={actionName}
                            onChange={(v) => {
                                if (invokingRef.current) {
                                    return;
                                }

                                setActionName(v);
                                setFields({});
                                setResult(null);
                                setFrames([]);
                            }}
                            options={actionOptions}
                            placeholder={t('搜索接口…', 'Select action')}
                            validateRaw={(s) => s.trim().length > 0}
                            disabled={invoking}
                        />
                    </div>
                </div>

                {doc && (
                    <div className="-mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        {doc.readOnly ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                                <ShieldCheck className="h-3 w-3" /> {t('只读', 'Read-only')}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                                <AlertTriangle className="h-3.5 w-3.5" />{' '}
                                {t('有副作用', 'Has side effects')}
                            </span>
                        )}
                        {isStream && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                <Zap className="h-3 w-3" /> {t('流式', 'Streaming')}
                            </span>
                        )}
                        <span>
                            {doc.summary}
                            {doc.returns ? (
                                <>
                                    {' '}
                                    {t('· 返回 ', '· Returns ')}
                                    <code className="font-mono text-meta">{doc.returns}</code>
                                </>
                            ) : null}
                        </span>
                    </div>
                )}
            </div>

            {/* tester */}
            <motion.section
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                className="cp-panel cp-debug-section relative z-20 flex min-w-0 flex-col gap-5"
            >
                <div className="flex items-center gap-2.5">
                    <Braces className="size-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">
                        {t('请求参数', 'Request parameters')}
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="glass"
                        size="sm"
                        onClick={onExecute}
                        data-tutorial-control="debug-run"
                        disabled={invoking}
                        aria-label={runLabel}
                    >
                        {invoking ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : isStream ? (
                            <Zap className="size-4" />
                        ) : (
                            <Play className="optical-forward size-4" />
                        )}
                        {invoking ? t('运行中…', 'Running…') : runLabel}
                    </Button>
                    {invoking && isStream && streamAbort.current && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => streamAbort.current?.abort()}
                        >
                            {t('取消', 'Cancel')}
                        </Button>
                    )}
                </div>

                <fieldset
                    disabled={invoking}
                    inert={invoking}
                    className="flex min-w-0 flex-col gap-5"
                >
                    <div className="cp-inline-notice text-warning">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>
                            {t(
                                '写入类调用会直接影响当前账号。',
                                'Write actions affect the selected account directly.',
                            )}
                        </span>
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                            {t('参数', 'Parameters')}
                        </span>
                        <Segmented
                            label={t('参数编辑方式', 'Parameter editing mode')}
                            value={effectiveMode}
                            onChange={setParamMode}
                            options={[
                                { value: 'form', label: t('表单', 'Form') },
                                { value: 'json', label: 'JSON' },
                            ]}
                        />
                    </div>

                    {effectiveMode === 'json' ? (
                        <Textarea
                            aria-label={t('参数 JSON', 'Parameter JSON')}
                            className="min-h-40 rounded-[4px] font-mono text-sm"
                            value={rawJson}
                            onChange={(e) => setRawJson(e.target.value)}
                            placeholder='{ "group_id": 12345, "message": "hi" }'
                        />
                    ) : (
                        <div className="flex flex-col gap-3.5">
                            {doc!.params.length === 0 && (
                                <p className="text-[12px] text-muted-foreground">
                                    {t('该接口无参数。', 'This action takes no parameters.')}
                                </p>
                            )}
                            {doc!.params.map((p) => (
                                <Field
                                    key={`${actionName}:${p.name}`}
                                    label={
                                        <>
                                            {p.name}
                                            <span className="ml-1 font-normal text-muted-foreground/70">
                                                {p.type}
                                                {p.required ? t(' · 必填', ' · required') : ''}
                                            </span>
                                        </>
                                    }
                                >
                                    <ParamField
                                        param={p}
                                        value={fields[p.name] ?? ''}
                                        uin={uin}
                                        groupContext={fields['group_id'] ?? ''}
                                        actionName={actionName}
                                        onChange={(v) =>
                                            setFields((f) => {
                                                const next = { ...f, [p.name]: v };

                                                // Changing the group resets any sibling member picker — its
                                                // old uin belongs to the previous group.
                                                if (p.role === 'group_id' && doc) {
                                                    for (const mp of doc.params) {
                                                        if (mp.role === 'member_id') {
                                                            next[mp.name] = '';
                                                        }
                                                    }
                                                }

                                                return next;
                                            })
                                        }
                                    />
                                    {p.desc && (
                                        <span className="text-xs text-muted-foreground/70">
                                            {p.desc}
                                        </span>
                                    )}
                                </Field>
                            ))}
                            {doc!.invariants && doc!.invariants.length > 0 && (
                                <p className="text-xs text-muted-foreground/70">
                                    {t(
                                        `约束:${doc!.invariants.join('；')}`,
                                        `Constraints: ${doc!.invariants.join('; ')}`,
                                    )}
                                </p>
                            )}
                        </div>
                    )}
                </fieldset>
            </motion.section>

            {/* response / frames / history */}
            <motion.section
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                className="cp-panel cp-debug-section flex min-w-0 flex-col gap-4"
            >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                    <span className="text-xs font-medium text-muted-foreground">
                        {t('运行结果', 'Result')}
                    </span>
                    <button
                        type="button"
                        onClick={() => setShowHistory((v) => !v)}
                        aria-pressed={showHistory}
                        className="cp-control inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <History className="h-3.5 w-3.5" /> {t('历史 ', 'History ')}
                        {history.length > 0 && (
                            <span className="tabular-nums">{history.length}</span>
                        )}
                    </button>
                </div>
                <div
                    key={showHistory ? 'history' : 'result'}
                    className="cp-fade flex min-w-0 flex-col gap-4"
                >
                    {showHistory ? (
                        <>
                            <div className="flex items-center justify-between">
                                <h3 className="text-[15px] font-semibold tracking-tight">
                                    {t('调用历史', 'Action history')}
                                </h3>
                                {history.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmClearHistory(true)}
                                        className="cp-control inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> {t('清空', 'Clear')}
                                    </button>
                                )}
                            </div>
                            <div className="flex min-w-0 flex-col">
                                {history.length === 0 ? (
                                    <p className="py-8 text-sm text-muted-foreground">
                                        {t('暂无历史', 'No history')}
                                    </p>
                                ) : (
                                    history.map((rec) => (
                                        <button
                                            key={rec.id}
                                            type="button"
                                            onClick={() => replay(rec)}
                                            disabled={invoking}
                                            className="cp-action-row group flex min-h-14 min-w-0 flex-wrap items-center gap-2 py-3 text-left text-[13px] hover:bg-muted/30 disabled:opacity-50"
                                        >
                                            <span
                                                className={cn(
                                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                                    rec.ok ? 'bg-emerald-500' : 'bg-destructive',
                                                )}
                                            />
                                            <span className="min-w-0 flex-1 truncate font-mono">
                                                {rec.action}
                                            </span>
                                            <span className="shrink-0 font-mono text-meta text-muted-foreground tabular-nums">
                                                {rec.uin}
                                            </span>
                                            <span className="shrink-0 text-muted-foreground">
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <h3 className="text-[15px] font-semibold tracking-tight">
                                    {isStream
                                        ? t('实时帧', 'Stream frames')
                                        : t('响应内容', 'Response body')}
                                </h3>
                                {result && (
                                    <span
                                        className={cn(
                                            'text-xs font-medium',
                                            resultFailed ? 'text-destructive' : 'text-success',
                                        )}
                                    >
                                        {resultFailed
                                            ? t('调用失败', 'Action failed')
                                            : t('调用完成', 'Action completed')}
                                        {!('error' in result) &&
                                        resultFailed &&
                                        (result.message || result.wording)
                                            ? ` · ${result.message || result.wording}`
                                            : ''}
                                    </span>
                                )}
                            </div>
                            {frames.length > 0 && (
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <span className="text-xs text-muted-foreground tabular-nums">
                                        {t(
                                            `${frames.length} 帧`,
                                            `${frames.length} ${frames.length === 1 ? 'frame' : 'frames'}`,
                                        )}
                                    </span>
                                    {frames.map((f, i) => {
                                        // On a failed frame the action's `data` is replaced with an
                                        // {type:'error'} marker and the reason moves to message/wording
                                        // — render the whole frame so the reason stays visible.
                                        const failed =
                                            f.status === 'failed' ||
                                            (f.data as { type?: string } | undefined)?.type ===
                                                'error';
                                        return (
                                            <div
                                                key={i}
                                                className="min-w-0 border-t border-border py-2"
                                            >
                                                <JsonTree
                                                    data={failed ? f : (f.data ?? f)}
                                                    maxHeight="none"
                                                    className="cp-json-document"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {result && !('error' in result) && frames.length === 0 && (
                                <JsonTree
                                    data={result}
                                    maxHeight="none"
                                    className="cp-json-document"
                                />
                            )}
                            {result && 'error' in result && (
                                <div role="alert" className="cp-inline-notice text-destructive">
                                    {result.error}
                                </div>
                            )}
                            {!result && frames.length === 0 && (
                                <p className="py-8 text-sm text-muted-foreground">
                                    {t(
                                        '执行后在此查看结果',
                                        'Run an action to see its result here',
                                    )}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </motion.section>

            <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title={t('确认执行破坏性操作', 'Confirm destructive action')}
                description={
                    <>
                        {t('即将以账号 ', 'About to use account ')}
                        <code className="font-mono text-foreground">{uin}</code>
                        {t(' 执行 ', ' to run ')}
                        <code className="font-mono text-foreground">{actionName}</code>
                        {t('，该操作会', '; the action will ')}
                        <strong className="text-foreground">
                            {t(
                                '真实生效且通常不可撤销',
                                'take effect immediately and usually cannot be undone',
                            )}
                        </strong>
                        {t('。确认继续？', '. Continue?')}
                    </>
                }
                confirmText={t('确认执行', 'Confirm action')}
                destructive
                onConfirm={runInvoke}
            />
            <ConfirmDialog
                open={confirmClearHistory}
                onOpenChange={setConfirmClearHistory}
                title={t('清空调用历史？', 'Clear action history?')}
                description={t(
                    '仅移除此浏览器保存的调用历史，不会撤销已经执行的接口。',
                    'This clears the history stored in this browser. It does not undo actions already run.',
                )}
                confirmText={t('清空历史', 'Clear history')}
                destructive
                onConfirm={() => {
                    clearHistory();
                    setHistory([]);
                }}
            />
        </div>
    );
}
