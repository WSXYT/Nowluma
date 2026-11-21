import {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { sanitizeLogLine } from '@nowluma/common/log-sanitize';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, AnimatePresence, useReducedMotionConfig } from 'motion/react';
import {
    ArrowDownToLine,
    Download,
    Filter,
    Highlighter,
    Inbox,
    Pause,
    Plus,
    RefreshCw,
    Search,
    SearchX,
    SlidersHorizontal,
    Trash2,
    TriangleAlert,
    WrapText,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GlassSurface } from '@/components/ui/glass-material';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn, downloadBlob } from '@/lib/utils';
import type { LogEntry, LogLevel, LogsPreset, UiHighlightRule } from '@/types';
import type { StreamStatus } from '@/lib/api/types';
import { useApi } from '@/lib/api';
import { selectServerLogLevel, traceConfirmationWarnings } from '@/lib/server-log-level';
import { useTheme } from '@/contexts/ThemeContext';
import { useLayout } from '@/contexts/LayoutContext';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useT } from '@/i18n';
import '@/styles/console-pages.css';

// Dedicated log-level text tokens (see index.css): the app accent colors are
// too light as small text on the light canvas (WCAG AA fails), so these hit
// >=4.5:1 in light mode while keeping the bright values in dark. trace stays the
// faintest level (dimmer than debug) but at /90 it now also clears AA.
const levelClass: Record<LogLevel, string> = {
    trace: 'text-muted-foreground/90',
    debug: 'text-muted-foreground',
    info: 'text-log-info',
    success: 'text-log-success',
    warn: 'text-log-warn',
    error: 'text-log-error',
};

const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'success', 'warn', 'error'];

const STREAM_LABELS: Record<StreamStatus | 'connecting', readonly [string, string]> = {
    connecting: ['连接中', 'Connecting'],
    open: ['实时', 'Live'],
    reconnecting: ['重连中', 'Reconnecting'],
    closed: ['已断开', 'Disconnected'],
};

// View presets bundle the display prefs (levels/maxLines/autoScroll/wrap). The
// server stores only the id; 'custom' (any hand-tuned state) has no bundle.
interface PresetBundle {
    visibleLevels: LogLevel[];
    maxLines: number;
    autoScroll: boolean;
    wrap: boolean;
}
const LOG_PRESETS: {
    id: Exclude<LogsPreset, 'custom'>;
    label: [string, string];
    hint: [string, string];
    bundle: PresetBundle;
}[] = [
    {
        id: 'dev',
        label: ['开发', 'Development'],
        hint: ['全部级别 · 2000 行 · 换行', 'All levels · 2,000 lines · Wrap'],
        bundle: { visibleLevels: [...LEVELS], maxLines: 2000, autoScroll: true, wrap: true },
    },
    {
        id: 'ops',
        label: ['运维', 'Operations'],
        hint: ['INFO 以上 · 1000 行', 'INFO and above · 1,000 lines'],
        bundle: {
            visibleLevels: ['info', 'success', 'warn', 'error'],
            maxLines: 1000,
            autoScroll: true,
            wrap: false,
        },
    },
    {
        id: 'minimal',
        label: ['精简', 'Minimal'],
        hint: ['仅 WARN/ERROR · 500 行', 'WARN and ERROR only · 500 lines'],
        bundle: { visibleLevels: ['warn', 'error'], maxLines: 500, autoScroll: true, wrap: false },
    },
];

// Highlight palette — keyword rules tint a matching row. Stored as an id.
const HIGHLIGHT_COLORS: { id: string; label: [string, string]; swatch: string }[] = [
    { id: 'amber', label: ['琥珀', 'Amber'], swatch: '#f59e0b' },
    { id: 'rose', label: ['玫瑰', 'Rose'], swatch: '#f43f5e' },
    { id: 'emerald', label: ['翡翠', 'Emerald'], swatch: '#10b981' },
    { id: 'sky', label: ['天蓝', 'Sky blue'], swatch: '#38bdf8' },
    { id: 'violet', label: ['紫', 'Violet'], swatch: '#8b5cf6' },
];
const colorSwatch = (id: string) => HIGHLIGHT_COLORS.find((c) => c.id === id)?.swatch ?? '#f59e0b';

function matchHighlight(message: string, rules: UiHighlightRule[]): string | null {
    if (rules.length === 0) {
        return null;
    }

    const m = message.toLowerCase();

    for (const r of rules) {
        if (r.keyword && m.includes(r.keyword.toLowerCase())) {
            return colorSwatch(r.color);
        }
    }

    return null;
}

