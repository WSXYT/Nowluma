import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { motion, Reorder, useDragControls, useReducedMotionConfig } from 'motion/react';
import { Link } from '@tanstack/react-router';
import {
    Activity,
    ArrowRight,
    Cable,
    Check,
    Cpu,
    ExternalLink,
    Eye,
    EyeOff,
    GripVertical,
    Info,
    LayoutGrid,
    MemoryStick,
    MonitorCog,
    Plus,
    Clock3,
    MessageCircle,
    PanelsTopLeft,
    Radio,
    RefreshCw,
    RotateCcw,
    Server,
    Settings2,
    Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GettingStartedPanel } from '@/components/overview/getting-started-panel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Modal } from '@/components/interior/modal';
import { cn, formatBytes, formatUptime } from '@/lib/utils';
import type { AppPath } from '@/router';
import type {
    AccountDatabaseMigration,
    AdapterStatus,
    AdapterStatusLevel,
    LogEntry,
    LogLevel,
    UiLayoutItem,
} from '@/types';
import { useApi } from '@/lib/api';
import { useAppState } from '@/contexts/AppStateContext';
import { useSession } from '@/contexts/SessionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
    CONFIGURABLE_WIDGETS,
    GRID_COLS,
    GRID_WIDGETS,
    HIDDEN_BY_DEFAULT_IDS,
    MOBILE_WIDGET_IDS,
    mobileHeightOf,
    parseAccountConfig,
    parseAlertsConfig,
    parseConnectionsConfig,
    parseHostConfig,
    parseLinkConfig,
    parseNoteConfig,
    parseSessionsConfig,
    widgetLabel,
    type AccountConfig,
    type AlertsConfig,
    type ConnectionsConfig,
    type HostConfig,
    type LinkConfig,
    type NoteConfig,
    type SessionsConfig,
} from '@/lib/dashboard-layout';
import { DashboardGrid, WIDGET_DRAG_TYPE, type GridCoord } from '@/components/pages/dashboard-grid';
import {
    AccountConfigForm,
    AlertsConfigForm,
    ConnectionsConfigForm,
    HostConfigForm,
    LinkConfigForm,
    LINK_ICON_COMPONENTS,
    NoteConfigForm,
    SessionsConfigForm,
} from '@/components/pages/widget-config-forms';
import { DeliveriesWidget } from '@/components/overview/deliveries-widget';
import { useLocale, useT, type Translate } from '@/i18n';

function qqAvatarUrl(uin: string) {
    return `/avatar/${encodeURIComponent(uin)}`;
}

function renderWidget(block: UiLayoutItem): ReactNode {
    if (block.id.startsWith('stat:')) {
        return <StatTileWidget id={block.id} />;
    }

    switch (block.id) {
        case 'connections':
            return <ConnectionsBlock config={parseConnectionsConfig(block.config)} />;
        case 'alerts':
            return <RecentAlertsCard config={parseAlertsConfig(block.config)} />;
        case 'host':
            return <HostBlock config={parseHostConfig(block.config)} />;
        case 'sessions':
            return <SessionsBlock config={parseSessionsConfig(block.config)} />;
        case 'note':
            return <NoteWidget config={parseNoteConfig(block.config)} />;
        case 'link':
            return <LinkWidget config={parseLinkConfig(block.config)} />;
        case 'account':
            return <AccountWidget config={parseAccountConfig(block.config)} />;
        case 'deliveries':
            return <DeliveriesWidget />;
        default:
            return null;
    }
}

export function OverviewPage() {
    const t = useT();
    const {
        overviewBlocks,
        setOverviewBlocks,
        overviewMobile,
        setOverviewMobile,
        resetLayout,
        editing,
        setEditing,
    } = useLayout();
    const isWide = useMediaQuery('(min-width: 768px)');
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    // Free-grid 2D editing is desktop-only; on a phone, editing surfaces a
    // single-column drag-sort panel (overviewMobile) instead.
    const [configId, setConfigId] = useState<string | null>(null);

    // The grid shows only visible widgets (Apple-widgets model); hidden ones live
    // in the gallery and are dragged in/out to add/remove.
    const visibleBlocks = useMemo(() => overviewBlocks.filter((b) => b.visible), [overviewBlocks]);
    const hiddenBlocks = useMemo(() => overviewBlocks.filter((b) => !b.visible), [overviewBlocks]);

    // Per-widget config lives on the desktop blocks; mobile widgets reuse it.
    const configById = useMemo(
        () => new Map(overviewBlocks.map((b) => [b.id, b.config])),
        [overviewBlocks],
    );
    // Reconcile the mobile order against the live widget catalogue (drop unknown,
    // append new as visible) — so a widget added later just appears on phones too.
    const mobileItems = useMemo(
        () => reconcileLayoutItems(overviewMobile, MOBILE_WIDGET_IDS, [], HIDDEN_BY_DEFAULT_IDS),
        [overviewMobile],
    );

    // Single writer for the grid: move/resize updates coords; a visible block no
    // longer present in the snapshot was dragged out to the gallery → hide it.
    const onGridChange = (coords: GridCoord[]) => {
        const cmap = new Map(coords.map((c) => [c.id, c]));
        setOverviewBlocks(
            overviewBlocks.map((b) => {
                if (!b.visible) {
                    return b;
                } // hidden (in the gallery) — leave untouched

                const c = cmap.get(b.id);

                if (c) {
                    return { ...b, x: c.x, y: c.y, w: c.w, h: c.h };
                }

                return { ...b, visible: false }; // was in the grid, now gone → removed
            }),
        );
    };

    // Add a widget dragged from the gallery at the dropped cell (catalogue size).
    const addWidget = (id: string, x: number, y: number) => {
        const spec = GRID_WIDGETS.find((w) => w.id === id);
        setOverviewBlocks(
            overviewBlocks.map((b) =>
                b.id === id
                    ? { ...b, visible: true, x, y, w: spec?.def.w ?? 3, h: spec?.def.h ?? 2 }
                    : b,
            ),
        );
    };

    const toggleMobile = (id: string) =>
        setOverviewMobile(
            mobileItems.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)),
        );

    const reorderMobile = (ids: string[]) => {
        const byId = new Map(mobileItems.map((i) => [i.id, i]));
        setOverviewMobile(ids.map((id) => byId.get(id)).filter((x): x is UiLayoutItem => !!x));
    };

    const setBlockConfig = (id: string, config: Record<string, unknown>) =>
        setOverviewBlocks(
            overviewBlocks.map((b) =>
                b.id === id ? { ...b, config: { ...b.config, ...config } } : b,
            ),
        );

    const configBlock = configId ? overviewBlocks.find((b) => b.id === configId) : null;

    return (
        <div className="workspace-overview">
            <motion.header
                className="workspace-overview-heading"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                    reduced
                        ? { duration: 0 }
                        : performance?.low
                          ? { duration: 0.18 }
                          : { duration: 0.32 }
                }
            >
                <div>
                    <h2 className="workspace-display-title">
                        {t('从会话，到结果', 'From session to results')}
                    </h2>
                </div>
                <div data-kiosk-hide className="workspace-overview-tools">
                    {editing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={resetLayout}
                            className="text-muted-foreground"
                        >
                            <RotateCcw className="size-3.5" /> {t('恢复默认', 'Restore defaults')}
                        </Button>
                    )}
                    <Button
                        variant={editing ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEditing(!editing)}
                    >
                        {editing ? (
                            <>
                                <Check className="size-3.5" /> {t('完成编辑', 'Done editing')}
                            </>
                        ) : (
                            <>
                                <PanelsTopLeft className="size-3.5" />{' '}
                                {t('编辑布局', 'Edit layout')}
                            </>
                        )}
                    </Button>
                </div>
            </motion.header>

            <GettingStartedPanel />

            <motion.section
                className="workspace-live-section"
                aria-labelledby="overview-widgets-title"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                    reduced
                        ? { duration: 0 }
                        : performance?.low
                          ? { duration: 0.18 }
                          : { duration: 0.32 }
                }
            >
                <div className="workspace-section-heading">
                    <h3 id="overview-widgets-title">{t('运行与记录', 'Runtime and logs')}</h3>
                    <Link to="/logs" className="workspace-inline-link">
                        {t('全部运行记录', 'All runtime logs')}
                        <ArrowRight className="size-3.5" />
                    </Link>
                </div>

                {editing && (
                    <p className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground">
                        {isWide
                            ? t(
                                  '拖动或方向键移动；Shift+方向键缩放，Delete隐藏。卡片库可重新添加，导航在「工作区管理」。',
                                  'Drag or use arrow keys to move; Shift+arrow keys resize, and Delete hides a card. Add it back from the card library. Find navigation in Workspace management.',
                              )
                            : t(
                                  '拖动或方向键排序；眼睛显隐、齿轮设置。手机顺序单独保存。',
                                  'Drag or use arrow keys to reorder. Use the eye to show or hide cards and the gear to configure them. Mobile order is saved separately.',
                              )}
                    </p>
                )}

                {isWide ? (
                    <div className="workspace-widget-layout">
                        <div className="min-w-0 flex-1">
                            {visibleBlocks.length === 0 ? (
                                editing ? (
                                    <DropPlaceholder onAdd={addWidget} />
                                ) : (
                                    <EmptyLayout onReset={resetLayout} />
                                )
                            ) : (
                                <DashboardGrid
                                    blocks={visibleBlocks}
                                    editing={editing}
                                    cols={GRID_COLS}
                                    onChange={onGridChange}
                                    renderWidget={renderWidget}
                                    configurableIds={CONFIGURABLE_WIDGETS}
                                    onConfigOpen={setConfigId}
                                    removableSelector=".widget-gallery"
                                    onAdd={addWidget}
                                />
                            )}
                        </div>
                        {editing && <WidgetGallery hidden={hiddenBlocks} onAdd={addWidget} />}
                    </div>
                ) : (
                    <MobileOverview
                        items={mobileItems}
                        editing={editing}
                        configById={configById}
                        onReorder={reorderMobile}
                        onToggle={toggleMobile}
                        onConfigOpen={setConfigId}
                        onReset={resetLayout}
                    />
                )}
            </motion.section>

            <Modal
                open={!!configId}
                onClose={() => setConfigId(null)}
                title={
                    configBlock
                        ? `${widgetLabel(configBlock.id, t)} · ${t('设置', 'Settings')}`
                        : t('设置', 'Settings')
                }
                closeLabel={t('关闭卡片设置弹窗', 'Close card settings')}
                className="workspace-modal"
                maxWidth={384}
            >
                <div className="flex flex-col gap-4">
                    {configBlock?.id === 'alerts' && (
                        <AlertsConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('alerts', c)}
                        />
                    )}
                    {configBlock?.id === 'sessions' && (
                        <SessionsConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('sessions', c)}
                        />
                    )}
                    {configBlock?.id === 'host' && (
                        <HostConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('host', c)}
                        />
                    )}
                    {configBlock?.id === 'connections' && (
                        <ConnectionsConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('connections', c)}
                        />
                    )}
                    {configBlock?.id === 'note' && (
                        <NoteConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('note', c)}
                        />
                    )}
                    {configBlock?.id === 'link' && (
                        <LinkConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('link', c)}
                        />
                    )}
                    {configBlock?.id === 'account' && (
                        <AccountConfigForm
                            config={configBlock.config}
                            onChange={(c) => setBlockConfig('account', c)}
                        />
                    )}
                </div>
            </Modal>
        </div>
    );
}

