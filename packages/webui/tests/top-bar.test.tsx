import type { ComponentProps, ReactNode } from 'react';
import type { useDropdown } from '../src/components/interior/dropdown';
import type { ConfirmDialog } from '../src/components/confirm-dialog';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UiLayoutItem } from '../src/types';
import {
    WorkspaceManagement,
    NAV_ITEMS,
    NavigationDock,
    localizeNavItem,
} from '../src/components/layout/sidebar';
import { TopBar, TOPBAR_CATALOGUE, localizeTopbarItem } from '../src/components/layout/top-bar';
import { LocaleProvider, translator, type Language } from '../src/i18n';

const state = vi.hoisted(() => ({
    pathname: '/',
    navItems: [] as UiLayoutItem[],
    topbarItems: [] as UiLayoutItem[],
    editing: false,
    palette: 'default',
    pinned: false,
    mode: 'light',
    managedBy: null as string | null,
    menuOpen: false,
    sessionMenu: null as ReturnType<typeof useDropdown> | null,
    confirm: null as ComponentProps<typeof ConfirmDialog> | null,
    enterKiosk: vi.fn(),
    onLogout: vi.fn(),
    onManageWorkspace: vi.fn(),
    setEditing: vi.fn(),
    updateInfo: null as { hasUpdate: boolean; latest: string } | null,
    setMode: vi.fn(),
    setAppearance: vi.fn(),
    setNavItems: vi.fn(),
    reorderRows: [] as { props: { item: UiLayoutItem; onMove: (direction: -1 | 1) => void } }[],
}));

vi.mock('motion/react', async (original) => {
    const actual = await original<typeof import('motion/react')>();
    const { Children } = await import('react');
    return {
        ...actual,
        Reorder: {
            Group: ({ children }: { children: ReactNode }) => {
                state.reorderRows = Children.toArray(children) as typeof state.reorderRows;
                return <div>{children}</div>;
            },
            Item: ({ children }: { children: ReactNode }) => <div>{children}</div>,
        },
    };
});
vi.mock('@tanstack/react-router', async (original) => ({
    ...(await original<typeof import('@tanstack/react-router')>()),
    useRouterState: ({
        select,
    }: {
        select: (value: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: state.pathname } }),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/LayoutContext')>()),
    useLayout: () => ({
        navItems: state.navItems,
        topbarItems: state.topbarItems,
        editing: state.editing,
        setNavItems: state.setNavItems,
        setEditing: state.setEditing,
    }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            palette: state.palette,
            reduceMotion: true,
            disableMotion: true,
            sidebarPinned: state.pinned,
        },
        mode: state.mode,
        managedBy: state.managedBy,
        setMode: state.setMode,
        setAppearance: state.setAppearance,
    }),
    paletteResolved: (palette: string) => (palette === 'default' ? null : 'dark'),
}));
vi.mock('@/components/interior/dropdown', async (original) => {
    const actual = await original<typeof import('../src/components/interior/dropdown')>();
    return {
        ...actual,
        useDropdown: (options: Parameters<typeof useDropdown>[0]) => {
            const dropdown = actual.useDropdown(options);

            if (options.items.some((item) => item.value === 'logout')) {
                state.sessionMenu = dropdown;
                return { ...dropdown, open: state.menuOpen };
            }

            return dropdown;
        },
    };
});
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({ updateInfo: state.updateInfo }),
}));
vi.mock('@/contexts/KioskContext', () => ({ useKiosk: () => ({ enter: state.enterKiosk }) }));
vi.mock('@/components/confirm-dialog', () => ({
    ConfirmDialog: (props: ComponentProps<typeof ConfirmDialog>) => {
        state.confirm = props;
        return null;
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
        pathname: '/',
        navItems: [],
        topbarItems: [],
        editing: false,
        palette: 'default',
        pinned: false,
        mode: 'light',
        managedBy: null,
        menuOpen: false,
        sessionMenu: null,
        confirm: null,
        updateInfo: null,
    });
});

function topbar(status = '已连接', language: Language = 'zh', fixed?: Language) {
    return renderToStaticMarkup(
        <LocaleProvider initial={language} fixed={fixed}>
            <MotionConfig reducedMotion="always">
                <TopBar
                    status={status}
                    onManageWorkspace={state.onManageWorkspace}
                    onLogout={state.onLogout}
                />
            </MotionConfig>
        </LocaleProvider>,
    );
}

