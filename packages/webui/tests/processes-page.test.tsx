import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessesPage } from '../src/components/pages/processes-page';
import { LocaleProvider, type Language } from '../src/i18n';
import type { HookProcessInfo } from '../src/types';

const state = vi.hoisted(() => ({
    processList: [] as HookProcessInfo[],
    ready: true,
    error: '',
    banner: null as string | null,
    operation: null as 'load' | 'unload' | 'refresh' | null,
    canCancelAttach: undefined as boolean | undefined,
}));

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        processList: state.processList,
        processOps: {
            statusOf: () => state.operation,
            banner: state.banner,
            canCancelAttach:
                state.canCancelAttach === undefined ? undefined : () => state.canCancelAttach,
        },
        refreshProcesses: vi.fn(),
        resources: { processList: { ready: state.ready, error: state.error } },
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({ pages: { processesSort: 'pid' }, setPages: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ appearance: { disableMotion: true } }),
}));
vi.mock('@/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

beforeEach(() =>
    Object.assign(state, {
        processList: [],
        ready: true,
        error: '',
        operation: null,
        banner: null,
        canCancelAttach: undefined,
    }),
);

function renderProcess(overrides: Partial<HookProcessInfo>, language: Language = 'zh') {
    state.processList = [
        {
            pid: 4242,
            name: 'qq',
            path: '',
            injected: false,
            connected: false,
            loggedIn: false,
            uin: '0',
            status: 'available',
            error: '',
            method: '',
            account: null,
            ...overrides,
        },
    ];
    return renderToStaticMarkup(
        <LocaleProvider fixed={language}>
            <ProcessesPage />
        </LocaleProvider>,
    );
}

describe('process account labels', () => {
    it.each(['zh', 'en'] as const)(
        'marks only the selected process and applicable action in %s',
        (language) => {
            const available = renderProcess({}, language);
            expect(available).toMatch(/<section[^>]*data-tutorial-control="process-detail"/);
            expect(available).toMatch(/<button[^>]*data-tutorial-control="process-load"/);
            expect(available).not.toContain('data-tutorial-control="process-unload"');

            const injected = renderProcess({ injected: true }, language);
            expect(injected).toMatch(/<button[^>]*data-tutorial-control="process-unload"/);
            expect(injected).not.toContain('data-tutorial-control="process-load"');

            state.processList = [state.processList[0], { ...state.processList[0], pid: 4243 }];
            const unselected = renderToStaticMarkup(
                <LocaleProvider fixed={language}>
                    <ProcessesPage />
                </LocaleProvider>,
            );
            expect(unselected).not.toContain('data-tutorial-control="process-detail"');
        },
    );

    it('renders English controls and preserves the original process identity and error', () => {
        state.error = '读取超时 (E_READ)';
        const html = renderProcess(
            {
                name: 'QQ.exe',
                account: { uin: '10001', nickname: '测试号' },
                error: '原始错误 (E_PIPE)',
            },
            'en',
        );
        expect(html).toContain('QQ processes');
        expect(html).toContain('Select process PID 4242, QQ 10001');
        expect(html).toContain('Detected locally; sign-in not confirmed');
        expect(html).toContain('Load Nowluma into this PID');
        expect(html).toContain(
            '读取超时 (E_READ) Showing the last successfully loaded process status.',
        );
        expect(html).toContain('原始错误 (E_PIPE)');
        expect(html).toContain('测试号');
    });

    it('does not label an unidentified process as signed out', () => {
        const markup = renderProcess({});
        expect(markup).toContain('PID 4242');
        expect(markup).not.toContain('未登录');
        expect(markup).not.toContain('/avatar/');
    });

    it('shows the locally detected identity before hook login', () => {
        const markup = renderProcess({ account: { uin: '10001', nickname: 'Alice' } });
        expect(markup).toContain('Alice');
        expect(markup).toContain('/avatar/10001');
        expect(markup).toContain('QQ 10001');
    });

    it('uses native login identity without an account database', () => {
        const markup = renderProcess({ loggedIn: true, uin: '10002', status: 'online' });
        expect(markup).toContain('/avatar/10002');
        expect(markup).toContain('已在线');
    });

    it('keeps stale identity visible with an explicit read-error alert', () => {
        state.error = '读取超时';
        const markup = renderProcess({ account: { uin: '10001', nickname: 'Alice' } });
        expect(markup).toContain('role="alert"');
        expect(markup).toContain('读取超时；当前显示上次成功读取的进程状态。');
        expect(markup).toContain('Alice');
    });

    it('does not replace a pending read with the empty-process state', () => {
        state.ready = false;
        state.processList = [];
        const markup = renderToStaticMarkup(<ProcessesPage />);
        expect(markup).not.toContain('未检测到可加载 QQ 主进程');
        expect(markup).toContain('进程列表');
    });

    it('retains busy, unload and reconnect controls in the stable rows', () => {
        const online = renderProcess({
            injected: true,
            loggedIn: true,
            uin: '10002',
            status: 'online',
        });
        expect(online).toContain('卸载');
        expect(online).toContain('aria-label="刷新进程 4242 管道状态"');
        state.operation = 'unload';
        const busy = renderProcess({
            injected: true,
            loggedIn: true,
            uin: '10002',
            status: 'online',
        });
        expect(busy).toContain('卸载中');
        expect(busy).toContain('disabled=""');
    });

    it.each(['load', 'refresh'] as const)(
        'keeps the injected target unload control usable during a pending %s authorization',
        (operation) => {
            state.operation = operation;
            state.canCancelAttach = true;
            const markup = renderProcess({ injected: true, status: 'loaded' });
            const button = markup
                .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
                ?.find((element) => element.includes('卸载'));
            expect(button).toBeDefined();
            expect(button).not.toContain('disabled=""');
        },
    );

    it('keeps the unload control disabled during an already dispatched native mutation', () => {
        state.operation = 'refresh';
        state.canCancelAttach = false;
        const markup = renderProcess({ injected: true, status: 'loaded' });
        const button = markup
            .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
            ?.find((element) => element.includes('卸载'));
        expect(button).toContain('disabled=""');
    });

    it('does not enable a backend-loading control when there is no cancelable frontend authorization', () => {
        state.canCancelAttach = false;
        const markup = renderProcess({ injected: true, status: 'loading' });
        const button = markup
            .match(/<button\b[^>]*>[\s\S]*?<\/button>/g)
            ?.find((element) => element.includes('卸载'));
        expect(button).toContain('disabled=""');
    });

    it('announces terminal process messages with a notice icon rather than a busy spinner', () => {
        state.banner = '已从进程 4242 卸载';
        const markup = renderProcess({});
        expect(markup).toContain('role="status"');
        expect(markup).toContain('已从进程 4242 卸载');
        expect(markup).toContain('lucide-info');
        expect(markup).not.toContain('animate-spin');
        expect(markup).not.toContain('卸载中');
    });

    it('does not apply a stale local nickname to a newly logged-in account', () => {
        const markup = renderProcess({
            loggedIn: true,
            uin: '10002',
            status: 'online',
            account: { uin: '10001', nickname: 'Alice' },
        });
        expect(markup).toContain('/avatar/10002');
        expect(markup).not.toContain('Alice');
        expect(markup).not.toContain('10001');
    });
});