function EmptyLayout({ onReset }: { onReset: () => void }) {
    const t = useT();
    return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-muted-foreground">
            <MonitorCog className="size-8 opacity-40" strokeWidth={1.5} />
            <p className="text-sm">
                {t('所有工作台卡片都已隐藏', 'All workspace cards are hidden')}
            </p>
            <Button variant="outline" size="sm" onClick={onReset}>
                {t('恢复默认布局', 'Restore default layout')}
            </Button>
        </div>
    );
}

function MobileLayoutRow({
    item,
    onToggle,
    onConfigOpen,
    onMove,
}: {
    item: UiLayoutItem;
    onToggle: (id: string) => void;
    onConfigOpen: (id: string) => void;
    onMove: (direction: -1 | 1) => void;
}) {
    const t = useT();
    const label = widgetLabel(item.id, t);
    const visibilityLabel = item.visible
        ? t(`隐藏${label}卡片`, `Hide the ${label} card`)
        : t(`显示${label}卡片`, `Show the ${label} card`);
    const controls = useDragControls();
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    return (
        <Reorder.Item
            value={item.id}
            dragListener={false}
            dragControls={controls}
            transition={
                reduced
                    ? { duration: 0 }
                    : performance?.low
                      ? { duration: 0.18 }
                      : { type: 'spring', duration: 0.42, bounce: 0.1 }
            }
            className={cn(
                'flex select-none items-center gap-2 rounded-xl border bg-card/60 px-3 py-2.5',
                !item.visible && 'opacity-50',
            )}
        >
            <button
                type="button"
                aria-label={t(`调整${label}卡片顺序`, `Reorder the ${label} card`)}
                aria-description={t('方向键排序。', 'Use arrow keys to reorder.')}
                title={t('拖动或方向键排序', 'Drag or use arrow keys to reorder')}
                className="inline-flex size-11 shrink-0 touch-none items-center justify-center text-muted-foreground"
                onPointerDown={(e) => controls.start(e)}
                onKeyDown={(event) => {
                    if (
                        event.target !== event.currentTarget ||
                        event.altKey ||
                        event.ctrlKey ||
                        event.metaKey ||
                        event.shiftKey
                    ) {
                        return;
                    }

                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        event.stopPropagation();
                        onMove(event.key === 'ArrowUp' ? -1 : 1);
                    }
                }}
            >
                <GripVertical className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
            {CONFIGURABLE_WIDGETS.has(item.id) && item.visible && (
                <button
                    type="button"
                    onClick={() => onConfigOpen(item.id)}
                    onPointerDown={(e) => e.stopPropagation()}
                    title={t(`${label} · 卡片设置`, `${label} · Card settings`)}
                    aria-label={t(`设置${label}卡片`, `Configure the ${label} card`)}
                    className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground cursor-pointer"
                >
                    <Settings2 className="size-3.5" />
                </button>
            )}
            <button
                type="button"
                onClick={() => onToggle(item.id)}
                onPointerDown={(e) => e.stopPropagation()}
                title={visibilityLabel}
                aria-label={visibilityLabel}
                className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground cursor-pointer"
            >
                {item.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>
        </Reorder.Item>
    );
}