describe('workspace navigation and management', () => {
    it('keeps all canonical routes in one primary dock, not a second page chooser', () => {
        expect(NAV_ITEMS.map((item) => item.to)).toEqual([
            '/',
            '/processes',
            '/config',
            '/logs',
            '/debug',
            '/settings',
        ]);
        const dock = renderToStaticMarkup(<NavigationDock />);
        const management = renderToStaticMarkup(<WorkspaceManagement />);

        for (const item of NAV_ITEMS) {
            expect(dock).toContain(`href="${item.to}"`);
            expect(dock).toContain(`workspace-dock-label">${item.label}`);
        }

        expect(management).not.toContain('aria-label="全部页面"');
        expect(management).not.toContain('href="/processes"');
        expect(management).not.toContain('href="/config"');
        expect(management).not.toContain('href="/logs"');
        expect(management).toContain('底栏导航');
        expect(management).toContain('调整导航');
        expect(management).toContain('编辑卡片布局');
        expect(management).toMatch(
            /<img src="(?:data:image\/svg\+xml,[^"]*|[^"]*nowluma-mark\.svg[^"]*)" alt=""/,
        );
        expect(management).not.toContain('alt="Nowluma"');
        expect(topbar()).not.toContain('页面导航');
    });

    it('renders the same routes and chrome controls in English with a language switch', () => {
        state.pathname = '/config';
        state.navItems = [{ id: '/logs', visible: false }];
        const html = renderToStaticMarkup(
            <LocaleProvider initial="en">
                <NavigationDock />
                <WorkspaceManagement />
            </LocaleProvider>,
        );
        expect(html).toContain('aria-label="Main navigation"');
        expect(html).toContain('aria-label="Hidden pages"');
        expect(html).toContain('href="/logs"');

        const t = translator('en');

        for (const item of NAV_ITEMS) {
            const localized = localizeNavItem(item, t);
            expect(localized).toMatchObject({ to: item.to, icon: item.icon });
            expect(localized.description).not.toBe(item.description);
            expect(html).toContain(localized.label);
        }

        expect(TOPBAR_CATALOGUE.map((item) => localizeTopbarItem(item, t))).toEqual([
            { id: 'status', label: 'Console connection' },
            { id: 'theme', label: 'Theme menu' },
            { id: 'kiosk', label: 'Presentation mode' },
        ]);
        const header = topbar('已连接', 'en');
        expect(header).toContain('<h1>Bot connections</h1>');
        expect(header).toContain('data-online="true"');
        expect(header).toContain('Server online');
        expect(header).toContain('aria-label="切换到简体中文"');
        expect(header).toContain('aria-label="Change theme: Light"');
        expect(topbar()).toContain('aria-label="Switch to English"');
        expect(topbar('已连接', 'en', 'en')).not.toContain('切换到简体中文');
    });

    it.each([
        ['未授权', 'Unauthorized'],
        ['未连接', 'Disconnected'],
    ])('localizes the offline status %s without changing its online flag', (status, label) => {
        const header = topbar(status, 'en');
        expect(header).toContain('data-online="false"');
        expect(header).toContain(`aria-label="Console connection: ${label}"`);
    });

    it('keeps saved order in the dock and access to every hidden page in management', () => {
        state.navItems = [
            { id: '/logs', visible: false },
            { id: '/debug', visible: true },
            { id: '/', visible: false },
            { id: '/settings', visible: false },
        ];
        const dock = renderToStaticMarkup(<NavigationDock />);
        expect(dock.indexOf('href="/debug"')).toBeLessThan(dock.indexOf('href="/"'));
        expect(dock).toContain('href="/settings"');
        expect(dock).not.toContain('href="/logs"');
        const management = renderToStaticMarkup(<WorkspaceManagement />);
        expect(management).toContain('aria-label="隐藏的页面"');
        expect(management).toContain('href="/logs"');
        expect(management).not.toContain('href="/debug"');
        state.navItems = NAV_ITEMS.map((item) => ({ id: item.to, visible: false }));
        const hidden = renderToStaticMarkup(<WorkspaceManagement />);

        for (const route of ['/processes', '/config', '/logs', '/debug']) {
            expect(hidden).toContain(`href="${route}"`);
        }

        const pinned = renderToStaticMarkup(<NavigationDock />);
        expect(pinned).toContain('href="/"');
        expect(pinned).toContain('href="/settings"');
    });

    it('keeps kiosk immediate and logout behind confirmation', async () => {
        topbar();
        const menu = state.sessionMenu;

        if (!menu || !state.confirm) {
            throw new Error('Session controls were not rendered');
        }

        const focus = vi.fn();
        menu.triggerProps.ref.current = { focus } as unknown as HTMLButtonElement;
        menu.getItemProps(0).onClick();
        expect(state.enterKiosk).toHaveBeenCalledOnce();
        menu.getItemProps(1).onClick();
        expect(state.onLogout).not.toHaveBeenCalled();
        expect(focus).toHaveBeenCalledTimes(2);
        expect(state.confirm.title).toBe('退出登录？');
        expect(state.confirm.destructive).toBe(true);
        await state.confirm.onConfirm();
        expect(state.onLogout).toHaveBeenCalledOnce();
    });

    it('keeps one active destination and the saved navigation explanation preference', () => {
        state.pathname = '/config';
        const dock = renderToStaticMarkup(<NavigationDock />);
        expect(dock).toContain('aria-label="主导航"');
        expect(dock).toContain('data-glass-renderer="frosted"');
        expect(dock.match(/workspace-dock-marker/g)).toHaveLength(1);
        expect(dock.match(/aria-current="page"/g)).toHaveLength(1);
        expect(dock).toMatch(/href="\/config"[^>]*aria-current="page"/);
        state.pinned = true;
        expect(renderToStaticMarkup(<NavigationDock />)).toContain('data-labels-pinned="true"');
        expect(renderToStaticMarkup(<WorkspaceManagement />)).toContain('aria-pressed="true"');
    });

    it('retains keyboard reorder and visibility controls without losing hidden preferences', () => {
        state.editing = true;
        state.navItems = [
            { id: '/', visible: true },
            { id: '/logs', visible: false },
            { id: '/settings', visible: true },
        ];
        const editor = renderToStaticMarkup(<WorkspaceManagement />);
        expect(editor).toContain('完成调整');
        expect(editor).toContain('aria-label="上移工作台"');
        expect(editor).toContain('aria-label="下移工作台"');
        expect(editor).toContain('aria-label="显示运行记录"');
        expect(editor).not.toContain('aria-label="隐藏工作台"');
        expect(editor).toContain('必选项，不可隐藏');
        const logs = state.reorderRows.find((row) => row.props.item.id === '/logs');
        expect(logs).toBeDefined();
        logs!.props.onMove(-1);
        expect(state.setNavItems).toHaveBeenLastCalledWith([
            { id: '/logs', visible: false },
            { id: '/', visible: true },
            { id: '/settings', visible: true },
            { id: '/processes', visible: true },
            { id: '/config', visible: true },
            { id: '/debug', visible: true },
        ]);
        state.setNavItems.mockClear();
        state.reorderRows[0].props.onMove(-1);
        state.reorderRows[state.reorderRows.length - 1].props.onMove(1);
        expect(state.setNavItems).not.toHaveBeenCalled();
    });

    it('keeps the update entry in management rather than adding another page chooser', () => {
        state.updateInfo = { hasUpdate: true, latest: '9.9.9' };
        const manager = renderToStaticMarkup(<WorkspaceManagement />);
        expect(manager).toContain('aria-label="有可用更新"');
        expect(manager).toContain('href="/settings"');
        expect(manager).toContain('v9.9.9');
    });

    it('honours hidden chrome, named palettes and the host without hiding management/logout', () => {
        state.topbarItems = ['status', 'theme', 'kiosk'].map((id) => ({ id, visible: false }));
        state.menuOpen = true;
        const hidden = topbar();
        expect(hidden).toContain('退出登录');
        expect(hidden).toContain('工作区管理');
        expect(hidden).not.toContain('已连接');
        expect(hidden).not.toContain('展示模式');
        expect(hidden).not.toContain('workspace-theme-trigger');
        expect(hidden).not.toContain('页面导航');
        state.topbarItems = [];
        state.palette = 'catppuccin-mocha';
        expect(topbar()).not.toContain('workspace-theme-trigger');
        state.palette = 'default';
        state.managedBy = 'maibot';
        expect(topbar()).not.toContain('workspace-theme-trigger');
    });
});
