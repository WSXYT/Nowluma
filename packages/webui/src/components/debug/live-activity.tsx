// LiveActivity — the merged live SSE of OneBot events + action calls across all
// accounts. Extracted from the debug page so it can stand alone as a console
// tab. Filter by kind, keyword-search, pause, clear, and export the buffer as
// JSON. Rows expand to a JsonTree of the full payload.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useT } from '@/i18n';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import {
    Activity,
    ChevronRight,
    Download,
    Pause,
    Play,
    RadioTower,
    Search,
    Trash2,
} from 'lucide-react';
import { JsonTree } from '@/components/ui/json-tree';
import { GlassSurface } from '@/components/ui/glass-material';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Segmented } from '@/components/debug/segmented';
import { useApi } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import type { DebugStreamMessage } from '@/types';

const STREAM_CAP = 300;

interface StreamRow {
    id: number;
    at: number;
    msg: Extract<DebugStreamMessage, { kind: 'event' | 'action' | 'dropped' }>;
    search: string;
}

function IconBtn({
    onClick,
    title,
    children,
    danger,
}: {
    onClick: () => void;
    title: string;
    children: ReactNode;
    danger?: boolean;
}) {
    return (
        <Button
            type="button"
            variant={danger ? 'ghost' : 'glass'}
            size="icon"
            onClick={onClick}
            title={title}
            aria-label={title}
            className={danger ? 'text-muted-foreground hover:text-destructive' : undefined}
        >
            {children}
        </Button>
    );
}

function StatusPill({
    status,
    paused,
}: {
    status: 'open' | 'reconnecting' | 'closed';
    paused?: boolean;
}) {
    // A deliberate pause reads as paused, distinct from an unwanted disconnect.
    const t = useT();
    const map = paused
        ? { dot: 'bg-muted-foreground/50', label: t('已暂停', 'Paused'), glow: '' }
        : {
              open: {
                  dot: 'bg-emerald-500',
                  label: t('已连接', 'Connected'),
                  glow: 'shadow-[0_0_0_3px_rgb(16_185_129/0.15)]',
              },
              reconnecting: {
                  dot: 'bg-amber-500',
                  label: t('重连中', 'Reconnecting'),
                  glow: 'shadow-[0_0_0_3px_rgb(245_158_11/0.15)]',
              },
              closed: {
                  dot: 'bg-muted-foreground/50',
                  label: t('未连接', 'Disconnected'),
                  glow: '',
              },
          }[status];
    return (
        <div role="status" className="inline-flex items-center gap-2 text-xs font-medium">
            <span className={cn('h-2 w-2 rounded-full', map.dot, map.glow)} />
            <span className="text-muted-foreground">{map.label}</span>
        </div>
    );
}

function rowLabel(msg: Extract<DebugStreamMessage, { kind: 'event' | 'action' }>): {
    label: string;
    detail: unknown;
    isAction: boolean;
    ok: boolean;
} {
    if (msg.kind === 'event') {
        const e = msg.event as Record<string, unknown>;
        return {
            label: `${e.post_type ?? 'event'}${e.message_type ? `.${e.message_type}` : e.notice_type ? `.${e.notice_type}` : ''}`,
            detail: e,
            isAction: false,
            ok: true,
        };
    }

    // action
    return {
        label: msg.action,
        detail: { params: msg.params, response: msg.response },
        isAction: true,
        ok: (msg.response as { status?: string }).status === 'ok',
    };
}