// ─────────────── mobile single-column overview ───────────────
// Phones get a one-dimensional layout (`overviewMobile`), fully disjoint from
// the desktop 2D grid. View mode reuses the grid renderer (drag disabled) so
// each widget keeps its cell height; edit mode is a drag-sort panel.
function MobileOverview({
    items,
    editing,
    configById,
    onReorder,
    onToggle,
    onConfigOpen,
    onReset,
}: {
    items: UiLayoutItem[];
    editing: boolean;
    configById: Map<string, Record<string, unknown> | undefined>;
    onReorder: (ids: string[]) => void;
    onToggle: (id: string) => void;
    onConfigOpen: (id: string) => void;
    onReset: () => void;
}) {
    if (editing) {
        const move = (index: number, direction: -1 | 1) => {
            const target = index + direction;

            if (target < 0 || target >= items.length) {
                return;
            }

            const ids = items.map((item) => item.id);
            [ids[index], ids[target]] = [ids[target], ids[index]];
            onReorder(ids);
        };

        return (
            <Reorder.Group
                axis="y"
                values={items.map((i) => i.id)}
                onReorder={onReorder}
                className="flex flex-col gap-2"
            >
                {items.map((item, index) => (
                    <MobileLayoutRow
                        key={item.id}
                        item={item}
                        onToggle={onToggle}
                        onConfigOpen={onConfigOpen}
                        onMove={(direction) => move(index, direction)}
                    />
                ))}
            </Reorder.Group>
        );
    }

    const visible = items.filter((i) => i.visible);

    if (visible.length === 0) {
        return <EmptyLayout onReset={onReset} />;
    }

    // Stack widgets in a single column with cumulative y + catalogue heights
    // (pure prefix-sum; the widget count is tiny so the O(n²) is negligible).
    const heights = visible.map((item) => mobileHeightOf(item.id));
    const blocks: UiLayoutItem[] = visible.map((item, i) => ({
        id: item.id,
        visible: true,
        x: 0,
        y: heights.slice(0, i).reduce((sum, h) => sum + h, 0),
        w: 1,
        h: heights[i],
        config: configById.get(item.id),
    }));

    return (
        <DashboardGrid
            blocks={blocks}
            editing={false}
            cols={1}
            onChange={() => {
                /* no drag on mobile — order edited via the panel */
            }}
            renderWidget={renderWidget}
            configurableIds={CONFIGURABLE_WIDGETS}
            onConfigOpen={onConfigOpen}
        />
    );
}

// ─────────────── widget gallery (desktop edit mode) ───────────────
// The right-hand "store": hidden widgets shown as draggable tiles. Dragging a
// tile onto the canvas adds it (HTML5 DnD); dragging a canvas card back onto
// this panel removes it (gridstack `removable`, matched by the .widget-gallery
// class). Edit-mode only, desktop only.
function WidgetGallery({
    hidden,
    onAdd,
}: {
    hidden: UiLayoutItem[];
    onAdd: (id: string, x: number, y: number) => void;
}) {
    const t = useT();
    return (
        <div
            tabIndex={-1}
            role="region"
            aria-label={t('卡片库', 'Card library')}
            className="widget-gallery w-52 shrink-0 self-stretch rounded-lg border border-dashed bg-muted/20 p-3"
        >
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
                <LayoutGrid className="size-3.5 text-primary" />
                <span className="text-xs font-semibold">{t('卡片库', 'Card library')}</span>
            </div>
            <p className="mb-3 px-1 text-xs leading-snug text-muted-foreground">
                {t(
                    '点加号或拖到左侧画布添加；把卡片拖回此处即可移除。',
                    'Click + or drag a card onto the grid to add it. Drag it back here to remove it.',
                )}
            </p>
            {hidden.length === 0 ? (
                <div className="rounded-lg border border-dashed px-2 py-8 text-center text-xs text-muted-foreground">
                    {t('全部卡片已添加', 'All cards have been added')}
                </div>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {hidden.map((b) => {
                        const label = widgetLabel(b.id, t);
                        return (
                            <div
                                key={b.id}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData(WIDGET_DRAG_TYPE, b.id);
                                    e.dataTransfer.effectAllowed = 'copy';
                                }}
                                className="flex cursor-grab items-center gap-2 rounded-lg border bg-card/70 px-2.5 py-2 text-sm transition-colors active:cursor-grabbing hover:border-primary/40 hover:bg-accent/30"
                            >
                                <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                <button
                                    type="button"
                                    aria-label={t(`添加 ${label}`, `Add ${label}`)}
                                    onClick={() => onAdd(b.id, 0, 0)}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// Empty-canvas drop target shown in edit mode when no widget is on the grid —
// keeps an HTML5 drop zone so the first widget can still be dragged in.
function DropPlaceholder({ onAdd }: { onAdd: (id: string, x: number, y: number) => void }) {
    const t = useT();
    return (
        <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData(WIDGET_DRAG_TYPE);

                if (id) {
                    onAdd(id, 0, 0);
                }
            }}
            className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground"
        >
            <LayoutGrid className="size-8 opacity-40" strokeWidth={1.5} />
            <p className="text-sm">
                {t(
                    '从右侧「卡片库」点加号或拖动卡片到这里',
                    'Click + in the card library or drag a card here',
                )}
            </p>
        </div>
    );
}

// ─────────────── stat tiles (one widget each) ───────────────

function StatTileDetails({
    label,
    details,
    children,
}: {
    label: string;
    details: string;
    children: ReactNode;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const detailsId = useId();

    const dismiss = () => {
        setPinned(false);
        setOpen(false);
    };

    return (
        <Tooltip
            open={open}
            onOpenChange={(next) => {
                if (next || !pinned) {
                    setOpen(next);
                }
            }}
        >
            <TooltipTrigger asChild>
                <div className="group/details relative min-w-0 flex-1 pr-10 md:pr-9">
                    {children}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t(`查看${label}完整信息`, `View full details for ${label}`)}
                        aria-describedby={detailsId}
                        aria-expanded={open}
                        className="absolute -right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                            event.stopPropagation();
                            const next = !pinned;
                            setPinned(next);
                            setOpen(next);
                        }}
                    >
                        <Info aria-hidden="true" className="size-3.5" />
                    </Button>
                    <span id={detailsId} className="sr-only">
                        {details}
                    </span>
                </div>
            </TooltipTrigger>
            <TooltipContent
                side="bottom"
                className="max-w-xs whitespace-pre-line break-words text-center"
                onEscapeKeyDown={dismiss}
                onPointerDownOutside={dismiss}
            >
                {details}
            </TooltipContent>
        </Tooltip>
    );
}

function shortDistro(distro: string): string {
    let s = distro;
    s = s.replace(/^Debian GNU\/Linux /, 'Debian ');
    s = s.replace(/^Red Hat Enterprise Linux /, 'RHEL ');
    s = s.replace(/^CentOS (?:Linux )?release /, 'CentOS ');
    s = s.replace(/^Rocky Linux /, 'Rocky ');
    s = s.replace(/^Alma(?:Linux)? /, 'Alma ');
    s = s.replace(/^Oracle Linux /, 'Oracle ');
    s = s.replace(/^Amazon Linux /, 'Amazon ');
    s = s.replace(/^Scientific Linux /, 'Scientific ');
    s = s.replace(/^SUSE Linux Enterprise (?:Server |Desktop )?/, 'SUSE ');
    s = s.replace(/^Anolis OS /, 'Anolis ');
    s = s.replace(/^TencentOS Server /, 'TencentOS ');
    s = s.replace(/^Ubuntu Kylin /, 'Ubuntu ');
    s = s.replace(/^Manjaro Linux /, 'Manjaro ');
    s = s.replace(/^Void Linux /, 'Void ');
    s = s.replace(/^Alibaba Cloud Linux /, 'Alibaba ');
    s = s.replace(/^Raspbian GNU\/Linux /, 'Raspbian ');
    s = s.replace(/^DietPi v /, 'DietPi ');
    s = s.replace(/^Kali GNU\/Linux /, 'Kali ');
    s = s.replace(/^Proxmox VE /, 'Proxmox ');
    s = s.replace(/^Windows Server /, 'Win Svr ');
    s = s.replace(/^Windows (\d+)/, 'Win $1');
    s = s.replace(/\s*\([^)]+\)/g, '');
    s = s.replace(/\s{2,}/g, ' ');
    return s.trim();
}

function StatTile({
    icon,
    label,
    value,
    subtext,
    details,
    accent = false,
    to,
    ready = true,
}: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
    subtext?: ReactNode;
    details?: string;
    accent?: boolean;
    to?: AppPath;
    ready?: boolean;
}) {
    const copy = (
        <dl>
            <dt className="workspace-instrument-label">
                {icon}
                <span>{label}</span>
            </dt>
            <dd className="workspace-instrument-value">{value}</dd>
            {subtext && <dd className="workspace-instrument-note">{subtext}</dd>}
        </dl>
    );
    const body = (
        <div className="workspace-instrument" data-widget-type="instrument" data-online={accent}>
            {details && ready ? (
                <StatTileDetails label={label} details={details}>
                    <SkeletonSwap
                        ready
                        reserve={56}
                        lines={3}
                        lineHeight={18}
                        barHeight={7}
                        label={label}
                        className="skeleton-swap-fluid"
                    >
                        {copy}
                    </SkeletonSwap>
                </StatTileDetails>
            ) : (
                <SkeletonSwap
                    ready={ready}
                    reserve={56}
                    lines={3}
                    lineHeight={18}
                    barHeight={7}
                    label={label}
                    className={ready ? 'skeleton-swap-fluid min-w-0 flex-1' : 'min-w-0 flex-1'}
                >
                    {ready ? copy : null}
                </SkeletonSwap>
            )}
            {to && <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />}
        </div>
    );
    return to ? (
        <Link to={to} className="workspace-instrument-link">
            {body}
        </Link>
    ) : (
        body
    );
}

