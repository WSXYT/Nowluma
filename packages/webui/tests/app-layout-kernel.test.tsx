import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '../src/router/app-layout';
import { KernelChoiceDialog } from '../src/components/kernel-choice';
import type * as I18n from '../src/i18n';
import type { AccountConnections } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    beforeAttach: vi.fn(),
    cancelPending: vi.fn(),
    logout: vi.fn(async () => undefined),
    onLogoutComplete: vi.fn(),
    refreshProcesses: vi.fn(),
    reloadAppearance: vi.fn(),
    useHookProcessOps: vi.fn(),
    language: 'zh' as I18n.Language,
    connections: [] as AccountConnections[],
    pending: {
        target: { pid: 4242, path: '/DEMO/QQ', uin: '10001', nickname: 'A', injected: true },
        catalog: { riskVersion: 'fixture-current' },
        confirm: vi.fn(),
        cancel: vi.fn(),
    },
    ops: { load: vi.fn(), refresh: vi.fn(), unload: vi.fn(), statusOf: vi.fn(), banner: '' },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(mocks.language) };
});
vi.mock('@/lib/api', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useApi: () => ({ logout: mocks.logout }),
}));
vi.mock('@/contexts/ThemeContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useTheme: () => ({ pollInterval: 10000, reloadAppearance: mocks.reloadAppearance }),
}));
vi.mock('@/contexts/SessionContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useSession: () => ({ status: 'fixture', onLogoutComplete: mocks.onLogoutComplete }),
}));
vi.mock('@/hooks/use-app-resources', () => ({
    useAppResources: () => ({
        connections: mocks.connections,
        systemInfo: null,
        refreshProcesses: mocks.refreshProcesses,
    }),
}));
vi.mock('@/hooks/use-kernel-choice', () => ({
    useKernelChoice: () => ({ pending: mocks.pending, beforeAttach: mocks.beforeAttach }),
}));
vi.mock('@/hooks/use-hook-process-ops', () => ({
    useHookProcessOps: (options: unknown) => {
        mocks.useHookProcessOps(options);
        return {
            ops: mocks.ops,
            unloadFailedAlert: null,
            dismissUnloadFailedAlert: vi.fn(),
            cancelPending: mocks.cancelPending,
        };
    },
}));

afterEach(() => {
    mocks.language = 'zh';
    mocks.connections = [];
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('AppLayout shared kernel choice owner', () => {
    it('passes one gated process owner to every route and keys one modal by real account/version', async () => {
        const host = hookHost();
        const tree = host.render(() => AppLayout());
        expect(mocks.useHookProcessOps).toHaveBeenCalledWith({
            beforeAttach: mocks.beforeAttach,
            onAfterOp: mocks.refreshProcesses,
        });
        expect(tree.props.value.processOps).toBe(mocks.ops);
        const dialogs = elements(tree).filter((element) => element.type === KernelChoiceDialog);
        expect(dialogs).toHaveLength(1);
        expect(dialogs[0].key).toMatch(/4242.*10001.*fixture-current/);
        expect(dialogs[0].props.choice).toBe(mocks.pending);
        await (dialogs[0].props.onStop as () => Promise<void>)();
        expect(mocks.ops.unload).toHaveBeenCalledTimes(1);
        expect(mocks.ops.unload).toHaveBeenCalledWith(mocks.pending.target.pid);
        await tree.props.value.onLogout();
        expect(mocks.cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.logout.mock.invocationCallOrder[0],
        );
        expect(mocks.logout.mock.invocationCallOrder[0]).toBeLessThan(
            mocks.onLogoutComplete.mock.invocationCallOrder[0],
        );
        host.unmount();
    });

    it('updates migration copy without reloading appearance or remounting the kernel choice', () => {
        mocks.connections = [
            {
                uin: '10001',
                nickname: 'A',
                adapters: [],
                databaseMigration: {
                    phase: 'preparing',
                    usable: false,
                    processed: 0,
                    total: 1,
                    progress: 0,
                    estimatedRemainingSeconds: 1,
                },
            },
        ];
        const host = hookHost();
        const initial = elements(host.render(AppLayout));
        const initialNotice = initial.find((element) => element.props.notice)?.props.notice;
        expect(JSON.stringify(initialNotice)).toContain('1 个账号正在准备数据库');

        const initialDialog = initial.find((element) => element.type === KernelChoiceDialog);

        mocks.language = 'en';
        const translated = elements(host.render(AppLayout));
        const translatedNotice = translated.find((element) => element.props.notice)?.props.notice;
        expect(JSON.stringify(translatedNotice)).toContain('Preparing databases: 1');
        const translatedDialog = translated.find((element) => element.type === KernelChoiceDialog);
        expect(translatedDialog?.key).toBe(initialDialog?.key);
        expect(translatedDialog?.props.choice).toBe(mocks.pending);
        expect(mocks.reloadAppearance).toHaveBeenCalledTimes(1);
        host.unmount();
    });
});
