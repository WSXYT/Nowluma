import {
    ArrowDown,
    ArrowUp,
    ChevronRight,
    Cable,
    Check,
    Eye,
    EyeOff,
    FlaskConical,
    GripVertical,
    Lock,
    MessageCircle,
    PanelsTopLeft,
    Pin,
    PinOff,
    ScrollText,
    Settings2,
    Sparkles,
    SlidersHorizontal,
    type LucideIcon,
} from 'lucide-react';
import { motion, Reorder, useDragControls, useReducedMotionConfig } from 'motion/react';
import { Link, useRouterState } from '@tanstack/react-router';
import { GlassMaterial } from '@/components/ui/glass-material';
import { cn } from '@/lib/utils';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME, APP_VERSION } from '@/types';
import { useAppState } from '@/contexts/AppStateContext';
import { useTheme } from '@/contexts/ThemeContext';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import type { AppPath } from '@/router';
import type { UiLayoutItem } from '@/types';
import { useT, type Translate } from '@/i18n';

export interface NavItem {
    to: AppPath;
    label: string;
    icon: LucideIcon;
    description: string;
}

export const NAV_ITEMS: NavItem[] = [
    { to: '/', label: '工作台', icon: PanelsTopLeft, description: '会话、连接与结果' },
    { to: '/processes', label: 'QQ 会话', icon: MessageCircle, description: '选择并接入会话' },
    { to: '/config', label: '机器人连接', icon: Cable, description: '建立机器人连接' },
    { to: '/logs', label: '运行记录', icon: ScrollText, description: '查看连接结果' },
    { to: '/debug', label: '调试工具', icon: FlaskConical, description: '测试动作与排查' },
    {
        to: '/settings',
        label: '偏好设置',
        icon: SlidersHorizontal,
        description: '外观、账号与设备',
    },
];

const NAV_ENGLISH: Record<AppPath, readonly [label: string, description: string]> = {
    '/': ['Dashboard', 'Sessions, connections, and results'],
    '/processes': ['QQ sessions', 'Select and connect to a session'],
    '/config': ['Bot connections', 'Set up bot connections'],
    '/logs': ['Logs', 'Review connection results'],
    '/debug': ['Debug tools', 'Test actions and troubleshoot'],
    '/settings': ['Settings', 'Appearance, accounts, and devices'],
};

export function localizeNavItem(item: NavItem, t: Translate): NavItem {
    const [label, description] = NAV_ENGLISH[item.to];
    return { ...item, label: t(item.label, label), description: t(item.description, description) };
}

// These routes keep the layout editor and account settings reachable.
export const PINNED_NAV: AppPath[] = ['/', '/settings'];

function useNavigationItems() {
    const { navItems, setNavItems, editing, setEditing } = useLayout();
    const reconciled = reconcileLayoutItems(
        navItems,
        NAV_ITEMS.map((item) => item.to),
        PINNED_NAV,
    );
    const orderedNav = reconciled
        .filter((item) => item.visible)
        .map((item) => NAV_ITEMS.find((meta) => meta.to === item.id))
        .filter((item): item is NavItem => !!item);

    const reorderNav = (ids: string[]) => {
        const byId = new Map(reconciled.map((item) => [item.id, item]));
        setNavItems(ids.map((id) => byId.get(id)).filter((item): item is UiLayoutItem => !!item));
    };

    const toggleNav = (id: string) =>
        setNavItems(
            reconciled.map((item) => (item.id === id ? { ...item, visible: !item.visible } : item)),
        );
    return { reconciled, orderedNav, reorderNav, toggleNav, editing, setEditing };
}