// Keep the existing zh uptime formatting and give English the same compact units.
function displayUptime(seconds: number, language: 'zh' | 'en'): string {
    if (language === 'zh') {
        return formatUptime(seconds);
    }

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '0 sec';
    }

    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [
        days ? `${days}d` : '',
        hours ? `${hours}h` : '',
        minutes || (!days && !hours) ? `${minutes}m` : '',
    ]
        .filter(Boolean)
        .join(' ');
}

const CONSOLE_STATUS_LABELS: Partial<Record<string, readonly [string, string]>> = {
    已连接: ['服务在线', 'Server online'],
    未连接: ['未连接', 'Disconnected'],
    未授权: ['未授权', 'Unauthorized'],
};

function StatTileWidget({ id }: { id: string }) {
    const t = useT();
    const { language } = useLocale();
    const { qqList, processList, systemInfo, resources } = useAppState();
    const { status } = useSession();
    const online = status === '已连接';
    const label = widgetLabel(id, t);
    const statusLabel = CONSOLE_STATUS_LABELS[status];

    switch (id) {
        case 'stat:status':
            return (
                <StatTile
                    icon={<Radio className="size-3.5" />}
                    label={label}
                    value={statusLabel ? t(...statusLabel) : status}
                    subtext={
                        online
                            ? t('连接正常', 'Connected')
                            : t('请检查服务进程', 'Check the server process')
                    }
                    accent={online}
                />
            );
        case 'stat:accounts':
            return (
                <StatTile
                    icon={<MessageCircle className="size-3.5" />}
                    label={label}
                    ready={resources.qqList.ready}
                    value={resources.qqList.error && qqList.length === 0 ? '—' : qqList.length}
                    subtext={
                        resources.qqList.error
                            ? qqList.length > 0
                                ? t(
                                      '更新失败，显示上次数据',
                                      'Refresh failed; showing previous data',
                                  )
                                : t('加载失败', 'Failed to load')
                            : t(`已接入 ${qqList.length} 个会话`, `${qqList.length} connected`)
                    }
                />
            );

        case 'stat:processes': {
            const onlineProcs = processList.filter((p) => p.status === 'online').length;
            const unattachedProcs = processList.filter((p) => !p.injected).length;
            return (
                <StatTile
                    icon={<PanelsTopLeft className="size-3.5" />}
                    label={label}
                    ready={resources.processList.ready}
                    value={
                        resources.processList.error && processList.length === 0
                            ? '—'
                            : processList.length
                    }
                    subtext={
                        resources.processList.error
                            ? processList.length > 0
                                ? t(
                                      '更新失败，显示上次数据',
                                      'Refresh failed; showing previous data',
                                  )
                                : t('加载失败', 'Failed to load')
                            : t(
                                  `${onlineProcs} 已接入 · ${unattachedProcs} 未接入`,
                                  `${onlineProcs} connected · ${unattachedProcs} not loaded`,
                              )
                    }
                    to="/processes"
                />
            );
        }

        case 'stat:host': {
            const value = systemInfo?.hostname ?? '—';
            const subtext = systemInfo
                ? `${shortDistro(systemInfo.distro)} · ${systemInfo.archLabel}`
                : resources.systemInfo.error
                  ? t('加载失败', 'Failed to load')
                  : t('加载中', 'Loading');
            return (
                <StatTile
                    icon={<Server className="size-3.5" />}
                    label={label}
                    ready={resources.systemInfo.ready}
                    value={value}
                    subtext={subtext}
                    details={
                        systemInfo
                            ? t(
                                  `主机名：${systemInfo.hostname}\n系统：${systemInfo.distro} · ${systemInfo.archLabel}`,
                                  `Hostname: ${systemInfo.hostname}\nSystem: ${systemInfo.distro} · ${systemInfo.archLabel}`,
                              )
                            : undefined
                    }
                />
            );
        }

        case 'stat:uptime': {
            const systemUptime = systemInfo ? displayUptime(systemInfo.uptime, language) : '—';
            const processUptime = systemInfo
                ? displayUptime(systemInfo.processUptime, language)
                : undefined;
            return (
                <StatTile
                    icon={<Clock3 className="size-3.5" />}
                    label={label}
                    ready={resources.systemInfo.ready}
                    value={systemUptime}
                    subtext={
                        processUptime
                            ? t(`服务 ${processUptime}`, `Server ${processUptime}`)
                            : undefined
                    }
                    details={
                        processUptime
                            ? t(
                                  `系统运行：${systemUptime}\nNowluma 进程：${processUptime}`,
                                  `System uptime: ${systemUptime}\nNowluma process: ${processUptime}`,
                              )
                            : undefined
                    }
                />
            );
        }

        default:
            return null;
    }
}

// ─────────────── host resources ───────────────

