import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, hookHost } from './helpers/hook-host';
import { MainLayout } from '../src/components/layout/main-layout';
import type * as I18n from '../src/i18n';

const state = vi.hoisted(() => ({ kiosk: false, wallpaper: false }));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.defaultTranslate };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@tanstack/react-router', async (original) => ({
    ...(await original<typeof import('@tanstack/react-router')>()),
    useRouterState: ({
        select,
    }: {
        select: (value: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: '/' } }),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: state.wallpaper ? 'image' : 'none' },
            palette: 'default',
            reduceMotion: true,
            disableMotion: true,
            sidebarPinned: false,
        },
        mode: 'system',
        setMode: vi.fn(),
    }),
    paletteResolved: () => false,
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/LayoutContext')>()),
    useLayout: () => ({
        navItems: [],
        topbarItems: [],
        editing: false,
        setNavItems: vi.fn(),
        setEditing: vi.fn(),
    }),
}));
vi.mock('@/contexts/KioskContext', () => ({
    useKiosk: () => ({ kiosk: state.kiosk, enter: vi.fn(), exit: vi.fn() }),
}));
vi.mock('@/contexts/AppStateContext', () => ({ useAppState: () => ({ updateInfo: null }) }));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

let host: ReturnType<typeof hookHost>;
beforeEach(() => {
    Object.assign(state, { kiosk: false, wallpaper: false });
    host = hookHost();
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function shell() {
    return renderToStaticMarkup(
        <MotionConfig reducedMotion="always">
            <MainLayout status="已连接" onLogout={vi.fn()} notice={<p>账号数据库状态提示</p>}>
                <article>当前页面内容</article>
            </MainLayout>
        </MotionConfig>,
    );
}

describe('MainLayout workspace', () => {
    it('keeps one workspace, a persistent labelled dock, and an accessible content target', () => {
        const html = shell();
        expect(html).toContain('id="workspace-content" tabindex="-1"');
        expect(html).toContain('workspace-skip-link');
        expect(html).toContain('跳到页面内容');
        expect(html).not.toContain('href="#workspace-content"');
        expect(html).toContain('aria-label="主导航"');
        expect(html).toContain('workspace-dock-anchor');
        expect(html.match(/aria-label="主导航"/g)).toHaveLength(1);
        expect(html).not.toContain('页面导航');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('账号数据库状态提示');
        expect(html).not.toContain('<aside');
        expect(html).not.toContain('width:64px');
        expect(html).not.toContain('opacity:0.45');
    });

    it('keeps the document and the exit control in kiosk mode', () => {
        state.kiosk = true;
        const html = shell();
        expect(html).toContain('data-workspace-kiosk="true"');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('aria-label="退出展示模式"');
        expect(html).toContain('退出展示模式 (Esc)');
        expect(html).not.toContain('workspace-masthead');
        expect(html).not.toContain('workspace-dock-anchor');
        expect(html).not.toContain('账号数据库状态提示');
        expect(html).not.toContain('aria-label="登出"');
    });

    it('opens workspace management from the session flow and restores keyboard focus on close', () => {
        const render = () =>
            host.render(() =>
                MainLayout({
                    status: '已连接',
                    onLogout: vi.fn(),
                    children: <article>内容</article>,
                }),
            );
        const initial = elements(render());
        const manage = initial.find((element) => element.props.onManageWorkspace);
        (manage!.props.onManageWorkspace as () => void)();
        const opened = elements(render());
        const sheet = opened.find(
            (element) => element.props.onOpenChange && element.props.open === true,
        );
        expect(sheet).toBeDefined();
        (sheet!.props.onOpenChange as (open: boolean) => void)(false);
        const close = opened.find((element) => element.props.onCloseAutoFocus);
        const focus = vi.fn();
        const getElementById = vi.fn(() => ({ focus }));
        vi.stubGlobal('document', { getElementById });
        const event = { preventDefault: vi.fn() };
        (close!.props.onCloseAutoFocus as (event: unknown) => void)(event);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(getElementById).toHaveBeenCalledExactlyOnceWith('workspace-session-trigger');
        expect(focus).toHaveBeenCalledOnce();
        expect(elements(render()).some((element) => element.props.open === true)).toBe(false);
    });

    it('does not reopen a stale management sheet after entering and leaving kiosk', () => {
        const render = () =>
            host.render(() =>
                MainLayout({
                    status: '已连接',
                    onLogout: vi.fn(),
                    children: <article>内容</article>,
                }),
            );
        const manage = elements(render()).find((element) => element.props.onManageWorkspace);
        (manage!.props.onManageWorkspace as () => void)();
        expect(elements(render()).some((element) => element.props.open === true)).toBe(true);
        state.kiosk = true;
        render();
        state.kiosk = false;
        expect(elements(render()).some((element) => element.props.open === true)).toBe(false);
    });

    it('retains custom wallpaper between the stable content surfaces', () => {
        state.wallpaper = true;
        const html = shell();
        expect(html).toContain('class="workspace-shell text-foreground"');
        expect(html).toContain('当前页面内容');
        expect(html).toContain('workspace-dock');
    });
});
