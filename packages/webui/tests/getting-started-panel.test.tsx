import type { ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountConnections, HookProcessInfo } from '../src/types';
import type * as I18nModule from '../src/i18n';
import { elements, hookHost } from './helpers/hook-host';
import { GettingStartedPanel } from '../src/components/overview/getting-started-panel';

const state = vi.hoisted(() => ({
    language: 'zh' as 'zh' | 'en',
    processList: [] as HookProcessInfo[],
    qqList: [] as { uin: string; nickname: string }[],
    connections: [] as AccountConnections[],
    ready: { processList: true, qqList: true, connections: true },
    errors: { processList: '', qqList: '', connections: '' },
    pendingOp: null as 'load' | 'unload' | 'refresh' | null,
    load: vi.fn<(pid: number) => Promise<void>>(async () => undefined),
    setSelectedUin: vi.fn(),
    refreshProcesses: vi.fn(),
    refreshQqList: vi.fn(),
    refreshConnections: vi.fn(),
}));

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.translator(state.language) };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@tanstack/react-router', async (original) => ({
    ...(await original<typeof import('@tanstack/react-router')>()),
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        qqList: state.qqList,
        connections: state.connections,
        resources: {
            processList: {
                ready: state.ready.processList,
                error: state.errors.processList || null,
            },
            qqList: { ready: state.ready.qqList, error: state.errors.qqList || null },
            connections: {
                ready: state.ready.connections,
                error: state.errors.connections || null,
            },
        },
        processOps: {
            statusOf: () => state.pendingOp,
            banner: '',
            load: state.load,
            unload: vi.fn(),
            refresh: vi.fn(),
        },
        selectedUin: null,
        setSelectedUin: state.setSelectedUin,
        refreshProcesses: state.refreshProcesses,
        refreshQqList: state.refreshQqList,
        refreshConnections: state.refreshConnections,
    }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ appearance: { disableMotion: true }, performance: { low: false } }),
}));
vi.mock('@/components/interior/modal', () => ({ Modal: () => null }));

function proc(over: Partial<HookProcessInfo> = {}): HookProcessInfo {
    return {
        pid: 100,
        name: 'qq',
        path: '/opt/QQ/qq',
        injected: true,
        connected: true,
        loggedIn: true,
        uin: '10001',
        status: 'online',
        error: '',
        method: 'loadModuleManual',
        account: { uin: '10001', nickname: '测试' },
        ...over,
    };
}

function conn(over: Partial<AccountConnections> = {}): AccountConnections {
    return {
        uin: '10001',
        nickname: '测试',
        adapters: [{ name: 'ws', kind: 'wsServer', status: 'ok', detail: 'listening' }],
        ...over,
    };
}

let host: ReturnType<typeof hookHost>;
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
        language: 'zh',
        processList: [],
        qqList: [],
        connections: [],
        ready: { processList: true, qqList: true, connections: true },
        errors: { processList: '', qqList: '', connections: '' },
        pendingOp: null,
    });
    host = hookHost();
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

function render() {
    return renderToStaticMarkup(<GettingStartedPanel />);
}

function action(tree: ReactNode, label: string) {
    const node = elements(tree).find(
        (element) =>
            Array.isArray(element.props.children) && element.props.children.includes(label),
    );

    if (!node) {
        throw new Error(`Missing action: ${label}`);
    }

    return node;
}

function makeReady() {
    state.processList = [proc()];
    state.qqList = [{ uin: '10001', nickname: '测试' }];
    state.connections = [conn()];
}