function NavReorderRow({
    item,
    meta,
    first,
    last,
    onToggle,
    onMove,
}: {
    item: UiLayoutItem;
    meta: NavItem;
    first: boolean;
    last: boolean;
    onToggle: (id: string) => void;
    onMove: (direction: -1 | 1) => void;
}) {
    const t = useT();
    const controls = useDragControls();
    const Icon = meta.icon;
    const pinned = PINNED_NAV.includes(meta.to);
    return (
        <Reorder.Item
            value={item.id}
            dragListener={false}
            dragControls={controls}
            className={cn('workspace-nav-edit-row', !item.visible && 'opacity-50')}
        >
            <button
                type="button"
                aria-label={t(`拖动排序：${meta.label}`, `Drag to reorder: ${meta.label}`)}
                className="workspace-icon-button touch-none text-muted-foreground"
                onPointerDown={(event) => controls.start(event)}
            >
                <GripVertical className="size-4" />
            </button>
            <Icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
            <span className="min-w-0 flex-1 truncate text-sm">{meta.label}</span>
            <button
                type="button"
                aria-label={t(`上移${meta.label}`, `Move ${meta.label} up`)}
                className="workspace-icon-button"
                disabled={first}
                onClick={() => onMove(-1)}
            >
                <ArrowUp className="size-4" />
            </button>
            <button
                type="button"
                aria-label={t(`下移${meta.label}`, `Move ${meta.label} down`)}
                className="workspace-icon-button"
                disabled={last}
                onClick={() => onMove(1)}
            >
                <ArrowDown className="size-4" />
            </button>
            {pinned ? (
                <span
                    title={t('必选项，不可隐藏', 'Required item; cannot be hidden')}
                    className="grid size-11 shrink-0 place-items-center text-muted-foreground"
                >
                    <Lock className="size-3.5" />
                </span>
            ) : (
                <button
                    type="button"
                    onClick={() => onToggle(item.id)}
                    aria-label={
                        item.visible
                            ? t(`隐藏${meta.label}`, `Hide ${meta.label}`)
                            : t(`显示${meta.label}`, `Show ${meta.label}`)
                    }
                    className="workspace-icon-button"
                >
                    {item.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
            )}
        </Reorder.Item>
    );
}

export function NavigationDock() {
    const t = useT();
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const { orderedNav } = useNavigationItems();
    const activeIndex = orderedNav.findIndex((item) => item.to === pathname);
    const dockWidth = orderedNav.length * (appearance.sidebarPinned ? 164 : 120);

    return (
        <div className="workspace-dock-anchor">
            <div className="workspace-dock-scene" style={{ maxWidth: dockWidth }}>
                <nav
                    aria-label={t('主导航', 'Main navigation')}
                    data-ui-surface="chrome"
                    data-labels-pinned={appearance.sidebarPinned}
                    className="ui-glass workspace-dock"
                >
                    <GlassMaterial />
                    <div
                        className="workspace-dock-track"
                        style={{
                            gridTemplateColumns: `repeat(${orderedNav.length}, minmax(0, 1fr))`,
                        }}
                    >
                        <motion.div
                            aria-hidden="true"
                            initial={false}
                            animate={{
                                x: `${Math.max(0, activeIndex) * 100}%`,
                                opacity: activeIndex < 0 ? 0 : 1,
                            }}
                            transition={
                                reduced
                                    ? { duration: 0 }
                                    : performance?.low
                                      ? { duration: 0.18, ease: 'easeOut' }
                                      : { type: 'spring', duration: 0.42, bounce: 0.12 }
                            }
                            style={{ width: `${100 / orderedNav.length}%` }}
                            className="workspace-dock-marker"
                        >
                            <span className="ui-nav-highlight workspace-dock-active" />
                        </motion.div>
                        {orderedNav.map((item) => {
                            const { to, label, icon: Icon, description } = localizeNavItem(item, t);
                            return (
                                <Link
                                    key={to}
                                    to={to}
                                    title={description}
                                    aria-current={pathname === to ? 'page' : undefined}
                                    className="ui-nav-item workspace-dock-link"
                                    data-press-scale=""
                                >
                                    <Icon className="workspace-dock-icon size-4 shrink-0" />
                                    <span className="workspace-dock-copy max-w-full [&>span]:truncate">
                                        <span className="workspace-dock-label">{label}</span>
                                        <span className="workspace-dock-description">
                                            {description}
                                        </span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
}

export function WorkspaceManagement({ onItemClick }: { onItemClick?: () => void }) {
    const t = useT();
    const { updateInfo } = useAppState();
    const { appearance, setAppearance } = useTheme();
    const { reconciled, reorderNav, toggleNav, editing, setEditing } = useNavigationItems();
    const hiddenNav = reconciled
        .filter((item) => !item.visible)
        .map((item) => NAV_ITEMS.find((meta) => meta.to === item.id))
        .filter((item): item is NavItem => !!item);

    const moveNav = (index: number, direction: -1 | 1) => {
        const ids = reconciled.map((item) => item.id);
        const target = index + direction;

        if (target < 0 || target >= ids.length) {
            return;
        }

        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorderNav(ids);
    };

    return (
        <div data-ui-surface="chrome" className="workspace-management-panel">
            <div className="workspace-management-brand">
                <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                <span>{APP_NAME}</span>
                <span className="font-mono text-xs text-muted-foreground">v{APP_VERSION}</span>
            </div>
            <div className="workspace-management-scroll">
                <section
                    aria-labelledby="workspace-nav-settings-title"
                    className="workspace-management-section"
                >
                    <div className="workspace-section-heading">
                        <h3 id="workspace-nav-settings-title">
                            {t('底栏导航', 'Navigation dock')}
                        </h3>
                        <button
                            type="button"
                            onClick={() => setEditing(!editing)}
                            className="workspace-text-button"
                        >
                            {editing ? (
                                <Check className="size-4" />
                            ) : (
                                <Settings2 className="size-4" />
                            )}
                            {editing ? t('完成调整', 'Done') : t('调整导航', 'Edit navigation')}
                        </button>
                    </div>
                    {editing ? (
                        <>
                            <p className="workspace-management-note">
                                {t(
                                    '拖动或使用箭头排序，眼睛图标调整显示。',
                                    'Drag or use the arrows to reorder pages. Use the eye icons to show or hide them.',
                                )}
                            </p>
                            <Reorder.Group
                                axis="y"
                                values={reconciled.map((item) => item.id)}
                                onReorder={reorderNav}
                                className="space-y-1"
                            >
                                {reconciled.map((item, index) => {
                                    const meta = NAV_ITEMS.find((entry) => entry.to === item.id);
                                    return meta ? (
                                        <NavReorderRow
                                            key={item.id}
                                            item={item}
                                            meta={localizeNavItem(meta, t)}
                                            first={index === 0}
                                            last={index === reconciled.length - 1}
                                            onToggle={toggleNav}
                                            onMove={(direction) => moveNav(index, direction)}
                                        />
                                    ) : null;
                                })}
                            </Reorder.Group>
                        </>
                    ) : (
                        <p className="workspace-management-note">
                            {t(
                                '保留常用页面，其余页面仍可从这里打开。',
                                'Keep your frequently used pages in the dock. You can still open the others here.',
                            )}
                        </p>
                    )}
                    <button
                        type="button"
                        onClick={() => setAppearance({ sidebarPinned: !appearance.sidebarPinned })}
                        aria-label={t('显示导航说明', 'Show navigation descriptions')}
                        aria-pressed={appearance.sidebarPinned}
                        className="workspace-text-button workspace-management-preference"
                    >
                        {appearance.sidebarPinned ? (
                            <Pin className="size-4" />
                        ) : (
                            <PinOff className="size-4" />
                        )}
                        {t('显示导航说明', 'Show navigation descriptions')}
                    </button>
                </section>
                {hiddenNav.length > 0 && (
                    <section
                        aria-labelledby="workspace-hidden-pages-title"
                        className="workspace-management-section"
                    >
                        <h3 id="workspace-hidden-pages-title">{t('隐藏的页面', 'Hidden pages')}</h3>
                        <nav aria-label={t('隐藏的页面', 'Hidden pages')}>
                            {hiddenNav.map((item) => {
                                const { to, label, icon: Icon } = localizeNavItem(item, t);
                                return (
                                    <Link
                                        key={to}
                                        to={to}
                                        onClick={onItemClick}
                                        className="workspace-management-link"
                                    >
                                        <Icon className="size-4" />
                                        <span>{label}</span>
                                        <ChevronRight className="ml-auto size-3.5" />
                                    </Link>
                                );
                            })}
                        </nav>
                    </section>
                )}
                <section
                    aria-labelledby="workspace-layout-title"
                    className="workspace-management-section"
                >
                    <h3 id="workspace-layout-title">{t('工作台布局', 'Dashboard layout')}</h3>
                    <Link
                        to="/"
                        onClick={() => {
                            setEditing(true);
                            onItemClick?.();
                        }}
                        className="workspace-management-link"
                    >
                        <PanelsTopLeft className="size-4" />
                        <span>{t('编辑卡片布局', 'Edit card layout')}</span>
                        <ChevronRight className="ml-auto size-3.5" />
                    </Link>
                </section>
                {updateInfo?.hasUpdate && (
                    <Link
                        to="/settings"
                        search={{ tab: 'about' }}
                        onClick={onItemClick}
                        aria-label={t('有可用更新', 'Update available')}
                        className="workspace-update-link"
                    >
                        <Sparkles className="size-4" />
                        <span>
                            {t('有新版本', 'New version available')}
                            {updateInfo.latest && ` · v${updateInfo.latest}`}
                        </span>
                    </Link>
                )}
            </div>
        </div>
    );
}