// Short toolbar operations share the canonical bounded glass button.
interface ToolButtonProps {
    label: string;
    onClick: () => void;
    children: ReactNode;
    active?: boolean;
    danger?: boolean;
    disabled?: boolean;
    tutorialControl?: 'log-export-trace';
}

function ToolButton({
    label,
    onClick,
    children,
    active,
    danger,
    disabled,
    tutorialControl,
}: ToolButtonProps) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant={danger ? 'ghost' : 'glass'}
                    size="icon"
                    onClick={onClick}
                    disabled={disabled}
                    aria-label={label}
                    aria-pressed={active}
                    data-tutorial-control={tutorialControl}
                    className={cn(
                        'cp-log-tool',
                        active && 'text-foreground',
                        danger && 'text-muted-foreground hover:text-destructive',
                    )}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function LogsPage() {
    const t = useT();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const { formatClock } = useTheme();
    const reduced = useReducedMotionConfig();
    const { pages, setPages } = useLayout();
    const prefs = pages.logs;
    const presetId = useId();
    const traceWarnings = useMemo(() => traceConfirmationWarnings(t), [t]);

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [logsReady, setLogsReady] = useState(false);
    const [logsFailure, setLogsFailure] = useState<{ detail?: string } | null>(null);
    const [streamStatus, setStreamStatus] = useState<StreamStatus | 'connecting'>('connecting');
    const [filter, setFilter] = useState('');
    const [confirmClear, setConfirmClear] = useState(false);
    const [serverLevel, setServerLevel] = useState<LogLevel | null>(null);
    const [serverLevelReady, setServerLevelReady] = useState(false);
    const [levelFailure, setLevelFailure] = useState<{
        kind: 'read' | 'update';
        detail?: string;
    } | null>(null);
    const [levelBusy, setLevelBusy] = useState(false);
    const [confirmTrace, setConfirmTrace] = useState(false);
    const [traceExportBusy, setTraceExportBusy] = useState(false);
    const [traceExportFailure, setTraceExportFailure] = useState<{ detail?: string } | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [newKeyword, setNewKeyword] = useState('');
    const [newColor, setNewColor] = useState(HIGHLIGHT_COLORS[0].id);
    const pageRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);
    const [workspaceViewport, setWorkspaceViewport] = useState<HTMLElement | null>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const [pageVisible, setPageVisible] = useState(
        () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    );

    const logsError =
        logsFailure &&
        (logsFailure.detail
            ? t(logsFailure.detail, `Failed to load logs: ${logsFailure.detail}`)
            : t('加载日志失败', 'Failed to load logs'));
    const levelError =
        levelFailure &&
        (levelFailure.kind === 'read'
            ? levelFailure.detail
                ? t(
                      levelFailure.detail,
                      `Failed to read the server log level: ${levelFailure.detail}`,
                  )
                : t('加载服务端日志级别失败', 'Failed to read the server log level')
            : levelFailure.detail
              ? t(
                    levelFailure.detail,
                    `Failed to update the server log level: ${levelFailure.detail}`,
                )
              : t('日志级别更新失败', 'Failed to update the server log level'));
    const traceExportError =
        traceExportFailure &&
        (traceExportFailure.detail
            ? t(traceExportFailure.detail, `Failed to export TRACE: ${traceExportFailure.detail}`)
            : t('TRACE 导出失败', 'Failed to export TRACE'));

    // maxLines is read through a ref so changing it doesn't re-subscribe the SSE.
    const maxLines = prefs.maxLines;
    const maxLinesRef = useRef(maxLines);
    useEffect(() => {
        maxLinesRef.current = maxLines;
    }, [maxLines]);

    const enabled = useMemo(
        () => new Set(prefs.visibleLevels as LogLevel[]),
        [prefs.visibleLevels],
    );

    const loadLogs = useCallback(async () => {
        setLogsFailure(null);

        try {
            // Backfill is capped at the server's ring-buffer size (1000); `maxLines`
            // can exceed that, but only the live SSE stream grows the view past 1000.
            setLogs(await api.logs.list(Math.min(1000, maxLinesRef.current)));
        } catch (e) {
            console.error('logs', e);
            setLogsFailure({ detail: e instanceof Error ? e.message : undefined });
        } finally {
            setLogsReady(true);
        }
    }, [api]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    const loadServerLevel = useCallback(async () => {
        setServerLevelReady(false);
        setLevelFailure(null);

        try {
            const { level } = await api.logs.getLevel();
            setServerLevel(level);
        } catch (error) {
            console.error('get server log level failed', error);
            setLevelFailure({
                kind: 'read',
                detail: error instanceof Error ? error.message : undefined,
            });
        } finally {
            setServerLevelReady(true);
        }
    }, [api]);

    useEffect(() => {
        void loadServerLevel();
    }, [loadServerLevel]);

    const applyServerLevel = useCallback(
        async (lv: LogLevel) => {
            if (lv === serverLevel || levelBusy) {
                return;
            }

            setLevelBusy(true);
            setLevelFailure(null);

            try {
                const { level } = await runAction(
                    {
                        title: t('正在更新服务端日志级别', 'Updating the server log level'),
                        detail: t(`切换为 ${lv.toUpperCase()}`, `Switching to ${lv.toUpperCase()}`),
                        successTitle: t('日志级别已更新', 'Server log level updated'),
                        successDetail: t(
                            `${lv.toUpperCase()} 已生效`,
                            `${lv.toUpperCase()} is active`,
                        ),
                        errorTitle: t('日志级别更新失败', 'Failed to update the server log level'),
                    },
                    () => api.logs.setLevel(lv),
                );
                setServerLevel(level);
            } catch (err) {
                console.error('setLevel', err);
                setLevelFailure({
                    kind: 'update',
                    detail: err instanceof Error ? err.message : undefined,
                });
            } finally {
                setLevelBusy(false);
            }
        },
        [api, serverLevel, levelBusy, runAction, t],
    );

    const changeServerLevel = useCallback(
        (lv: LogLevel) => {
            if (levelBusy) {
                return;
            }

            selectServerLogLevel({
                currentLevel: serverLevel,
                nextLevel: lv,
                applyLevel: (level) => void applyServerLevel(level),
                requestTraceConfirmation: () => setConfirmTrace(true),
            });
        },
        [applyServerLevel, levelBusy, serverLevel],
    );

    useEffect(() => {
        // Batch incoming lines: buffer in a ref and flush on a ~80ms timer instead
        // of a per-line setState. Under a high log rate this turns N O(n) array
        // copies + N React commits per window into one. Dedup-by-id and the
        // maxLines cap are preserved (a reconnect can replay recent ids).
        let pending: LogEntry[] = [];
        let flushTimer: number | null = null;

        const flush = () => {
            flushTimer = null;

            if (pending.length === 0) {
                return;
            }

            const batchMap = new Map(pending.map((e) => [e.id, e] as const));
            pending = [];

            setLogs((prev) => {
                const kept = prev.length ? prev.filter((it) => !batchMap.has(it.id)) : prev;
                const merged = kept.length
                    ? [...kept, ...batchMap.values()]
                    : [...batchMap.values()];
                return merged.length > maxLinesRef.current
                    ? merged.slice(-maxLinesRef.current)
                    : merged;
            });
        };

        const dispose = api.logs.stream({
            onLine: (entry) => {
                pending.push(entry);

                if (flushTimer == null) {
                    flushTimer = window.setTimeout(flush, 80);
                }
            },
            onStatus: setStreamStatus,
        });

        return () => {
            dispose();

            if (flushTimer != null) {
                clearTimeout(flushTimer);
            }
        };
    }, [api]);

    const filtered = useMemo(() => {
        const f = filter.trim().toLowerCase();
        const capped = logs.slice(-maxLines);
        return capped.filter((l) => {
            if (!enabled.has(l.level)) {
                return false;
            }

            if (!f) {
                return true;
            }

            return (
                l.message.toLowerCase().includes(f) ||
                l.scope.toLowerCase().includes(f) ||
                l.level.toLowerCase().includes(f) ||
                (l.req !== undefined && String(l.req).includes(f))
            );
        });
    }, [logs, filter, enabled, maxLines]);

    // The workspace owns the only scrolling viewport. The list starts below the
    // document controls, so its virtual offsets include that measured margin.
    useLayoutEffect(() => {
        const viewport = document.querySelector<HTMLElement>(
            '#workspace-content [data-radix-scroll-area-viewport]',
        );
        const page = pageRef.current;

        if (!viewport || !page) {
            return;
        }

        setWorkspaceViewport(viewport);

        const updateMargin = () => {
            const list = listRef.current;

            if (!list) {
                return;
            }

            const offset =
                list.getBoundingClientRect().top -
                viewport.getBoundingClientRect().top +
                viewport.scrollTop;
            setScrollMargin((current) => (Math.abs(current - offset) < 0.5 ? current : offset));
        };

        updateMargin();
        const observer = new ResizeObserver(updateMargin);
        observer.observe(viewport);
        observer.observe(page);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    // Virtualize the log rows: only the visible window (+overscan) is mounted, so
    // the DOM stays at a few dozen nodes regardless of how many lines the view
    // holds. Rows are dynamically measured (measureElement) so wrap mode's
    // variable-height lines are handled without a fixed row-height assumption.
    const rowVirtualizer = useVirtualizer({
        count: filtered.length,
        getScrollElement: () => workspaceViewport,
        scrollMargin,
        estimateSize: () => 28,
        overscan: 12,
        // Key the size cache by row id, not index: the list is front-dropped at the
        // maxLines cap, so every surviving row's index shifts down each flush. Keying
        // by id keeps each measured height with its content (and matches the React
        // key), avoiding a one-frame height mis-attribution on off-screen rows.
        getItemKey: (index) => filtered[index]?.id ?? index,
    });

    // Toggling wrap changes every row's height — force a clean re-measure so the
    // cached sizes don't leave gaps/overlaps.
    useEffect(() => {
        rowVirtualizer.measure();
    }, [prefs.wrap, rowVirtualizer]);

    // Follow the tail while auto-scroll is on. Re-run on anything that changes the
    // visible set or row heights (new logs, filter/level/maxLines → filtered.length,
    // wrap → heights), not just new logs. Freshly-appended rows still carry the
    // estimate on this pass, so a second pin on the next frame (after ResizeObserver
    // measures them) reaches the true bottom in wrap mode.
    useEffect(() => {
        if (!prefs.autoScroll || !pageVisible || !workspaceViewport || filtered.length === 0) {
            return;
        }

        const last = filtered.length - 1;

        const pinTail = () => {
            if (document.visibilityState !== 'hidden') {
                rowVirtualizer.scrollToIndex(last, { align: 'end' });
            }
        };

        pinTail();
        const raf = requestAnimationFrame(pinTail);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        logs,
        filtered.length,
        prefs.autoScroll,
        prefs.wrap,
        pageVisible,
        workspaceViewport,
        scrollMargin,
    ]);

    // Any hand edit to the bundled prefs drops the active preset to 'custom'.
    const toggleLevel = (lv: LogLevel) => {
        const next = new Set(enabled);

        if (next.has(lv)) {
            next.delete(lv);
        } else {
            next.add(lv);
        }

        setPages({
            logs: { ...prefs, visibleLevels: LEVELS.filter((l) => next.has(l)), preset: 'custom' },
        });
    };

    const clearFilters = useCallback(() => {
        setFilter('');
        setPages({ logs: { ...prefs, visibleLevels: [...LEVELS], preset: 'custom' } });
    }, [prefs, setPages]);

    const applyPreset = useCallback(
        (p: (typeof LOG_PRESETS)[number]) => {
            setPages({ logs: { ...prefs, ...p.bundle, preset: p.id } });
        },
        [prefs, setPages],
    );

    // Dump the current (filtered) view to a .log text file — purely client-side.
    const exportLogs = useCallback(() => {
        if (filtered.length === 0) {
            return;
        }

        const lines = filtered.map((l) =>
            sanitizeLogLine(
                l.line || `${l.time} ${l.level.toUpperCase().padEnd(7)} [${l.scope}] ${l.message}`,
            ),
        );
        const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadBlob(blob, `nowluma-logs-${ts}.log`);
    }, [filtered]);

    const exportFullTrace = useCallback(async () => {
        if (traceExportBusy) {
            return;
        }

        setTraceExportBusy(true);
        setTraceExportFailure(null);

        try {
            const { text, filename } = await runAction(
                {
                    title: t('正在导出完整 TRACE', 'Exporting the full TRACE log'),
                    detail: t(
                        '正在读取服务端 TRACE 文件',
                        'Reading the TRACE file from the server',
                    ),
                    successTitle: t('完整 TRACE 已导出', 'Full TRACE log exported'),
                    errorTitle: t('TRACE 导出失败', 'Failed to export TRACE'),
                },
                () => api.logs.exportTrace(),
            );
            downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);
        } catch (err) {
            console.error('exportTrace', err);
            setTraceExportFailure({ detail: err instanceof Error ? err.message : undefined });
        } finally {
            setTraceExportBusy(false);
        }
    }, [api, traceExportBusy, runAction, t]);

    const addHighlight = () => {
        const kw = newKeyword.trim();

        if (!kw) {
            return;
        }

        setPages({
            logs: {
                ...prefs,
                highlightRules: [...prefs.highlightRules, { keyword: kw, color: newColor }].slice(
                    0,
                    20,
                ),
            },
        });
        setNewKeyword('');
    };

    const removeHighlight = (idx: number) => {
        setPages({
            logs: { ...prefs, highlightRules: prefs.highlightRules.filter((_, i) => i !== idx) },
        });
    };

    const live = streamStatus === 'open';
    const connecting = streamStatus === 'connecting' || streamStatus === 'reconnecting';
    const levelsFiltered = enabled.size < LEVELS.length;

    return (
        <div ref={pageRef} className="cp-page cp-logs-page">
            <header className="cp-document-header">
                <div className="cp-toolbar">
                    <div className="min-w-0">
                        <h2 className="cp-page-heading">{t('运行日志', 'Runtime logs')}</h2>
                        <p className="cp-lede">
                            {t(
                                '读取实时输出；筛选、暂停跟随与清空只影响当前视图。',
                                'Read live output. Filtering, pausing auto-scroll, and clearing affect only this view.',
                            )}
                        </p>
                    </div>
                    <div className="cp-runtime-context">
                        <span className="inline-flex items-center gap-2" role="status">
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'size-1.5 rounded-full',
                                    live
                                        ? 'bg-success'
                                        : connecting
                                          ? 'bg-warning'
                                          : 'bg-destructive',
                                )}
                            />
                            {t(...STREAM_LABELS[streamStatus])}
                        </span>
                        <span className="font-mono tabular-nums">
                            {t(
                                `${filtered.length} / ${logs.length} 条`,
                                `${filtered.length} / ${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`,
                            )}
                        </span>
                        {serverLevel && (
                            <span>
                                {t('服务端', 'Server')}{' '}
                                <span className={cn('font-mono', levelClass[serverLevel])}>
                                    {serverLevel.toUpperCase()}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
            </header>

            <section
                aria-label={t('日志工作区', 'Log workspace')}
                data-tutorial-control="log-workspace"
                className="cp-panel"
            >
                <div className="cp-log-controls">
                    <div className="cp-toolbar gap-2">
                        <GlassSurface className="ui-glass-search cp-search min-w-0 flex-1 basis-56">
                            <Search className="pointer-events-none size-4 shrink-0 text-popover-foreground" />
                            <Input
                                type="search"
                                data-tutorial-control="log-search"
                                aria-label={t(
                                    '搜索消息 / 模块 / 级别',
                                    'Search messages, modules, or levels',
                                )}
                                placeholder={t(
                                    '搜索消息 / 模块 / 级别',
                                    'Search messages, modules, or levels',
                                )}
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="min-w-0 flex-1 border-0 p-0 text-popover-foreground shadow-none placeholder:text-popover-foreground/80 focus-visible:ring-0"
                            />
                            {filter && (
                                <button
                                    type="button"
                                    onClick={() => setFilter('')}
                                    aria-label={t('清除搜索', 'Clear search')}
                                    className="cp-control -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                                >
                                    <X className="size-4" />
                                </button>
                            )}
                        </GlassSurface>
                        <div className="flex flex-wrap items-center gap-1">
                            <ToolButton
                                label={
                                    prefs.autoScroll
                                        ? t('自动滚动已开启', 'Auto-scroll on')
                                        : t('自动滚动已暂停', 'Auto-scroll paused')
                                }
                                active={prefs.autoScroll}
                                onClick={() =>
                                    setPages({
                                        logs: {
                                            ...prefs,
                                            autoScroll: !prefs.autoScroll,
                                            preset: 'custom',
                                        },
                                    })
                                }
                            >
                                {prefs.autoScroll ? <ArrowDownToLine /> : <Pause />}
                            </ToolButton>
                            <ToolButton
                                label={t('自动换行', 'Wrap lines')}
                                active={prefs.wrap}
                                onClick={() =>
                                    setPages({
                                        logs: { ...prefs, wrap: !prefs.wrap, preset: 'custom' },
                                    })
                                }
                            >
                                <WrapText />
                            </ToolButton>
                            <ToolButton
                                label={t('显示选项', 'Display options')}
                                active={showOptions}
                                onClick={() => setShowOptions((value) => !value)}
                            >
                                <SlidersHorizontal />
                            </ToolButton>
                            <Button
                                variant="glass"
                                size="sm"
                                aria-label={t('导出当前视图', 'Export current view')}
                                onClick={exportLogs}
                                disabled={filtered.length === 0}
                            >
                                <Download className="size-4" /> {t('导出视图', 'Export view')}
                            </Button>
                        </div>
                    </div>

                    <div className="cp-toolbar gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Filter
                                aria-hidden="true"
                                className={cn(
                                    'size-3.5 shrink-0',
                                    levelsFiltered ? 'text-foreground' : 'text-muted-foreground',
                                )}
                            />
                            <div
                                role="group"
                                aria-label={t('日志级别', 'Log levels')}
                                className="cp-log-levels"
                            >
                                {LEVELS.map((level) => (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => toggleLevel(level)}
                                        aria-pressed={enabled.has(level)}
                                        className={cn(
                                            'cp-level-toggle',
                                            enabled.has(level)
                                                ? levelClass[level]
                                                : 'text-muted-foreground',
                                        )}
                                    >
                                        {level.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                            <div
                                role="group"
                                aria-label={t('视图预设', 'View presets')}
                                className="flex flex-wrap"
                            >
                                {LOG_PRESETS.map((preset) => {
                                    const active = prefs.preset === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            aria-pressed={active}
                                            title={t(...preset.hint)}
                                            className="cp-catnav-item px-3 text-xs"
                                        >
                                            {active && (
                                                <motion.span
                                                    aria-hidden="true"
                                                    layoutId={
                                                        reduced
                                                            ? undefined
                                                            : `logs-preset-${presetId}`
                                                    }
                                                    className="cp-selection"
                                                    transition={
                                                        reduced
                                                            ? { duration: 0 }
                                                            : {
                                                                  duration: 0.42,
                                                                  ease: [0.16, 1, 0.3, 1],
                                                              }
                                                    }
                                                />
                                            )}
                                            <span className="relative">{t(...preset.label)}</span>
                                        </button>
                                    );
                                })}
                                {prefs.preset === 'custom' && (
                                    <span className="inline-flex min-h-11 items-center px-2 text-xs text-muted-foreground">
                                        {t('自定义', 'Custom')}
                                    </span>
                                )}
                            </div>
                            <ToolButton
                                label={t('刷新', 'Refresh')}
                                onClick={() => void loadLogs()}
                            >
                                <RefreshCw />
                            </ToolButton>
                            <ToolButton
                                label={t('导出完整 TRACE', 'Export full TRACE')}
                                tutorialControl="log-export-trace"
                                onClick={() => void exportFullTrace()}
                                disabled={traceExportBusy}
                            >
                                <ArrowDownToLine />
                            </ToolButton>
                            <ToolButton
                                label={t('清空视图', 'Clear view')}
                                danger
                                onClick={() => setConfirmClear(true)}
                            >
                                <Trash2 />
                            </ToolButton>
                        </div>
                    </div>
                    {logsReady && filtered.length > 0 && (
                        <div aria-hidden="true" className="cp-log-columns">
                            <span>{t('时间', 'Time')}</span>
                            <span>{t('级别', 'Level')}</span>
                            <span>{t('模块', 'Module')}</span>
                            <span>{t('消息', 'Message')}</span>
                        </div>
                    )}
                </div>

                {traceExportError && (
                    <p role="alert" className="cp-inline-notice text-destructive">
                        {traceExportError}
                    </p>
                )}
                {serverLevel === 'trace' && (
                    <div className="cp-inline-notice flex-wrap text-destructive">
                        <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
                        <p className="min-w-0 flex-1 text-xs font-medium">
                            {t(
                                'TRACE 已开启：正在记录大量、可能未经脱敏的数据',
                                'TRACE is on and may record large amounts of unredacted data.',
                            )}
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={levelBusy}
                            onClick={() => void applyServerLevel('info')}
                        >
                            {t('恢复 INFO', 'Restore INFO')}
                        </Button>
                    </div>
                )}

                <AnimatePresence initial={false}>
                    {showOptions && (
                        <motion.div
                            key="options"
                            initial={reduced ? false : { height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="cp-log-options">
                                <section className="flex min-w-0 flex-col gap-2">
                                    <h3 className="text-sm font-semibold">
                                        {t('服务端日志级别', 'Server log level')}
                                    </h3>
                                    <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                                        {t(
                                            '普通日志仅影响控制台与实时流；首次登录凭据仅输出到启动终端。 文件等级由环境变量决定，默认为 debug。',
                                            'This level affects only the console and live stream. First sign-in credentials appear only in the startup terminal. The file log level defaults to DEBUG and is set by an environment variable.',
                                        )}
                                    </p>
                                    <SkeletonSwap
                                        ready={serverLevelReady}
                                        reserve={44}
                                        lines={1}
                                        lineHeight={44}
                                        barHeight={8}
                                        label={t('服务端日志级别', 'Server log level')}
                                        className={
                                            serverLevelReady
                                                ? 'skeleton-swap-fluid'
                                                : 'w-72 max-w-full'
                                        }
                                    >
                                        {serverLevelReady ? (
                                            levelError ? (
                                                <div
                                                    role="alert"
                                                    className="flex flex-wrap items-center gap-2 text-xs text-destructive"
                                                >
                                                    <span>{levelError}</span>
                                                    <Button
                                                        variant="glass"
                                                        size="sm"
                                                        onClick={() => void loadServerLevel()}
                                                    >
                                                        {t('重试', 'Retry')}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div
                                                    role="group"
                                                    aria-label={t(
                                                        '服务端日志级别',
                                                        'Server log level',
                                                    )}
                                                    className="cp-log-levels"
                                                >
                                                    {LEVELS.map((level) => (
                                                        <button
                                                            key={level}
                                                            type="button"
                                                            onClick={() => changeServerLevel(level)}
                                                            disabled={
                                                                levelBusy || serverLevel === null
                                                            }
                                                            aria-pressed={serverLevel === level}
                                                            className={cn(
                                                                'cp-level-toggle',
                                                                serverLevel === level
                                                                    ? levelClass[level]
                                                                    : 'text-muted-foreground',
                                                            )}
                                                        >
                                                            {level.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            )
                                        ) : null}
                                    </SkeletonSwap>
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            `当前浏览器最多保留 ${maxLines} 行，可通过视图预设切换。`,
                                            `The browser keeps up to ${maxLines} lines. Change the limit with a view preset.`,
                                        )}
                                    </p>
                                </section>

                                <section className="flex min-w-0 flex-col gap-2">
                                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                                        <Highlighter
                                            aria-hidden="true"
                                            className="size-3.5 text-muted-foreground"
                                        />
                                        {t('高亮规则', 'Highlight rules')}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            '命中关键词的行会被着色。',
                                            'Lines that match a keyword are highlighted.',
                                        )}
                                    </p>
                                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <Input
                                            aria-label={t('高亮关键词', 'Highlight keyword')}
                                            placeholder={t('高亮关键词', 'Highlight keyword')}
                                            value={newKeyword}
                                            maxLength={50}
                                            onChange={(event) => setNewKeyword(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    addHighlight();
                                                }
                                            }}
                                            className="w-52 max-w-full"
                                        />
                                        <div
                                            className="flex flex-wrap gap-1"
                                            role="radiogroup"
                                            aria-label={t('高亮颜色', 'Highlight color')}
                                        >
                                            {HIGHLIGHT_COLORS.map((color) => (
                                                <button
                                                    key={color.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={newColor === color.id}
                                                    onClick={() => setNewColor(color.id)}
                                                    title={t(...color.label)}
                                                    aria-label={t(...color.label)}
                                                    className={cn(
                                                        'cp-control flex items-center justify-center rounded-full',
                                                        newColor === color.id && 'ring-2 ring-ring',
                                                    )}
                                                >
                                                    <span
                                                        className="size-5 rounded-full"
                                                        style={{ backgroundColor: color.swatch }}
                                                    />
                                                </button>
                                            ))}
                                        </div>
                                        <Button
                                            variant="glass"
                                            size="sm"
                                            onClick={addHighlight}
                                            disabled={!newKeyword.trim()}
                                        >
                                            <Plus className="size-3.5" /> {t('添加', 'Add')}
                                        </Button>
                                    </div>
                                    {prefs.highlightRules.length > 0 && (
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {prefs.highlightRules.map((rule, index) => (
                                                <span
                                                    key={index}
                                                    className="inline-flex min-w-0 items-center gap-2 text-xs"
                                                >
                                                    <span
                                                        className="size-2 shrink-0 rounded-full"
                                                        style={{
                                                            backgroundColor: colorSwatch(
                                                                rule.color,
                                                            ),
                                                        }}
                                                    />
                                                    <span className="break-words">
                                                        {rule.keyword}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeHighlight(index)}
                                                        className="cp-control inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                                                        aria-label={t(
                                                            `移除高亮规则 ${rule.keyword}`,
                                                            `Remove highlight rule ${rule.keyword}`,
                                                        )}
                                                    >
                                                        <X className="size-3.5" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {logsReady && logsError && logs.length > 0 && (
                    <p role="alert" className="cp-inline-notice text-destructive">
                        {t(
                            `${logsError}；当前显示已读取和实时接收的日志。`,
                            `${logsError} Showing previously loaded and live entries.`,
                        )}
                    </p>
                )}
                <div
                    ref={listRef}
                    role="region"
                    aria-label={t('日志内容', 'Log entries')}
                    data-tutorial-control="log-entries"
                    tabIndex={0}
                    className="cp-log-content"
                >
                    <SkeletonSwap
                        ready={logsReady}
                        reserve={240}
                        lines={8}
                        lineHeight={30}
                        barHeight={10}
                        label={t('运行日志', 'Runtime logs')}
                        className={logsReady ? 'skeleton-swap-fluid min-h-60' : ''}
                    >
                        {logsReady ? (
                            <div className="min-w-0 font-mono text-[13px]">
                                {logsError && logs.length === 0 ? (
                                    <div
                                        role="alert"
                                        className="cp-empty-state font-sans text-destructive"
                                    >
                                        <TriangleAlert className="size-7" />
                                        <p className="break-words">{logsError}</p>
                                        <Button
                                            variant="glass"
                                            size="sm"
                                            onClick={() => void loadLogs()}
                                        >
                                            <RefreshCw className="size-3.5" /> {t('重试', 'Retry')}
                                        </Button>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className="cp-empty-state font-sans text-muted-foreground">
                                        {logs.length === 0 ? (
                                            <>
                                                <Inbox className="size-7" />
                                                <p>{t('暂无日志', 'No logs yet')}</p>
                                            </>
                                        ) : (
                                            <>
                                                <SearchX className="size-7" />
                                                <p>
                                                    {t(
                                                        '没有符合筛选条件的日志',
                                                        'No entries match the filters',
                                                    )}
                                                </p>
                                                <Button
                                                    variant="glass"
                                                    size="sm"
                                                    onClick={clearFilters}
                                                >
                                                    {t('清除筛选', 'Clear filters')}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        className="relative w-full"
                                        style={{ height: rowVirtualizer.getTotalSize() }}
                                    >
                                        {rowVirtualizer.getVirtualItems().map((row) => {
                                            const log = filtered[row.index];

                                            if (!log) {
                                                return null;
                                            }

                                            const highlight = matchHighlight(
                                                log.message,
                                                prefs.highlightRules,
                                            );
                                            return (
                                                <div
                                                    key={log.id}
                                                    data-index={row.index}
                                                    ref={rowVirtualizer.measureElement}
                                                    className="absolute left-0 w-full"
                                                    style={{ top: row.start - scrollMargin }}
                                                >
                                                    <div
                                                        className="cp-log-row"
                                                        style={
                                                            highlight
                                                                ? {
                                                                      boxShadow: `inset 3px 0 0 ${highlight}`,
                                                                      backgroundColor: `color-mix(in oklab, ${highlight} 8%, transparent)`,
                                                                  }
                                                                : undefined
                                                        }
                                                    >
                                                        <div className="cp-log-meta">
                                                            <span className="cp-log-time text-muted-foreground tabular-nums">
                                                                {formatClock(log.time)}
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'cp-log-level font-medium',
                                                                    levelClass[log.level],
                                                                )}
                                                            >
                                                                {log.level.toUpperCase()}
                                                            </span>
                                                            <span className="cp-log-scope text-muted-foreground">
                                                                [{log.scope}]
                                                            </span>
                                                        </div>
                                                        <span
                                                            className={cn(
                                                                'cp-log-message',
                                                                prefs.wrap
                                                                    ? 'whitespace-pre-wrap break-all'
                                                                    : 'truncate',
                                                            )}
                                                            title={
                                                                prefs.wrap ? undefined : log.message
                                                            }
                                                        >
                                                            {log.req !== undefined && (
                                                                <span
                                                                    className="mr-1.5 text-xs text-muted-foreground tabular-nums"
                                                                    title={t(
                                                                        '请求关联号',
                                                                        'Request correlation ID',
                                                                    )}
                                                                >
                                                                    #{log.req}
                                                                </span>
                                                            )}
                                                            {log.message}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </SkeletonSwap>
                </div>
            </section>

            <ConfirmDialog
                open={confirmTrace}
                onOpenChange={setConfirmTrace}
                title={t('开启 TRACE 日志？', 'Enable TRACE logging?')}
                description={
                    <div className="space-y-2">
                        <p>{t('开启前请确认：', 'Before enabling TRACE:')}</p>
                        <ul className="list-disc space-y-1 pl-5">
                            {traceWarnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    </div>
                }
                confirmText={t('开启 TRACE', 'Enable TRACE')}
                destructive
                onConfirm={() => applyServerLevel('trace')}
            />

            <ConfirmDialog
                open={confirmClear}
                onOpenChange={setConfirmClear}
                title={t('清空当前日志视图？', 'Clear the current log view?')}
                description={t(
                    '此操作仅清空浏览器视图中的日志，不会影响服务端的日志缓冲区。',
                    'This clears only the logs shown in this browser. It does not affect the server log buffer.',
                )}
                confirmText={t('清空', 'Clear')}
                destructive
                activity={{
                    title: t('正在清空日志视图', 'Clearing the log view'),
                    successTitle: t('日志视图已清空', 'Log view cleared'),
                    errorTitle: t('日志视图清空失败', 'Failed to clear the log view'),
                }}
                onConfirm={() => setLogs([])}
            />
        </div>
    );
}
