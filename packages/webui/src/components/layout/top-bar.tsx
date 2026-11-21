import { useState } from 'react';
import { Ellipsis, Expand, LogOut, Settings2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { useRouterState } from '@tanstack/react-router';
import { useDropdown } from '@/components/interior/dropdown';
import { GlassMaterial } from '@/components/ui/glass-material';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { localizeNavItem, NAV_ITEMS } from '@/components/layout/sidebar';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import { useKiosk } from '@/contexts/KioskContext';
import { useTheme } from '@/contexts/ThemeContext';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME } from '@/types';
import { useT, type Translate } from '@/i18n';

export const TOPBAR_CATALOGUE: { id: string; label: string }[] = [
    { id: 'status', label: '控制台连接' },
    { id: 'theme', label: '主题菜单' },
    { id: 'kiosk', label: '展示模式' },
];

const TOPBAR_ENGLISH: Partial<Record<string, string>> = {
    status: 'Console connection',
    theme: 'Theme menu',
    kiosk: 'Presentation mode',
};

export function localizeTopbarItem(
    item: { id: string; label: string },
    t: Translate,
): { id: string; label: string } {
    const label = Object.hasOwn(TOPBAR_ENGLISH, item.id) ? TOPBAR_ENGLISH[item.id] : undefined;
    return label ? { ...item, label: t(item.label, label) } : item;
}

interface TopBarProps {
    status: string;
    onManageWorkspace: () => void;
    onLogout: () => void;
}