function StreamRowItem({ row }: { row: StreamRow }) {
    const t = useT();
    const { locale } = useLocale();
    const [open, setOpen] = useState(false);
    const id = useId();
    const reduced = useReducedMotionConfig();
    const { msg } = row;
    const time = new Date(row.at).toLocaleTimeString(locale, { hour12: false });

    if (msg.kind === 'dropped') {
        return (
            <div className="px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                {t(
                    `因客户端过慢丢弃了 ${msg.count} 条`,
                    `Dropped ${msg.count} ${msg.count === 1 ? 'entry' : 'entries'} because the client could not keep up`,
                )}
            </div>
        );
    }

    const { label, detail, isAction, ok } = rowLabel(msg);
    return (
        <div className="cp-action-row group transition-colors hover:bg-muted/40">
            <button
                type="button"
                aria-expanded={open}
                aria-controls={id}
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-16 min-w-0 w-full items-start gap-3 py-3 text-left text-[13px]"
            >
                <ChevronRight
                    className={cn(
                        'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-90',
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">{time}</span>
                        <span className="text-micro font-medium">
                            {isAction ? t('调用', 'Action') : t('事件', 'Event')}
                        </span>
                        <span className="font-mono">{msg.uin}</span>
                    </span>
                    <span className="mt-1 block break-all font-mono">{label}</span>
                </span>
                {msg.kind === 'action' && (
                    <span
                        className={cn(
                            'shrink-0 text-right text-xs tabular-nums',
                            ok ? 'text-success' : 'text-destructive',
                        )}
                    >
                        <span className="block">{ok ? 'ok' : 'failed'}</span>
                        <span className="text-muted-foreground">{msg.ms}ms</span>
                    </span>
                )}
            </button>
            <div id={id} inert={!open} aria-hidden={!open}>
                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            key="detail"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="mb-3 min-w-0">
                                <JsonTree
                                    data={detail}
                                    maxHeight="none"
                                    className="cp-json-document"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function LiveActivity() {
    const t = useT();
    const reduced = useReducedMotionConfig();
    const api = useApi();
    const [rows, setRows] = useState<StreamRow[]>([]);
    const [paused, setPaused] = useState(false);
    const [status, setStatus] = useState<'open' | 'reconnecting' | 'closed'>('closed');
    const [kindFilter, setKindFilter] = useState<'all' | 'event' | 'action'>('all');
    const [query, setQuery] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const idRef = useRef(0);

    // Pausing truly drops the live fetch stream instead of connecting-and-discarding:
    // `paused` is an effect dependency, so it closes the stream on pause and
    // reopens it on resume. (The always-on-across-tabs behaviour is intentional —
    // debug-page keeps this mounted so actions fired from other tabs still land in
    // the feed — so only an explicit pause severs the connection.)
    useEffect(() => {
        if (paused) {
            return;
        }

        const off = api.debug.stream(
            (m) => {
                if (m.kind === 'ready') {
                    return;
                }

                setRows((prev) => {
                    // Precompute the search haystack once at enqueue, so filtering never
                    // re-stringifies every row on each keystroke.
                    const next = [
                        {
                            id: idRef.current++,
                            at: Date.now(),
                            msg: m,
                            search: JSON.stringify(m).toLowerCase(),
                        },
                        ...prev,
                    ];
                    return next.length > STREAM_CAP ? next.slice(0, STREAM_CAP) : next;
                });
            },
            (s) => setStatus(s),
        );
        return off;
    }, [paused, api]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter((r) => {
            if (kindFilter !== 'all' && r.msg.kind !== kindFilter) {
                return false;
            }

            if (!q) {
                return true;
            }

            if (r.msg.kind === 'dropped') {
                return false;
            }

            const { label } = rowLabel(r.msg);
            return label.toLowerCase().includes(q) || r.msg.uin.includes(q) || r.search.includes(q);
        });
    }, [rows, kindFilter, query]);

    const exportJson = () => {
        downloadBlob(
            new Blob(
                [
                    JSON.stringify(
                        visible.map((r) => ({ at: r.at, ...r.msg })),
                        null,
                        2,
                    ),
                ],
                { type: 'application/json' },
            ),
            `debug-activity-${visible.length}.json`,
        );
    };

    return (
        <motion.section
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
            className="cp-panel flex min-w-0 flex-col gap-4"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <RadioTower className="size-4 text-muted-foreground" />
                    <h2 className="text-[15px] font-semibold tracking-tight">
                        {t('实时活动', 'Live activity')}
                    </h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {visible.length}
                    </span>
                    <StatusPill status={status} paused={paused} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                        label={t('活动类型', 'Activity type')}
                        value={kindFilter}
                        onChange={setKindFilter}
                        options={[
                            { value: 'all', label: t('全部', 'All') },
                            { value: 'event', label: t('事件', 'Event') },
                            { value: 'action', label: t('调用', 'Action') },
                        ]}
                    />
                    <IconBtn
                        onClick={() => setPaused((v) => !v)}
                        title={paused ? t('继续', 'Resume') : t('暂停', 'Pause')}
                    >
                        {paused ? (
                            <Play className="optical-forward h-4 w-4" />
                        ) : (
                            <Pause className="h-4 w-4" />
                        )}
                    </IconBtn>
                    <IconBtn onClick={exportJson} title={t('导出 JSON', 'Export JSON')}>
                        <Download className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn
                        danger
                        onClick={() => setConfirmClear(true)}
                        title={t('清空活动', 'Clear activity')}
                    >
                        <Trash2 className="h-4 w-4" />
                    </IconBtn>
                </div>
            </div>

            <GlassSurface className="ui-glass-search cp-search max-w-3xl">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                    type="search"
                    aria-label={t(
                        '搜索活动类型、账号或内容',
                        'Search activity by type, account, or content',
                    )}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('搜索类型 / 账号 / 内容…', 'Search type, account, or content…')}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </GlassSurface>

            <div className="mt-4 flex min-w-0 flex-1 flex-col">
                {visible.length === 0 ? (
                    <div className="cp-empty-state">
                        <Activity className="size-7 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                            {paused
                                ? t('已暂停', 'Paused')
                                : query || kindFilter !== 'all'
                                  ? t('无匹配', 'No matches')
                                  : t('等待事件…', 'Waiting for events…')}
                        </p>
                    </div>
                ) : (
                    visible.map((r) => <StreamRowItem key={r.id} row={r} />)
                )}
            </div>
            <ConfirmDialog
                open={confirmClear}
                onOpenChange={setConfirmClear}
                title={t('清空活动记录？', 'Clear activity history?')}
                description={t(
                    '仅清空当前浏览器的活动缓冲区，不会修改账号消息或撤销调用。',
                    'This clears only this browser’s activity buffer. It does not change account messages or undo actions.',
                )}
                confirmText={t('清空活动', 'Clear activity')}
                destructive
                onConfirm={() => setRows([])}
            />
        </motion.section>
    );
}