describe('GettingStartedPanel', () => {
    it('renders English steps and keeps the original error and navigation target', () => {
        state.language = 'en';
        makeReady();
        let html = render();
        expect(html).toContain('aria-label="Connection workflow"');
        expect(html).toContain('Connection ready');
        expect(html).toContain('href="/logs"');
        expect(html).toContain('View results');
        expect(html).toContain('QQ 10001');

        state.errors.qqList = '读取超时 (E_READ)';
        html = render();
        expect(html).toContain('Could not read connection status');
        expect(html).toContain('Check again');
        expect(html).toContain('role="alert"');
        expect(html).toContain('读取超时 (E_READ)');
        expect(html).not.toContain('href="/logs"');
    });

    it('releases the reserved title after reading without clipping wrapped headings', () => {
        makeReady();
        expect(render()).toMatch(/aria-label="下一步提示"[^>]*class="[^"]*skeleton-swap-fluid/);
        expect(render()).not.toContain('height:20px');
        expect(render()).toContain('<h3');
        state.ready = { processList: false, qqList: false, connections: false };
        expect(render()).not.toContain('skeleton-swap-fluid');
    });

    it('composes a selected session, next action and results rather than the inherited attach checklist', () => {
        makeReady();
        const html = render();
        expect(html).toContain('连接已就绪');
        expect(html).toContain('连接说明');
        expect(html).toContain('href="/logs"');
        expect(html).toContain('aria-label="连接路径"');
        expect(html).toContain('当前 QQ');

        for (const stage of ['QQ 会话', '机器人连接', '查看结果']) {
            expect(html).toContain(stage);
        }

        expect(html).not.toContain('连接进度');
        expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    });

    it('does not interpret unread empty lists as QQ not being open', () => {
        state.ready = { processList: false, qqList: false, connections: false };
        expect(render()).not.toContain('打开 QQ');
        expect(render()).toContain('aria-busy="true"');
    });

    it('prompts opening QQ only after successfully reading empty lists', () => {
        expect(render()).toContain('我已打开 QQ');
    });

    it('preserves raw read errors with an alert and a retry action', () => {
        state.errors.qqList = '连接超时';
        const html = render();
        expect(html).toContain('role="alert"');
        expect(html).toContain('连接超时');
        expect(html).toContain('重新检查');
    });

    it('requires an explicit PID choice without technical injection copy', () => {
        state.processList = [proc({ pid: 100 }), proc({ pid: 200 })];
        const html = render();
        expect(html).toContain('选择 QQ');
        expect(html).not.toContain('选择内核并接入');

        for (const term of ['注入', '管道', 'OneBot']) {
            expect(html).not.toContain(term);
        }
    });

    it('shows the shared kernel entry for an available session and disables actions during work', () => {
        state.processList = [proc({ status: 'available', injected: false })];
        expect(render()).toContain('选择内核并接入');
        state.pendingOp = 'load';
        const html = render();
        expect(html).toContain('正在处理 QQ 会话');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?处理中/);
        expect(html).not.toContain('选择内核并接入');
        expect(html).not.toContain('animate-spin');
    });

    it('does not nudge a manually stopped session, but keeps errors and pending work visible', () => {
        state.processList = [proc({ status: 'available', manualStopped: true, injected: false })];
        expect(render()).toBe('');
        state.pendingOp = 'unload';
        expect(render()).toContain('正在处理 QQ 会话');
        state.pendingOp = null;
        state.processList[0].error = '停止失败';
        expect(render()).toContain('role="alert"');
        expect(render()).toContain('停止失败');
        expect(render()).not.toContain('选择内核并接入');
        state.errors.qqList = '读取失败';
        expect(render()).toContain('读取失败');
    });

    it('does not present an unknown UIN or mismatched identity as a confirmed login', () => {
        state.processList = [proc({ uin: '0', account: null })];
        const html = render();
        expect(html).toContain('QQ 会话身份待确认');
        expect(html).toContain('PID 100');
        expect(html).not.toContain('QQ 0');
        expect(html).not.toContain('>已登录<');
    });

    it('uses the guarded shared load exactly once, with no overview confirmation or fabricated cancellation success', async () => {
        state.processList = [proc({ status: 'available', injected: false })];
        const tree = host.render(() => GettingStartedPanel());
        (action(tree, '选择内核并接入').props.onClick as () => void)();
        expect(state.load).toHaveBeenCalledExactlyOnceWith(100);
        await Promise.resolve();
        const unchanged = host.render(() => GettingStartedPanel());
        expect(
            elements(unchanged).find((element) => element.props['aria-label'] === '连接工作流')
                ?.props['data-ready'],
        ).toBe(false);
        const source = readFileSync(
            new URL('../src/components/overview/getting-started-panel.tsx', import.meta.url),
            'utf8',
        );
        expect(source.match(/processOps\.load\(/g)).toHaveLength(1);
        expect(source).not.toContain('ConfirmDialog');
        expect(source).not.toContain('api.process');
    });

    it('keeps an open connection explanation localized without losing its snapshot', () => {
        makeReady();
        (action(host.render(GettingStartedPanel), '连接说明').props.onClick as () => void)();
        state.language = 'en';
        const dialog = elements(host.render(GettingStartedPanel)).find(
            (item) => item.props.open === true,
        );
        expect(dialog?.props.title).toBe('Connection details');
        expect(dialog?.props.description).toBe('Connection ready');
        expect(dialog?.props.closeLabel).toBe('Close connection details');
        expect(state.load).not.toHaveBeenCalled();
        expect(state.refreshProcesses).not.toHaveBeenCalled();
    });

    it('clears an open selection when stopped, so later snapshots cannot reopen a stale modal', () => {
        state.processList = [proc({ pid: 100 }), proc({ pid: 200 })];
        (
            action(
                host.render(() => GettingStartedPanel()),
                '选择 QQ',
            ).props.onClick as () => void
        )();
        expect(
            elements(host.render(() => GettingStartedPanel())).some(
                (element) => element.props.open === true,
            ),
        ).toBe(true);
        state.processList = [proc({ status: 'available', injected: false, manualStopped: true })];
        expect(host.render(() => GettingStartedPanel())).toBeNull();
        state.processList = [proc({ status: 'available', injected: false })];
        expect(
            elements(host.render(() => GettingStartedPanel())).some(
                (element) => element.props.open === true,
            ),
        ).toBe(false);
        expect(state.load).not.toHaveBeenCalled();
    });
});
