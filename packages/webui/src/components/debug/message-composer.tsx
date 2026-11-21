// MessageComposer — the standalone Send message tab: pick a target (group or
// friend), build a message visually, preview it, send it. A message containing
// forward nodes goes through the forward-send action; otherwise the plain
// send_*_msg. The chosen group provides the @-member context to the builder.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { motion, useReducedMotionConfig } from 'motion/react';
import { Loader2, MessageSquarePlus, Send } from 'lucide-react';
import { Dropdown } from '@/components/interior/dropdown';
import { Picker } from '@/components/ui/picker';
import { JsonTree } from '@/components/ui/json-tree';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/debug/segmented';
import {
    MessageBuilder,
    hasNodes,
    previewSegments,
    toOneBot,
    validateSegs,
    type Seg,
} from '@/components/debug/message-builder';
import { useFriends, useGroups } from '@/hooks/use-debug-contacts';
import { useApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { DebugInvokeResult, QQInfo } from '@/types';

const looksLikeId = (s: string) => /^\d{3,}$/.test(s.trim());

function TargetPicker({
    kind,
    uin,
    value,
    onChange,
    disabled,
}: {
    kind: 'group' | 'friend';
    uin: string;
    value: string;
    onChange: (v: string) => void;
    disabled?: boolean;
}) {
    const t = useT();
    const groups = useGroups(kind === 'group' ? uin : '');
    const friends = useFriends(kind === 'friend' ? uin : '');
    const src = kind === 'group' ? groups : friends;
    return (
        <Picker
            ariaLabel={
                kind === 'group' ? t('选择群', 'Select group') : t('选择好友', 'Select friend')
            }
            value={value}
            onChange={onChange}
            options={src.items}
            loading={src.loading}
            error={src.error}
            onRefresh={src.refresh}
            placeholder={
                kind === 'group' ? t('选择群…', 'Select group…') : t('选择好友…', 'Select friend…')
            }
            validateRaw={looksLikeId}
            disabled={disabled}
        />
    );
}

export function MessageComposer({ accounts }: { accounts: QQInfo[] }) {
    const t = useT();
    const reduced = useReducedMotionConfig();
    const api = useApi();
    const [uin, setUin] = useState('');
    const [kind, setKind] = useState<'group' | 'friend'>('group');
    const [target, setTarget] = useState('');
    const [segs, setSegs] = useState<Seg[]>([]);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<DebugInvokeResult | { error: string } | null>(null);
    const sendingRef = useRef(false);

    // default to the first account once loaded
    useEffect(() => {
        if (!uin && accounts[0]) {
            setUin(accounts[0].uin);
        }
    }, [accounts, uin]);

    const preview = useMemo(() => previewSegments(segs, t), [segs, t]);
    const groupId = kind === 'group' ? target : '';

    const send = async () => {
        if (sendingRef.current) {
            return;
        }

        if (!uin) {
            setResult({ error: t('请选择账号', 'Select an account') });
            return;
        }

        if (!target) {
            setResult({
                error:
                    kind === 'group'
                        ? t('请选择群', 'Select a group')
                        : t('请选择好友', 'Select a friend'),
            });
            return;
        }

        if (segs.length === 0) {
            setResult({ error: t('消息为空', 'The message is empty') });
            return;
        }

        const forward = hasNodes(segs);

        // Forward messages must be ALL nodes: the backend silently drops top-level
        // non-node segments, so a mixed message would send less than the preview
        // shows. Block it with a clear message instead.
        if (forward && !segs.every((s) => s.k === 'node')) {
            setResult({
                error: t(
                    '合并转发消息只能由转发节点组成 — 请移除非节点段,或把它们放进某个转发节点内',
                    'A merged forward can contain only forward nodes. Remove the other segments or move them inside a forward node.',
                ),
            });
            return;
        }

        const incomplete = validateSegs(segs, t);

        if (incomplete) {
            setResult({ error: incomplete });
            return;
        }

        const payload = toOneBot(segs);
        const action = forward
            ? kind === 'group'
                ? 'send_group_forward_msg'
                : 'send_private_forward_msg'
            : kind === 'group'
              ? 'send_group_msg'
              : 'send_private_msg';
        const params: Record<string, unknown> =
            kind === 'group' ? { group_id: target } : { user_id: target };
        params[forward ? 'messages' : 'message'] = payload;

        sendingRef.current = true;
        setSending(true);
        setResult(null);

        try {
            setResult(await api.debug.invoke(uin, action, params));
        } catch (e) {
            setResult({ error: e instanceof Error ? e.message : t('发送失败', 'Send failed') });
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    };

    const resultFailed = !!result && ('error' in result || result.status === 'failed');

    return (
        <div className="cp-debug-workbench">
            <fieldset disabled={sending} inert={sending} className="cp-debug-context relative z-30">
                <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <div className="flex flex-col gap-1.5">
                        {/* Matching label rows keep both pickers aligned. */}
                        <div className="flex min-h-12 items-center">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('账号', 'Account')}
                            </span>
                        </div>
                        <Dropdown
                            value={uin}
                            onChange={(nextUin) => {
                                if (sendingRef.current || nextUin === uin) {
                                    return;
                                }

                                setUin(nextUin);
                                setTarget('');
                                setResult(null);
                            }}
                            label={t('账号', 'Account')}
                            placeholder={
                                accounts.length === 0
                                    ? t('（无在线账号）', '(No online accounts)')
                                    : t('选择账号', 'Select account')
                            }
                            disabled={sending || accounts.length === 0}
                            items={accounts.map((account) => ({
                                value: account.uin,
                                label: account.nickname
                                    ? `${account.nickname} · ${account.uin}`
                                    : account.uin,
                            }))}
                            className="w-full"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                                {t('目标', 'Recipient')}
                            </span>
                            <Segmented
                                label={t('消息目标类型', 'Recipient type')}
                                value={kind}
                                onChange={(k) => {
                                    if (sendingRef.current) {
                                        return;
                                    }

                                    setKind(k);
                                    setTarget('');
                                    setResult(null);
                                }}
                                options={[
                                    { value: 'group', label: t('群聊', 'Group chat') },
                                    { value: 'friend', label: t('私聊', 'Private chat') },
                                ]}
                            />
                        </div>
                        <TargetPicker
                            kind={kind}
                            uin={uin}
                            value={target}
                            disabled={sending}
                            onChange={(nextTarget) => {
                                if (sendingRef.current) {
                                    return;
                                }

                                setTarget(nextTarget);
                                setResult(null);
                            }}
                        />
                    </div>
                </div>
            </fieldset>

            <motion.section
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                className="cp-panel cp-debug-section relative z-10 flex min-w-0 flex-col gap-5"
            >
                <div className="flex items-center gap-2.5">
                    <MessageSquarePlus className="size-4 text-muted-foreground" />
                    <h2 className="text-base font-semibold">{t('编写消息', 'Compose message')}</h2>
                </div>
                <div className="cp-document-actions">
                    <Button
                        variant="glass"
                        size="sm"
                        onClick={send}
                        disabled={sending}
                        aria-label={t('发送消息', 'Send message')}
                    >
                        {sending ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Send className="optical-forward size-4" />
                        )}
                        {sending
                            ? t('发送中…', 'Sending…')
                            : hasNodes(segs)
                              ? t('发送合并转发', 'Send merged forward')
                              : t('发送消息', 'Send message')}
                    </Button>
                    <span className="min-w-0 break-words font-mono text-xs text-muted-foreground">
                        {uin ? `QQ ${uin}` : t('尚未选择账号', 'No account selected')}
                        {target
                            ? t(
                                  ` · ${kind === 'group' ? '群' : '好友'} ${target}`,
                                  ` · ${kind === 'group' ? 'Group' : 'Friend'} ${target}`,
                              )
                            : ''}
                    </span>
                </div>
                <p className="text-xs leading-relaxed text-warning">
                    {t(
                        '发送会真实作用于此账号和目标，不是模拟预览。',
                        'Sending uses the selected account and recipient. This is not a preview.',
                    )}
                </p>

                <fieldset
                    disabled={sending}
                    inert={sending}
                    className="flex min-w-0 flex-col gap-2"
                >
                    <legend className="mb-2 text-xs font-medium text-muted-foreground">
                        {t('消息内容', 'Message content')}
                    </legend>
                    <MessageBuilder
                        segments={segs}
                        onChange={setSegs}
                        uin={uin}
                        groupId={groupId}
                    />
                </fieldset>
            </motion.section>

            <motion.section
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: reduced ? 0 : 0.28 }}
                className="cp-panel cp-debug-section flex min-w-0 flex-col gap-4"
            >
                <h3 className="text-base font-semibold">{t('内容预览', 'Message preview')}</h3>
                <div className="cp-preview text-sm">
                    {preview ? (
                        <span className="whitespace-pre-wrap break-words">{preview}</span>
                    ) : (
                        <span className="text-muted-foreground">
                            {t('消息为空', 'The message is empty')}
                        </span>
                    )}
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                    {t('OneBot 段', 'OneBot segments')}
                </span>
                <JsonTree data={toOneBot(segs)} maxHeight="none" className="cp-json-document" />

                {result && (
                    <div className="flex flex-col gap-1.5">
                        <span
                            className={cn(
                                'text-xs font-medium',
                                resultFailed ? 'text-destructive' : 'text-success',
                            )}
                        >
                            {resultFailed
                                ? t('发送失败', 'Send failed')
                                : t('请求完成', 'Request completed')}
                        </span>
                        {'error' in result ? (
                            <div role="alert" className="cp-inline-notice text-destructive">
                                {result.error}
                            </div>
                        ) : (
                            <JsonTree data={result} maxHeight="none" className="cp-json-document" />
                        )}
                    </div>
                )}
            </motion.section>
        </div>
    );
}
