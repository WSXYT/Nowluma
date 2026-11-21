// Per-account opt-in to the GLOBAL notification channels. Renders the channels
// defined in 设置 → 通知 as toggles; the selection maps to
// OneBotConfig.notifications.channelIds. Lives inside the account's 通用设置 tab,
// so toggling marks the config dirty and rides the parent's debounced autosave.
//
// Collapsed by default to a summary; expansion adds searchable channel rows
// in the main document scroll flow.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { ChevronDown, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Input } from '@/components/ui/input';
import { GlassSurface } from '@/components/ui/glass-material';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { NotificationChannel } from '@/types';

interface NotificationOptInProps {
    selectedIds: string[];
    onChange: (channelIds: string[]) => void;
}

/** How many summary chips to show before collapsing the rest into "+N". */
const CHIP_CAP = 8;

export function NotificationOptIn({ selectedIds, onChange }: NotificationOptInProps) {
    const t = useT();
    const api = useApi();
    const reduced = useReducedMotionConfig();
    const [channels, setChannels] = useState<NotificationChannel[] | null>(null);
    const [loadError, setLoadError] = useState<{ message: string | null } | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setChannels(null);
        setLoadError(null);

        try {
            const cfg = await api.notifications.getConfig();
            setChannels(cfg.channels);
        } catch (error) {
            console.error('load notification opt-ins failed', error);
            setLoadError({ message: error instanceof Error ? error.message : null });
            setChannels([]);
        }
    }, [api]);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

    const toggle = (id: string, on: boolean) => {
        const set = new Set(selectedIds);

        if (on) {
            set.add(id);
        } else {
            set.delete(id);
        }

        // Order known channels by the global list; keep any stale ids (channel
        // deleted globally but still opted-in) at the end rather than dropping them.
        const known = (channels ?? []).map((c) => c.id).filter((cid) => set.has(cid));
        const extra = selectedIds.filter((sid) => set.has(sid) && !known.includes(sid));
        onChange([...known, ...extra]);
    };

    const selectAll = () => {
        // Only enabled channels can ever fire, so "全选" maps to those.
        onChange((channels ?? []).filter((c) => c.enabled).map((c) => c.id));
    };

    const clearAll = () => onChange([]);

    // Resolve the selected ids back to channels for the collapsed chip summary.
    // Stale ids (channel deleted globally) fall back to showing the raw id.
    const selectedChips = useMemo(() => {
        const byId = new Map((channels ?? []).map((c) => [c.id, c]));
        return selectedIds.map((id) => ({ id, name: byId.get(id)?.name || id }));
    }, [channels, selectedIds]);

    const filtered = useMemo(() => {
        const list = channels ?? [];
        const q = query.trim().toLowerCase();

        if (!q) {
            return list;
        }

        return list.filter((c) => {
            const hay = [c.name, c.id, c.url, c.smtpHost, c.to, c.from]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [channels, query]);

    const total = channels?.length ?? 0;
    const selectedCount = selectedIds.length;

    return (
        <section className="cp-settings-group">
            {/* header — toggles the editor open/closed */}
            <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center justify-between gap-3 text-left"
            >
                <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                    <h3 className="text-[15px] font-semibold">
                        {t('上下线通知渠道', 'Online and offline notifications')}
                    </h3>
                    {channels !== null && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {t(
                                `已选 ${selectedCount} / 共 ${total}`,
                                `${selectedCount} of ${total} selected`,
                            )}
                        </span>
                    )}
                </div>
                <ChevronDown
                    className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                        expanded && 'rotate-180',
                    )}
                />
            </button>

            <SkeletonSwap
                ready={channels !== null}
                lines={2}
                lineHeight={20}
                reserve={40}
                label={t('通知渠道', 'Notification channels')}
                className={channels !== null ? 'skeleton-swap-fluid min-h-[40px]' : ''}
            >
                {channels !== null ? (
                    loadError ? (
                        <div
                            role="alert"
                            className="flex items-center justify-between gap-3 text-xs text-destructive"
                        >
                            <span>
                                {loadError.message ??
                                    t('加载通知渠道失败', 'Could not load notification channels')}
                            </span>
                            <Button variant="glass" size="sm" onClick={() => void load()}>
                                {t('重试', 'Retry')}
                            </Button>
                        </div>
                    ) : total === 0 ? (
                        <p className="text-xs text-muted-foreground">
                            {t(
                                '还没有全局渠道——先到「设置 → 通知」添加。',
                                'No global notification channels yet. Add one in Settings → Notifications.',
                            )}
                        </p>
                    ) : (
                        <>
                            {/* collapsed: selected channels as removable chips */}
                            {!expanded &&
                                (selectedCount === 0 ? (
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            '未选择任何渠道。展开以选择。',
                                            'No channels selected. Expand to choose channels.',
                                        )}
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {selectedChips.slice(0, CHIP_CAP).map((ch) => (
                                            <Badge
                                                key={ch.id}
                                                variant="secondary"
                                                className="max-w-[12rem] pr-1"
                                            >
                                                <span className="truncate">{ch.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => toggle(ch.id, false)}
                                                    aria-label={t(
                                                        `移除 ${ch.name}`,
                                                        `Remove ${ch.name}`,
                                                    )}
                                                    className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
                                                >
                                                    <X className="size-3" />
                                                </button>
                                            </Badge>
                                        ))}
                                        {selectedCount > CHIP_CAP && (
                                            <button
                                                type="button"
                                                onClick={() => setExpanded(true)}
                                                className="rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {t(
                                                    `+${selectedCount - CHIP_CAP} 更多`,
                                                    `+${selectedCount - CHIP_CAP} more`,
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ))}

                            {/* expanded: search + bulk actions + document rows */}
                            <AnimatePresence initial={false}>
                                {expanded && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: reduced ? 0 : 0.22 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="flex flex-col gap-3 pt-1">
                                            <p className="text-xs leading-relaxed text-muted-foreground">
                                                {t(
                                                    '该账号上线 / 下线时向选中的渠道推送通知。渠道在「设置 → 通知」中全局定义。',
                                                    'Send notifications to the selected channels when this account goes online or offline. Channels are configured globally in Settings → Notifications.',
                                                )}
                                            </p>

                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <GlassSurface className="ui-glass-search cp-search min-w-0 flex-1 basis-48">
                                                    <Search className="size-3.5 shrink-0 text-muted-foreground" />
                                                    <Input
                                                        aria-label={t(
                                                            '搜索通知渠道',
                                                            'Search notification channels',
                                                        )}
                                                        value={query}
                                                        onChange={(e) => setQuery(e.target.value)}
                                                        placeholder={t(
                                                            '搜索渠道…',
                                                            'Search channels…',
                                                        )}
                                                        className="min-w-0 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
                                                    />
                                                </GlassSurface>
                                                <Button
                                                    variant="glass"
                                                    size="sm"
                                                    onClick={selectAll}
                                                >
                                                    {t('全选', 'Select all')}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={clearAll}
                                                >
                                                    {t('清空选择', 'Clear selection')}
                                                </Button>
                                            </div>

                                            {filtered.length === 0 ? (
                                                <p className="py-4 text-center text-xs text-muted-foreground">
                                                    {t('无匹配渠道', 'No matching channels')}
                                                </p>
                                            ) : (
                                                <div className="cp-settings-rows divide-y divide-border/60">
                                                    {filtered.map((ch) => (
                                                        <div
                                                            key={ch.id}
                                                            className="flex min-w-0 items-center justify-between gap-3 py-3"
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="break-words text-sm">
                                                                        {ch.name || ch.id}
                                                                    </span>
                                                                    {!ch.enabled && (
                                                                        <span className="shrink-0 text-micro text-muted-foreground">
                                                                            {t(
                                                                                '（已全局禁用）',
                                                                                '(disabled globally)',
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="break-all text-meta text-muted-foreground">
                                                                    {ch.type === 'email'
                                                                        ? ch.to ||
                                                                          ch.smtpHost ||
                                                                          t('邮件', 'Email')
                                                                        : ch.url}
                                                                </p>
                                                            </div>
                                                            <ToggleSwitch
                                                                // Globally-disabled channel: lock the switch and force it off
                                                                // (it can never fire, so the per-account opt-in must read off).
                                                                value={
                                                                    ch.enabled &&
                                                                    selected.has(ch.id)
                                                                }
                                                                onChange={(v) => toggle(ch.id, v)}
                                                                ariaLabel={t(
                                                                    `为该账号启用渠道 ${ch.name || ch.id}`,
                                                                    `Enable ${ch.name || ch.id} for this account`,
                                                                )}
                                                                disabled={!ch.enabled}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </>
                    )
                ) : null}
            </SkeletonSwap>
        </section>
    );
}