export function TopBar({ status, onManageWorkspace, onLogout }: TopBarProps) {
    const t = useT();
    const [confirmLogout, setConfirmLogout] = useState(false);
    const pathname = useRouterState({ select: (state) => state.location.pathname });
    const meta = NAV_ITEMS.find((item) => item.to === pathname);
    const online = status === '已连接';
    const statusLabel = online
        ? t('已连接', 'Connected')
        : status === '未授权'
          ? t('未授权', 'Unauthorized')
          : status === '未连接'
            ? t('未连接', 'Disconnected')
            : status;
    const connectionLabel = t(`控制台连接：${statusLabel}`, `Console connection: ${statusLabel}`);
    const { topbarItems } = useLayout();
    const { enter: enterKiosk } = useKiosk();
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const shown = new Set(
        reconcileLayoutItems(
            topbarItems,
            TOPBAR_CATALOGUE.map((item) => item.id),
        )
            .filter((item) => item.visible)
            .map((item) => item.id),
    );
    const actions = [
        ...(shown.has('kiosk')
            ? [{ value: 'kiosk', label: t('展示模式', 'Presentation mode'), icon: Expand }]
            : []),
        { value: 'logout', label: t('退出登录', 'Sign out'), icon: LogOut },
    ];
    const { open, activeIndex, rootRef, triggerProps, listProps, getItemProps } = useDropdown({
        items: actions,
        onChange: (action) => {
            if (action === 'kiosk') {
                enterKiosk();
            } else if (action === 'logout') {
                setConfirmLogout(true);
            }
        },
    });

    return (
        <header data-ui-surface="chrome" className="workspace-masthead">
            <div className="workspace-masthead-inner max-sm:gap-2! max-sm:pl-[max(12px,env(safe-area-inset-left))]! max-sm:pr-[max(12px,env(safe-area-inset-right))]!">
                <button
                    type="button"
                    onClick={() => document.getElementById('workspace-content')?.focus()}
                    className="workspace-skip-link"
                >
                    {t('跳到页面内容', 'Skip to page content')}
                </button>
                <div className="workspace-masthead-brand" aria-label={APP_NAME}>
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                </div>
                <div className="workspace-page-context max-sm:pl-0!">
                    <div className="workspace-context-heading">
                        <h1>{meta ? localizeNavItem(meta, t).label : t('控制台', 'Console')}</h1>
                        {shown.has('status') && (
                            <span
                                className="workspace-connection-state"
                                data-online={online}
                                title={connectionLabel}
                                aria-label={connectionLabel}
                                role="status"
                            >
                                <span aria-hidden="true" className="workspace-status-dot" />
                                <span className="workspace-status-label">
                                    {online ? t('服务在线', 'Server online') : statusLabel}
                                </span>
                            </span>
                        )}
                    </div>
                </div>
                <div className="workspace-session-actions">
                    <div className="workspace-toolbar-scene">
                        <LanguageToggle />
                        {shown.has('theme') && <ThemeToggle />}
                        <button
                            id="workspace-session-trigger"
                            type="button"
                            onClick={onManageWorkspace}
                            aria-label={t('工作区管理', 'Workspace management')}
                            title={t('工作区管理', 'Workspace management')}
                            className="workspace-text-button"
                        >
                            <Settings2 className="size-4" />
                            <span className="hidden sm:inline">{t('工作区', 'Workspace')}</span>
                        </button>
                        <div ref={rootRef} className="workspace-more">
                            <button
                                {...triggerProps}
                                aria-label={t('更多操作', 'More actions')}
                                aria-haspopup="menu"
                                title={t('更多操作', 'More actions')}
                                className="ui-glass workspace-icon-button workspace-more-trigger"
                                data-press-scale=""
                            >
                                <GlassMaterial />
                                <Ellipsis className="size-4" />
                            </button>
                            <AnimatePresence>
                                {open && (
                                    <motion.div
                                        initial={
                                            reduced ? false : { opacity: 0, y: -6, scale: 0.96 }
                                        }
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.98 }}
                                        transition={
                                            reduced
                                                ? { duration: 0 }
                                                : performance?.low
                                                  ? { duration: 0.18, ease: 'easeOut' }
                                                  : { type: 'spring', duration: 0.42, bounce: 0.12 }
                                        }
                                        className="ui-glass ui-glass-menu workspace-session-menu"
                                    >
                                        <GlassMaterial />
                                        <ul
                                            {...listProps}
                                            role="menu"
                                            aria-label={t('会话操作', 'Session actions')}
                                            className="workspace-theme-options"
                                        >
                                            <motion.li
                                                aria-hidden="true"
                                                role="presentation"
                                                initial={false}
                                                animate={{
                                                    y: Math.max(0, activeIndex) * 44,
                                                    opacity: activeIndex < 0 ? 0 : 1,
                                                }}
                                                transition={
                                                    reduced
                                                        ? { duration: 0 }
                                                        : performance?.low
                                                          ? { duration: 0.18, ease: 'easeOut' }
                                                          : {
                                                                type: 'spring',
                                                                duration: 0.42,
                                                                bounce: 0.12,
                                                            }
                                                }
                                                className="workspace-theme-active"
                                            />
                                            {actions.map(({ value, label, icon: Icon }, index) => (
                                                <li
                                                    key={value}
                                                    {...getItemProps(index)}
                                                    role="menuitem"
                                                    aria-selected={undefined}
                                                    className="workspace-theme-option"
                                                    data-active={index === activeIndex}
                                                >
                                                    <Icon className="size-4" />
                                                    <span>{label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
            <ConfirmDialog
                open={confirmLogout}
                onOpenChange={setConfirmLogout}
                title={t('退出登录？', 'Sign out?')}
                description={t(
                    '当前会话将结束。下次进入时，需要再次输入访问密码。',
                    'This ends the current session. You will need to enter the access password again.',
                )}
                confirmText={t('退出登录', 'Sign out')}
                cancelText={t('取消', 'Cancel')}
                destructive
                activity={{
                    title: t('正在退出登录', 'Signing out'),
                    successTitle: t('已退出登录', 'Signed out'),
                    errorTitle: t('退出登录失败', 'Sign-out failed'),
                }}
                onConfirm={onLogout}
            />
        </header>
    );
}
