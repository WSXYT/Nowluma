import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LayoutModule from '../src/contexts/LayoutContext';
import { LocaleProvider, type Language } from '../src/i18n';
import { OverviewPage } from '../src/components/pages/overview-page';
import { TooltipProvider } from '../src/components/ui/tooltip';
import { defaultOverviewGrid } from '../src/lib/dashboard-layout';
import type {
    AccountConnections,
    HookProcessInfo,
    QQInfo,
    SystemInfo,
    UiLayoutItem,
} from '../src/types';

const state = vi.hoisted(() => ({
    status: '已连接',
    error: '' as string,
    blocks: [] as UiLayoutItem[],
    processes: [] as HookProcessInfo[],
    sessions: [] as QQInfo[],
    connections: [] as AccountConnections[],
    system: null as SystemInfo | null,
}));

vi.mock('@tanstack/react-router', () => ({
    Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
        <a href={to} {...props}>
            {children}
        </a>
    ),
}));
vi.mock('@/components/overview/getting-started-panel', () => ({ GettingStartedPanel: () => null }));
vi.mock('@/components/pages/dashboard-grid', () => ({
    WIDGET_DRAG_TYPE: 'text/plain',
    DashboardGrid: ({
        blocks,
        renderWidget,
    }: {
        blocks: UiLayoutItem[];
        renderWidget: (block: UiLayoutItem) => ReactNode;
    }) => (
        <div>
            {blocks.map((block) => (
                <div key={block.id}>{renderWidget(block)}</div>
            ))}
        </div>
    ),
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof LayoutModule>()),
    useLayout: () => ({
        overviewBlocks: state.blocks,
        overviewMobile: [],
        setOverviewBlocks: vi.fn(),
        setOverviewMobile: vi.fn(),
        resetLayout: vi.fn(),
        editing: false,
        setEditing: vi.fn(),
    }),
}));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        qqList: state.sessions,
        processList: state.processes,
        connections: state.connections,
        systemInfo: state.system,
        resources: {
            qqList: { ready: true, error: state.error || null },
            processList: { ready: true, error: state.error || null },
            connections: { ready: true, error: state.error || null },
            systemInfo: { ready: true, error: state.error || null },
        },
        setSelectedUin: vi.fn(),
        refreshSystem: vi.fn(),
    }),
}));
vi.mock('@/contexts/SessionContext', () => ({ useSession: () => ({ status: state.status }) }));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: { disableMotion: true },
        performance: { low: false },
        formatClock: (time: string) => time,
    }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => true }));
vi.mock('@/lib/api', () => ({ useApi: () => ({}) }));

beforeEach(() => {
    state.status = '已连接';
    state.error = '';
    state.blocks = defaultOverviewGrid();
    state.sessions = [{ uin: '10001', nickname: '用户昵称' }];
    state.processes = [
        {
            pid: 4242,
            name: 'QQ.exe',
            path: '',
            injected: true,
            connected: true,
            loggedIn: true,
            uin: '10001',
            status: 'online',
            method: '',
            error: '',
            account: { uin: '10001', nickname: '用户昵称' },
        },
    ];
    state.connections = [
        {
            uin: '10001',
            nickname: '用户昵称',
            adapters: [
                {
                    name: '机器人端点',
                    kind: 'wsServer',
                    status: 'warn',
                    detail: '服务端原始说明',
                    lastError: '原始错误 (E_CONN)',
                    lastErrorAt: 1_700_000_000_000,
                },
            ],
            databaseMigration: {
                phase: 'migrating',
                usable: true,
                processed: 1000,
                total: 2000,
                progress: 0.5,
                estimatedRemainingSeconds: 65,
            },
        },
    ];
    state.system = {
        hostname: 'fixture-host',
        platform: 'linux',
        arch: 'x64',
        archLabel: 'x86-64',
        release: 'fixture-release',
        distro: 'Debian GNU/Linux 12',
        uptime: 90_180,
        processUptime: 3600,
        nodeVersion: '24.22.1',
        cpu: {
            model: 'Fixture CPU',
            cores: 2,
            speedMHz: 2000,
            loadAvg: [0, 0, 0],
            perCore: [10, 20],
            average: 15,
        },
        memory: { total: 8_000_000, free: 4_000_000, used: 4_000_000, usagePercent: 50 },
        runtime: {
            pid: 42,
            lowIntegrity: false,
            rss: 1_000_000,
            heapTotal: 800_000,
            heapUsed: 600_000,
            external: 200_000,
            arrayBuffers: 100_000,
        },
    };
});

function render(language: Language) {
    return renderToStaticMarkup(
        <LocaleProvider fixed={language}>
            <TooltipProvider>
                <OverviewPage />
            </TooltipProvider>
        </LocaleProvider>,
    );
}

describe('OverviewPage localization', () => {
    it('retains the established Chinese workspace copy and uptime', () => {
        const html = render('zh');
        expect(html).toContain('从会话，到结果');
        expect(html).toContain('已登录会话');
        expect(html).toContain('服务在线');
        expect(html).toContain('1 天 1 时 3 分');
        expect(html).toContain('预计剩余 2 分钟');
        expect(html).toContain('已处理 1,000 / 2,000 条');
        expect(html).toContain('Nowluma 进程：1 时');
    });

    it('renders English status, controls and formatting while preserving identities and raw errors', () => {
        const html = render('en');

        for (const label of [
            'From session to results',
            'Edit layout',
            'Signed-in sessions',
            'Console connection',
            'Server online',
            'Resource usage',
            'Memory usage',
            'Bot connections',
            'Manage connections',
            '1d 1h 3m',
            'About 2 min remaining',
            'Processed 1,000 / 2,000 records',
        ]) {
            expect(html).toContain(label);
        }

        expect(html).toContain('Manage bot connections for 用户昵称');
        expect(html).toContain('href="/processes"');
        expect(html).toContain('href="/logs"');
        expect(html).toContain('用户昵称');
        expect(html).toContain('机器人端点');
        expect(html).toContain('服务端原始说明');
        expect(html).toContain('原始错误 (E_CONN)');
        expect(html).not.toContain('未接入账号');
    });

    it('explains stale data and disconnected status in English without rewriting server errors', () => {
        state.status = '未连接';
        state.error = '读取超时 (E_READ)';
        const html = render('en');
        expect(html).toContain('Disconnected');
        expect(html).toContain('Check the server process');
        expect(html).toContain('Refresh failed; showing previous data');
        expect(html).toContain(
            '读取超时 (E_READ) Showing the last successfully loaded QQ sessions.',
        );
        expect(html).toContain(
            '读取超时 (E_READ) Showing the last successfully loaded connection status.',
        );
        expect(html).not.toContain('>Server online<');
    });
});