function HostBlock({ config }: { config: HostConfig }) {
    const t = useT();
    const { systemInfo, refreshSystem, resources } = useAppState();
    const cores = systemInfo?.cpu.cores ?? 0;
    const perCoreCount = systemInfo?.cpu.perCore.length ?? 0;
    const coresLabel = t(`${cores} 核`, `${cores} ${cores === 1 ? 'core' : 'cores'}`);
    return (
        <Card className="workspace-panel workspace-resource-panel">
            <CardHeader className="workspace-panel-heading">
                <div>
                    <CardTitle>
                        <h4>{widgetLabel('host', t)}</h4>
                    </CardTitle>
                    <CardDescription className="workspace-panel-description">
                        {systemInfo
                            ? `${systemInfo.cpu.model.trim()} · ${coresLabel} · Node ${systemInfo.nodeVersion}${
                                  resources.systemInfo.error
                                      ? t(
                                            ' · 更新失败，显示上次数据',
                                            ' · Refresh failed; showing previous data',
                                        )
                                      : ''
                              }`
                            : (resources.systemInfo.error ??
                              t('正在采集主机信息…', 'Reading host information…'))}
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={refreshSystem}>
                    <RefreshCw className="size-3.5" /> {t('刷新', 'Refresh')}
                </Button>
            </CardHeader>
            <CardContent className="workspace-host-panels min-h-0 flex-1 overflow-auto">
                {/* CPU */}
                {config.cpu && (
                    <div className="workspace-resource-block">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Cpu className="size-4 text-primary" />
                                <span className="text-sm font-semibold">
                                    {t('CPU 使用率', 'CPU usage')}
                                </span>
                                {systemInfo && (
                                    <span className="text-meta text-muted-foreground tabular-nums">
                                        {t(
                                            `${perCoreCount} 核`,
                                            `${perCoreCount} ${perCoreCount === 1 ? 'core' : 'cores'}`,
                                        )}
                                    </span>
                                )}
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-primary">
                                {systemInfo ? `${systemInfo.cpu.average.toFixed(1)}%` : '—'}
                            </span>
                        </div>
                        <SkeletonSwap
                            ready={resources.systemInfo.ready}
                            reserve={112}
                            lines={4}
                            lineHeight={28}
                            barHeight={9}
                            label={t('CPU 使用率', 'CPU usage')}
                            className="skeleton-swap-fluid min-h-[112px]"
                        >
                            {systemInfo ? (
                                <>
                                    <Progress value={systemInfo.cpu.average} />
                                    <p className="mt-2 text-meta text-muted-foreground tabular-nums">
                                        {t('负载:', 'Load:')}{' '}
                                        {systemInfo.cpu.loadAvg
                                            .map((v) => v.toFixed(2))
                                            .join(' / ')}
                                    </p>
                                    {systemInfo.cpu.perCore.length > 0 && (
                                        <div
                                            className="mt-3 grid"
                                            style={{
                                                gridTemplateColumns:
                                                    'repeat(auto-fill, minmax(34px, 1fr))',
                                                gap: 3,
                                            }}
                                        >
                                            {systemInfo.cpu.perCore.map((p, i) => (
                                                <div
                                                    key={i}
                                                    title={`Core ${i}: ${p.toFixed(1)}%`}
                                                    className="grid aspect-square place-items-center rounded-md transition-[background] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                                                    style={{
                                                        background: `color-mix(in oklab, var(--primary) ${Math.min(100, Math.max(0, p)).toFixed(1)}%, color-mix(in oklab, var(--muted) 80%, transparent))`,
                                                    }}
                                                >
                                                    <span
                                                        className="text-micro leading-none tabular-nums"
                                                        style={{
                                                            color: 'color-mix(in oklab, var(--foreground) 55%, transparent)',
                                                        }}
                                                    >
                                                        {i}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : resources.systemInfo.error ? (
                                <p role="alert" className="text-xs text-destructive">
                                    {resources.systemInfo.error}
                                </p>
                            ) : null}
                        </SkeletonSwap>
                    </div>
                )}
                {/* Memory */}
                {config.memory && (
                    <div className="workspace-resource-block">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MemoryStick className="size-4 text-primary" />
                                <span className="text-sm font-semibold">
                                    {t('内存使用', 'Memory usage')}
                                </span>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-primary">
                                {systemInfo ? `${systemInfo.memory.usagePercent.toFixed(1)}%` : '—'}
                            </span>
                        </div>
                        <SkeletonSwap
                            ready={resources.systemInfo.ready}
                            reserve={72}
                            lines={3}
                            lineHeight={24}
                            barHeight={9}
                            label={t('内存使用', 'Memory usage')}
                            className="skeleton-swap-fluid min-h-[72px]"
                        >
                            {systemInfo ? (
                                (() => {
                                    const m = systemInfo.memory;
                                    const rss = Math.min(systemInfo.runtime.rss, m.used);
                                    const other = Math.max(0, m.used - rss);
                                    const segs = [
                                        {
                                            key: 'proc',
                                            label: t('本进程', 'This process'),
                                            bytes: rss,
                                            grow: (rss / m.total) * 100,
                                            color: 'var(--primary)',
                                        },
                                        {
                                            key: 'other',
                                            label: t('其他已用', 'Other processes'),
                                            bytes: other,
                                            grow: (other / m.total) * 100,
                                            color: 'color-mix(in oklab, var(--primary) 45%, transparent)',
                                        },
                                        {
                                            key: 'free',
                                            label: t('空闲', 'Free'),
                                            bytes: m.free,
                                            grow: (m.free / m.total) * 100,
                                            color: 'color-mix(in oklab, var(--muted) 85%, transparent)',
                                        },
                                    ];
                                    return (
                                        <>
                                            <div className="mt-1.5 flex h-3 gap-0.5">
                                                {segs.map((seg) => (
                                                    <span
                                                        key={seg.key}
                                                        className="rounded-[3px]"
                                                        style={{
                                                            flexGrow: seg.grow,
                                                            minWidth: 2,
                                                            background: seg.color,
                                                        }}
                                                        title={`${seg.label} ${formatBytes(seg.bytes)}`}
                                                    />
                                                ))}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-meta text-muted-foreground">
                                                {segs.map((seg) => (
                                                    <span
                                                        key={seg.key}
                                                        className="inline-flex items-center gap-1.5"
                                                    >
                                                        <i
                                                            className="size-2 rounded-[2px]"
                                                            style={{ background: seg.color }}
                                                        />
                                                        {seg.label}
                                                        <b className="font-semibold text-foreground tabular-nums">
                                                            {formatBytes(seg.bytes)}
                                                        </b>
                                                    </span>
                                                ))}
                                            </div>
                                        </>
                                    );
                                })()
                            ) : resources.systemInfo.error ? (
                                <p role="alert" className="text-xs text-destructive">
                                    {resources.systemInfo.error}
                                </p>
                            ) : null}
                        </SkeletonSwap>
                    </div>
                )}
                {/* Runtime */}
                {config.runtime && (
                    <div className="workspace-resource-block">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Server className="size-4 text-primary" />
                                <span className="text-sm font-semibold">
                                    {t('运行进程', 'Runtime process')}
                                </span>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-primary">
                                {systemInfo ? `PID ${systemInfo.runtime.pid}` : '—'}
                            </span>
                        </div>
                        <SkeletonSwap
                            ready={resources.systemInfo.ready}
                            reserve={88}
                            lines={3}
                            lineHeight={29}
                            barHeight={9}
                            label={t('运行进程', 'Runtime process')}
                            className={
                                resources.systemInfo.ready ? 'skeleton-swap-fluid min-h-[88px]' : ''
                            }
                        >
                            {systemInfo ? (
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1.5">
                                        <span className="text-muted-foreground">RSS</span>
                                        <span className="font-medium tabular-nums">
                                            {formatBytes(systemInfo.runtime.rss)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1.5">
                                        <span className="text-muted-foreground">
                                            {t('堆内存', 'Heap memory')}
                                        </span>
                                        <span className="font-medium tabular-nums">
                                            {formatBytes(systemInfo.runtime.heapUsed)} /{' '}
                                            {formatBytes(systemInfo.runtime.heapTotal)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-background/60 px-2 py-1.5">
                                        <span className="text-muted-foreground">
                                            {t('外部内存', 'External memory')}
                                        </span>
                                        <span className="font-medium tabular-nums">
                                            {formatBytes(systemInfo.runtime.external)}
                                        </span>
                                    </div>
                                </div>
                            ) : resources.systemInfo.error ? (
                                <p role="alert" className="text-xs text-destructive">
                                    {resources.systemInfo.error}
                                </p>
                            ) : null}
                        </SkeletonSwap>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ─────────────── online sessions ───────────────

function SessionsBlock({ config }: { config: SessionsConfig }) {
    const t = useT();
    const { locale } = useLocale();
    const label = widgetLabel('sessions', t);
    const { qqList, resources, setSelectedUin } = useAppState();
    const list = useMemo(() => {
        const f = config.filter.trim().toLowerCase();
        let arr = f
            ? qqList.filter(
                  (q) => (q.nickname ?? '').toLowerCase().includes(f) || q.uin.includes(f),
              )
            : qqList;

        if (config.sort === 'uin') {
            arr = [...arr].sort((a, b) => a.uin.localeCompare(b.uin, locale, { numeric: true }));
        } else if (config.sort === 'nickname') {
            arr = [...arr].sort((a, b) =>
                (a.nickname ?? '').localeCompare(b.nickname ?? '', locale),
            );
        }

        // 'recent' keeps the server/insertion order.
        return arr;
    }, [qqList, config.sort, config.filter, locale]);

    return (
        <Card className="workspace-panel workspace-sessions-panel">
            <CardHeader className="workspace-panel-heading">
                <div>
                    <CardTitle>
                        <h4>{label}</h4>
                    </CardTitle>
                    <CardDescription className="workspace-panel-description">
                        {t('已完成登录', 'Signed-in sessions')}
                        {config.filter.trim() ? ` · ${config.filter.trim()}` : ''}
                    </CardDescription>
                </div>
                <Link to="/processes" className="workspace-inline-link">
                    {t('管理', 'Manage')}
                    <ArrowRight className="size-3.5" />
                </Link>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
                <SkeletonSwap
                    ready={resources.qqList.ready}
                    reserve={120}
                    lines={5}
                    lineHeight={24}
                    barHeight={9}
                    label={label}
                    className={resources.qqList.ready ? 'skeleton-swap-fluid min-h-[120px]' : ''}
                >
                    {resources.qqList.ready ? (
                        resources.qqList.error && qqList.length === 0 ? (
                            <p
                                role="alert"
                                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-8 text-center text-sm text-destructive"
                            >
                                {t(
                                    resources.qqList.error,
                                    `Failed to read QQ sessions: ${resources.qqList.error}`,
                                )}
                            </p>
                        ) : list.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
                                <Users className="size-8 opacity-40" strokeWidth={1.5} />
                                <p className="text-sm">
                                    {qqList.length === 0
                                        ? t(
                                              '还没有已登录的 QQ 会话',
                                              'No signed-in QQ sessions yet',
                                          )
                                        : t('无匹配的会话', 'No matching sessions')}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {resources.qqList.error && (
                                    <p
                                        role="alert"
                                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                                    >
                                        {t(
                                            `${resources.qqList.error}；当前显示上次成功读取的 QQ 会话。`,
                                            `${resources.qqList.error} Showing the last successfully loaded QQ sessions.`,
                                        )}
                                    </p>
                                )}
                                <div className="workspace-session-list">
                                    {list.map((q) => (
                                        <Link
                                            key={q.uin}
                                            to="/config"
                                            onClick={() => setSelectedUin(q.uin)}
                                            aria-label={t(
                                                `${q.nickname || q.uin}，管理机器人连接`,
                                                `Manage bot connections for ${q.nickname || q.uin}`,
                                            )}
                                            className="workspace-session-row"
                                        >
                                            <Avatar size={32}>
                                                <AvatarImage
                                                    src={qqAvatarUrl(q.uin)}
                                                    alt={q.nickname || q.uin}
                                                />
                                                <AvatarFallback>
                                                    {(q.nickname || q.uin).slice(0, 2)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {q.nickname || q.uin}
                                                </p>
                                                <p className="font-mono text-xs text-muted-foreground tabular-nums">
                                                    {q.uin}
                                                </p>
                                            </div>
                                            <span className="workspace-session-status">
                                                <span aria-hidden="true" />
                                                {resources.qqList.error
                                                    ? t('上次已登录', 'Previously signed in')
                                                    : t('已登录', 'Signed in')}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        )
                    ) : null}
                </SkeletonSwap>
            </CardContent>
        </Card>
    );
}

// ─────────────── connection health ───────────────

const CONN_STATUS_STYLE: Record<AdapterStatusLevel, string> = {
    ok: 'bg-success/10 text-success',
    warn: 'bg-warning/10 text-warning',
    down: 'bg-destructive/10 text-destructive',
    degraded: 'bg-destructive/10 text-destructive',
    disabled: 'bg-muted text-muted-foreground',
};
const CONN_STATUS_LABEL: Record<AdapterStatusLevel, [string, string]> = {
    ok: ['已就绪', 'Ready'],
    warn: ['注意', 'Warning'],
    down: ['异常', 'Down'],
    degraded: ['应用失败', 'Failed to apply'],
    disabled: ['未启用', 'Disabled'],
};
const ADAPTER_KIND_LABEL: Record<AdapterStatus['kind'], [string, string]> = {
    httpServer: ['HTTP 服务端', 'HTTP server'],
    httpClient: ['HTTP 上报', 'HTTP reporting'],
    wsServer: ['WS 服务端', 'WS server'],
    wsClient: ['WS 客户端', 'WS client'],
};

// Worst-status-first ordering (down → warn → disabled → ok).
const CONN_STATUS_RANK: Record<AdapterStatusLevel, number> = {
    degraded: 0,
    down: 1,
    warn: 2,
    disabled: 3,
    ok: 4,
};

function ConnectionsBlock({ config }: { config: ConnectionsConfig }) {
    const t = useT();
    const { locale } = useLocale();
    const label = widgetLabel('connections', t);
    const { connections, resources, setSelectedUin } = useAppState();
    const list = useMemo(() => {
        const f = config.filter.trim().toLowerCase();
        // Optionally drop healthy adapters, then accounts left with none.
        let arr = connections.map((acc) => ({
            ...acc,
            adapters: config.onlyIssues
                ? acc.adapters.filter((a) => a.status !== 'ok')
                : acc.adapters,
        }));

        if (config.onlyIssues) {
            arr = arr.filter((acc) => acc.adapters.length > 0);
        }

        if (f) {
            arr = arr.filter(
                (acc) => (acc.nickname ?? '').toLowerCase().includes(f) || acc.uin.includes(f),
            );
        }

        if (config.sort === 'name') {
            arr = [...arr].sort((a, b) =>
                (a.nickname || a.uin).localeCompare(b.nickname || b.uin, locale),
            );
        } else if (config.sort === 'status') {
            const worst = (acc: (typeof arr)[number]) =>
                acc.adapters.reduce((m, a) => Math.min(m, CONN_STATUS_RANK[a.status]), 99);
            arr = [...arr].sort((a, b) => worst(a) - worst(b));
        }

        return arr;
    }, [connections, config.filter, config.onlyIssues, config.sort, locale]);

    const filtered = config.filter.trim() !== '' || config.onlyIssues;
    return (
        <Card className="workspace-panel workspace-connections-panel">
            <CardHeader className="workspace-panel-heading">
                <div>
                    <CardTitle>
                        <h4>{label}</h4>
                    </CardTitle>
                    <CardDescription className="workspace-panel-description">
                        {config.onlyIssues
                            ? t('端点状态 · 仅异常', 'Endpoint status · Issues only')
                            : t('端点状态', 'Endpoint status')}
                        {config.filter.trim() ? ` · ${config.filter.trim()}` : ''}
                    </CardDescription>
                </div>
                <Link to="/config" className="workspace-inline-link">
                    {t('管理连接', 'Manage connections')}
                    <ArrowRight className="size-3.5" />
                </Link>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
                <SkeletonSwap
                    ready={resources.connections.ready}
                    reserve={120}
                    lines={5}
                    lineHeight={24}
                    barHeight={9}
                    label={label}
                    className={
                        resources.connections.ready ? 'skeleton-swap-fluid min-h-[120px]' : ''
                    }
                >
                    {resources.connections.ready ? (
                        resources.connections.error && connections.length === 0 ? (
                            <p
                                role="alert"
                                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-8 text-center text-sm text-destructive"
                            >
                                {t(
                                    resources.connections.error,
                                    `Failed to read bot connections: ${resources.connections.error}`,
                                )}
                            </p>
                        ) : list.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
                                <Cable className="size-8 opacity-40" strokeWidth={1.5} />
                                <p className="text-sm">
                                    {filtered
                                        ? t('无匹配的连接', 'No matching connections')
                                        : t('先接入一个 QQ 会话', 'Connect a QQ session first')}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {resources.connections.error && (
                                    <p
                                        role="alert"
                                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                                    >
                                        {t(
                                            `${resources.connections.error}；当前显示上次成功读取的连接状态。`,
                                            `${resources.connections.error} Showing the last successfully loaded connection status.`,
                                        )}
                                    </p>
                                )}
                                {list.map((acc) => (
                                    <div key={acc.uin} className="workspace-account-connections">
                                        <div className="workspace-account-heading">
                                            <Link
                                                to="/config"
                                                onClick={() => setSelectedUin(acc.uin)}
                                                className="workspace-account-heading-link text-sm font-medium"
                                                aria-label={t(
                                                    `${acc.nickname || acc.uin}，管理机器人连接`,
                                                    `Manage bot connections for ${acc.nickname || acc.uin}`,
                                                )}
                                            >
                                                {acc.nickname || acc.uin}
                                            </Link>
                                            <span className="font-mono text-meta text-muted-foreground tabular-nums">
                                                {acc.uin}
                                            </span>
                                        </div>
                                        {acc.databaseMigration &&
                                            acc.databaseMigration.phase !== 'complete' && (
                                                <DatabaseMigrationProgress
                                                    migration={acc.databaseMigration}
                                                />
                                            )}
                                        {acc.adapters.length > 0 ? (
                                            <div className="workspace-endpoint-list">
                                                {acc.adapters.map((adp) => (
                                                    <div
                                                        key={adp.name}
                                                        className="workspace-endpoint-row"
                                                    >
                                                        <Cable className="size-4 shrink-0 text-muted-foreground" />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="workspace-endpoint-heading">
                                                                <span className="truncate text-sm font-medium">
                                                                    {adp.name}
                                                                </span>
                                                                <span className="workspace-endpoint-kind">
                                                                    {ADAPTER_KIND_LABEL[adp.kind]
                                                                        ? t(
                                                                              ...ADAPTER_KIND_LABEL[
                                                                                  adp.kind
                                                                              ],
                                                                          )
                                                                        : adp.kind}
                                                                </span>
                                                            </div>
                                                            <p className="workspace-endpoint-detail">
                                                                {adp.detail}
                                                            </p>
                                                            {adp.lastError && adp.lastErrorAt && (
                                                                <p
                                                                    role="alert"
                                                                    className="workspace-endpoint-error"
                                                                >
                                                                    {new Date(
                                                                        adp.lastErrorAt,
                                                                    ).toLocaleString(locale)}{' '}
                                                                    · {adp.lastError}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <span
                                                            className={cn(
                                                                'workspace-endpoint-status',
                                                                CONN_STATUS_STYLE[adp.status],
                                                            )}
                                                        >
                                                            {CONN_STATUS_LABEL[adp.status]
                                                                ? t(
                                                                      ...CONN_STATUS_LABEL[
                                                                          adp.status
                                                                      ],
                                                                  )
                                                                : adp.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : acc.databaseMigration?.usable !== false ? (
                                            <p className="workspace-widget-empty-note">
                                                {t('还没有机器人连接', 'No bot connections yet')}
                                            </p>
                                        ) : null}
                                    </div>
                                ))}
                            </div>
                        )
                    ) : null}
                </SkeletonSwap>
            </CardContent>
        </Card>
    );
}

function DatabaseMigrationProgress({ migration }: { migration: AccountDatabaseMigration }) {
    const t = useT();
    const { locale } = useLocale();
    const percentage = migration.progress === null ? null : Math.round(migration.progress * 100);
    const title =
        migration.phase === 'preparing'
            ? t(
                  '正在准备数据库，账号暂不可用',
                  'Preparing the database. The account is temporarily unavailable.',
              )
            : migration.phase === 'failed'
              ? migration.usable
                  ? t(
                        '历史数据迁移失败，账号功能可用',
                        'History migration failed. The account remains usable.',
                    )
                  : t(
                        '数据库准备失败，账号暂不可用',
                        'Database preparation failed. The account is temporarily unavailable.',
                    )
              : t(
                    '正在后台迁移历史数据，账号功能可用',
                    'Migrating history in the background. The account remains usable.',
                );
    const eta = formatMigrationEta(migration.estimatedRemainingSeconds, t);
    const processed = migration.total !== null ? migration.processed.toLocaleString(locale) : '';
    const total = migration.total?.toLocaleString(locale);

    return (
        <div
            className={cn(
                'rounded-xl border px-3 py-2.5',
                migration.phase === 'failed'
                    ? 'border-destructive/25 bg-destructive/5'
                    : 'border-warning/25 bg-warning/5',
            )}
        >
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium">{title}</span>
                {percentage !== null && <span className="tabular-nums">{percentage}%</span>}
            </div>
            {percentage !== null && <Progress className="mt-2 h-1.5" value={percentage} />}
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-meta text-muted-foreground">
                {migration.total !== null && (
                    <span className="tabular-nums">
                        {t(
                            `已处理 ${processed} / ${total} 条`,
                            `Processed ${processed} / ${total} records`,
                        )}
                    </span>
                )}
                {migration.phase !== 'failed' && <span>{eta}</span>}
                {migration.phase === 'failed' && migration.error && <span>{migration.error}</span>}
            </div>
        </div>
    );
}

function formatMigrationEta(seconds: number | null, t: Translate): string {
    if (seconds === null) {
        return t('剩余时间估算中', 'Estimating time remaining');
    }

    if (seconds <= 0) {
        return t('即将完成', 'Almost done');
    }

    if (seconds < 60) {
        return t(`预计剩余 ${seconds} 秒`, `About ${seconds} sec remaining`);
    }

    const minutes = Math.ceil(seconds / 60);

    if (minutes < 60) {
        return t(`预计剩余 ${minutes} 分钟`, `About ${minutes} min remaining`);
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return t(
        `预计剩余 ${hours} 小时${remainder > 0 ? ` ${remainder} 分钟` : ''}`,
        `About ${hours} hr${remainder > 0 ? ` ${remainder} min` : ''} remaining`,
    );
}

// ─────────────── static widgets (note / link / account) ───────────────

function NoteWidget({ config }: { config: NoteConfig }) {
    const t = useT();
    return (
        <Card className="workspace-panel h-full overflow-hidden">
            <CardContent className="h-full overflow-auto p-4">
                {config.text.trim() ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {config.text}
                    </p>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('空便签 · 编辑时填写内容', 'Empty note · Add text in edit mode')}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function LinkWidget({ config }: { config: LinkConfig }) {
    const t = useT();
    const Icon = LINK_ICON_COMPONENTS[config.icon] ?? LINK_ICON_COMPONENTS.link;

    if (!config.url) {
        return (
            <Card className="workspace-panel h-full overflow-hidden">
                <CardContent className="flex h-full items-center gap-3 p-4 text-muted-foreground">
                    <Icon className="size-5 shrink-0" />
                    <span className="text-sm">
                        {t('未配置链接 · 编辑时设置', 'No link set · Configure in edit mode')}
                    </span>
                </CardContent>
            </Card>
        );
    }

    return (
        <a
            href={config.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
            <Card className="h-full overflow-hidden transition-colors hover:bg-muted/40">
                <CardContent className="flex h-full items-center gap-3 p-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                            {config.label || config.url}
                        </p>
                        <p className="truncate text-meta text-muted-foreground">{config.url}</p>
                    </div>
                    <ExternalLink className="size-4 shrink-0 text-muted-foreground/60" />
                </CardContent>
            </Card>
        </a>
    );
}

function AccountWidget({ config }: { config: AccountConfig }) {
    const t = useT();
    const { qqList, resources } = useAppState();
    const acct = qqList.find((q) => q.uin === config.uin);

    if (!config.uin) {
        return (
            <Card className="workspace-panel h-full overflow-hidden">
                <CardContent className="flex h-full items-center gap-3 p-4 text-muted-foreground">
                    <Users className="size-5 shrink-0" />
                    <span className="text-sm">
                        {t(
                            '未指定账号 · 编辑时选择',
                            'No account selected · Choose one in edit mode',
                        )}
                    </span>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="workspace-panel h-full overflow-hidden">
            <SkeletonSwap
                ready={resources.qqList.ready}
                reserve={72}
                lines={3}
                lineHeight={24}
                barHeight={9}
                label={t('账号状态', 'Account status')}
                className="skeleton-swap-fill"
            >
                {resources.qqList.ready ? (
                    <CardContent className="flex h-full items-center gap-3 p-4">
                        <Avatar size={40}>
                            <AvatarImage
                                src={qqAvatarUrl(config.uin)}
                                alt={acct?.nickname || config.uin}
                            />
                            <AvatarFallback>
                                {(acct?.nickname || config.uin).slice(0, 2)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                                {resources.qqList.error
                                    ? t('账号状态加载失败', 'Failed to load account status')
                                    : acct?.nickname || t('未接入账号', 'Account not connected')}
                            </p>
                            <p className="truncate font-mono text-meta text-muted-foreground tabular-nums">
                                {config.uin}
                            </p>
                        </div>
                        <span
                            title={
                                acct
                                    ? t('在线', 'Online')
                                    : resources.qqList.error
                                      ? t('状态未知', 'Status unknown')
                                      : t('未接入', 'Not connected')
                            }
                            className={cn(
                                'size-2 shrink-0 rounded-full',
                                acct ? 'bg-success' : 'bg-muted-foreground/40',
                            )}
                        />
                    </CardContent>
                ) : null}
            </SkeletonSwap>
        </Card>
    );
}

// ─────────────── recent alerts ───────────────

// Same WCAG-tuned log-level text tokens as the logs page (see index.css / the
// levelClass note there): the raw accent colors fail AA as small text on the
// light canvas.
const ALERT_LEVEL_CLASS: Record<LogLevel, string> = {
    trace: 'text-muted-foreground/90',
    debug: 'text-muted-foreground',
    info: 'text-log-info',
    success: 'text-log-success',
    warn: 'text-log-warn',
    error: 'text-log-error',
};

function RecentAlertsCard({ config }: { config: AlertsConfig }) {
    const t = useT();
    const label = widgetLabel('alerts', t);
    const api = useApi();
    const { formatClock } = useTheme();
    const [alerts, setAlerts] = useState<LogEntry[] | null>(null);
    const [loadFailure, setLoadFailure] = useState<{ detail?: string } | null>(null);
    const loadError =
        loadFailure &&
        (loadFailure.detail
            ? t(loadFailure.detail, `Failed to read runtime activity: ${loadFailure.detail}`)
            : t('读取运行动态失败', 'Failed to read runtime activity'));
    const { count } = config;
    const levelsKey = config.levels.join(',');

    useEffect(() => {
        const levels = new Set(levelsKey.split(',') as LogLevel[]);
        let active = true;
        setAlerts(null);
        setLoadFailure(null);
        api.logs
            .list(Math.max(200, count * 4))
            .then((list) => {
                if (!active) {
                    return;
                }

                setAlerts(list.filter((l) => levels.has(l.level)).slice(-count));
            })
            .catch((error) => {
                if (!active) {
                    return;
                }

                console.error('load recent alerts failed', error);
                setLoadFailure(error instanceof Error ? { detail: error.message } : {});
                setAlerts((previous) => previous ?? []);
            });
        const stop = api.logs.stream({
            onLine: (entry) => {
                if (!levels.has(entry.level)) {
                    return;
                }

                setAlerts((prev) =>
                    [...(prev ?? []).filter((a) => a.id !== entry.id), entry].slice(-count),
                );
            },
        });

        return () => {
            active = false;
            stop();
        };
    }, [api, count, levelsKey]);

    return (
        <Card className="workspace-panel workspace-activity-panel">
            <CardHeader className="workspace-panel-heading">
                <div>
                    <CardTitle>
                        <h4>{label}</h4>
                    </CardTitle>
                    <CardDescription className="workspace-panel-description">
                        {t(
                            `最近 ${count} 条`,
                            `Last ${count} ${count === 1 ? 'entry' : 'entries'}`,
                        )}{' '}
                        · {config.levels.map((level) => level.toUpperCase()).join(' / ')}
                    </CardDescription>
                </div>
                <Link to="/logs" className="workspace-inline-link">
                    {t('查看记录', 'View logs')}
                    <ArrowRight className="size-3.5" />
                </Link>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
                <SkeletonSwap
                    ready={alerts !== null}
                    reserve={120}
                    lines={5}
                    lineHeight={24}
                    barHeight={9}
                    label={label}
                    className={alerts !== null ? 'skeleton-swap-fluid min-h-[120px]' : ''}
                >
                    {alerts !== null ? (
                        loadError && alerts.length === 0 ? (
                            <p
                                role="alert"
                                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-8 text-center text-sm text-destructive"
                            >
                                {loadError}
                            </p>
                        ) : alerts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
                                <Activity className="size-8 opacity-40" strokeWidth={1.5} />
                                <p className="text-sm">
                                    {t('暂无匹配的运行记录', 'No matching log entries yet')}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1 font-mono text-meta">
                                {loadError && (
                                    <p
                                        role="alert"
                                        className="mb-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 font-sans text-xs text-destructive"
                                    >
                                        {t(
                                            `${loadError}；当前显示已收到的运行动态。`,
                                            `${loadError} Showing activity received so far.`,
                                        )}
                                    </p>
                                )}
                                {alerts.map((a) => (
                                    <div key={a.id} className="workspace-activity-row">
                                        <span className="shrink-0 text-muted-foreground tabular-nums">
                                            {formatClock(a.time)}
                                        </span>
                                        <span
                                            className={cn(
                                                'shrink-0 font-semibold',
                                                ALERT_LEVEL_CLASS[a.level],
                                            )}
                                        >
                                            {a.level.toUpperCase()}
                                        </span>
                                        <span
                                            className="min-w-0 flex-1 break-words"
                                            title={a.message}
                                        >
                                            [{a.scope}] {a.message}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : null}
                </SkeletonSwap>
            </CardContent>
        </Card>
    );
}
