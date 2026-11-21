import { describe, it, expect } from 'vitest';
import { nextStep, pickTargetProcess, type StepInput } from '../src/lib/next-step';
import type { AccountConnections, HookProcessInfo } from '../src/types';

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
        adapters: [
            {
                name: 'ws',
                kind: 'wsServer',
                status: 'ok',
                detail: 'listening',
            },
        ],
        ...over,
    };
}

function input(over: Partial<StepInput> = {}): StepInput {
    const base: StepInput = {
        ready: { processList: true, qqList: true, connections: true },
        errors: { processList: '', qqList: '', connections: '' },
        processList: [proc()],
        qqList: [{ uin: '10001', nickname: '测试' }],
        connections: [conn()],
        selectedPid: null,
        pendingOp: null,
    };

    return { ...base, ...over };
}

describe('nextStep — 读取阶段', () => {
    it('任一资源读取失败时，即使留着旧数据也不宣布正常', () => {
        const step = nextStep(
            input({ errors: { processList: '', qqList: '超时', connections: '' } }),
        );
        expect(step.id).toBe('read-error');
        expect(step.error).toBe('超时');
        expect(step.action).toBe('refresh-all');
    });

    it('localizes operator context without changing API error details or the recovery action', () => {
        const error = '读取超时 (E_READ)';
        const step = nextStep(
            input({ errors: { processList: error, qqList: '', connections: '' } }),
            null,
            (_, en) => en,
        );
        expect(step).toMatchObject({
            id: 'read-error',
            title: 'Could not read connection status',
            error,
            action: 'refresh-all',
            actionLabel: 'Check again',
            done: false,
        });
    });

    it('未就读绪的空数组不能当成「没打开 QQ」', () => {
        const step = nextStep(
            input({
                ready: { processList: false, qqList: false, connections: false },
                processList: [],
                qqList: [],
                connections: [],
            }),
        );
        expect(step.id).toBe('reading');
        expect(step.action).toBeNull();
    });

    it('读绪且全空才是「去打开 QQ」', () => {
        const step = nextStep(input({ processList: [], qqList: [], connections: [] }));
        expect(step.id).toBe('no-qq');
        expect(step.actionLabel).toContain('打开 QQ');
    });
});

describe('nextStep — 选择目标', () => {
    it('多个进程时要求选择，不批量接入', () => {
        const step = nextStep(
            input({
                processList: [proc({ pid: 100 }), proc({ pid: 200 })],
            }),
        );
        expect(step.id).toBe('choose-qq');
        expect(step.action).toBe('choose-qq');
    });

    it('面板选中的 PID 消失时不静默切换到另一个 QQ', () => {
        const step = nextStep(input({ processList: [proc({ pid: 200 })], selectedPid: 100 }));
        expect(step.id).toBe('selection-lost');
    });

    it('有账号记录但无对应进程时显示待确认，而不是成功', () => {
        const step = nextStep(input({ processList: [] }));
        expect(step.id).toBe('mismatch');
    });

    it('pickTargetProcess：唯一进程直接选中', () => {
        const r = pickTargetProcess([proc()], null, null);
        expect(r.target?.pid).toBe(100);
        expect(r.needsChoice).toBe(false);
    });
});

describe('nextStep — 进程接入状态', () => {
    const cases: Array<[HookProcessInfo['status'], string]> = [
        ['loading', 'connecting'],
        ['error', 'load-failed'],
        ['disconnected', 'disconnected'],
        ['available', 'need-load'],
        ['connecting', 'waiting-online'],
        ['loaded', 'need-login'],
    ];

    for (const [status, expected] of cases) {
        it(`status=${status} → ${expected}`, () => {
            const step = nextStep(
                input({ processList: [proc({ status, injected: status !== 'available' })] }),
            );
            expect(step.id).toBe(expected);
        });
    }

    it('操作进行中优先于状态推进，且按钮禁用', () => {
        const step = nextStep(input({ pendingOp: 'load' }));
        expect(step.id).toBe('busy');
        expect(step.action).toBeNull();
    });

    it.each(['available', 'disconnected'] as const)(
        'does not prompt reattachment after an explicit manual stop (%s)',
        (status) => {
            const step = nextStep(input({ processList: [proc({ status, manualStopped: true })] }));
            expect(step).toMatchObject({ id: 'manual-stopped', action: null, done: false });
            expect(step.actionLabel).toBe('');
            expect(nextStep(input({ processList: [proc({ status: 'available' })] })).id).toBe(
                'need-load',
            );
        },
    );

    it('keeps failures and in-flight work visible even when the session was manually stopped', () => {
        const stopped = input({
            processList: [proc({ status: 'available', manualStopped: true })],
        });
        expect(nextStep({ ...stopped, pendingOp: 'unload' }).id).toBe('busy');
        expect(
            nextStep({
                ...stopped,
                errors: { processList: '读取被拒绝', qqList: '', connections: '' },
            }),
        ).toMatchObject({ id: 'read-error', error: '读取被拒绝' });
        expect(
            nextStep(
                input({
                    processList: [
                        proc({ status: 'available', manualStopped: true, error: '停止失败' }),
                    ],
                }),
            ),
        ).toMatchObject({ id: 'manual-stopped', action: 'details', error: '停止失败' });
        expect(
            nextStep(
                input({
                    processList: [
                        proc({ status: 'error', manualStopped: true, error: '连接失败' }),
                    ],
                }),
            ),
        ).toMatchObject({ id: 'load-failed', error: '连接失败' });
    });

    it('online 但标志不一致时不猜原因', () => {
        const step = nextStep(input({ processList: [proc({ connected: false })] }));
        expect(step.id).toBe('mismatch');
    });

    it('account 为 null 不会被当成已登录成功', () => {
        const step = nextStep(input({ processList: [proc({ status: 'loaded', account: null })] }));
        expect(step.id).toBe('need-login');
    });
});

describe('nextStep — 账号准备', () => {
    it('数据库失败优先于「未配置连接」', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        adapters: [],
                        databaseMigration: {
                            phase: 'failed',
                            usable: false,
                            processed: 0,
                            total: null,
                            progress: null,
                            estimatedRemainingSeconds: null,
                            error: '库损坏',
                        },
                    }),
                ],
            }),
        );
        expect(step.id).toBe('account-failed');
        expect(step.error).toBe('库损坏');
    });

    it('准备中不阻塞，显示准备状态', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        databaseMigration: {
                            phase: 'migrating',
                            usable: false,
                            processed: 1,
                            total: 2,
                            progress: 0.5,
                            estimatedRemainingSeconds: null,
                        },
                    }),
                ],
            }),
        );
        expect(step.id).toBe('account-preparing');
    });

    it('shows known account preparation even before the QQ list catches up', () => {
        const step = nextStep(
            input({
                qqList: [],
                connections: [
                    conn({
                        databaseMigration: {
                            phase: 'migrating',
                            usable: false,
                            processed: 0,
                            total: null,
                            progress: null,
                            estimatedRemainingSeconds: null,
                        },
                    }),
                ],
            }),
        );
        expect(step.id).toBe('account-preparing');
    });

    it('同账号多条连接记录不取第一条报正常', () => {
        const step = nextStep(input({ connections: [conn(), conn()] }));
        expect(step.id).toBe('mismatch');
    });
});

describe('nextStep — 连接设置', () => {
    it('没有连接设置时引导去配置', () => {
        const step = nextStep(input({ connections: [conn({ adapters: [] })] }));
        expect(step.id).toBe('no-network');
        expect(step.action).toBe('open-config');
    });

    it('全部 disabled 视为未启用', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        adapters: [
                            { name: 'ws', kind: 'wsServer', status: 'disabled', detail: '' },
                        ],
                    }),
                ],
            }),
        );
        expect(step.id).toBe('network-off');
    });

    it('down / degraded 视为异常，不被同账号的 ok 掩盖', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        adapters: [
                            { name: 'a', kind: 'wsServer', status: 'ok', detail: 'listening' },
                            {
                                name: 'b',
                                kind: 'httpServer',
                                status: 'down',
                                detail: 'bind failed',
                            },
                        ],
                    }),
                ],
            }),
        );
        expect(step.id).toBe('network-broken');
        expect(step.error).toContain('bind failed');
    });

    it('warn 提示对端还需要检查', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        adapters: [
                            { name: 'c', kind: 'wsClient', status: 'warn', detail: '重连中' },
                        ],
                    }),
                ],
            }),
        );
        expect(step.id).toBe('network-warn');
    });

    it('keeps endpoint recovery, names and raw error details intact in English', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        adapters: [
                            {
                                name: '用户端点',
                                kind: 'wsClient',
                                status: 'warn',
                                detail: '原始连接状态',
                                lastError: '原始错误 (E_WS)',
                            },
                        ],
                    }),
                ],
            }),
            null,
            (_, en) => en,
        );
        expect(step.id).toBe('network-warn');
        expect(step.title).toBe('Check your bot connection');
        expect(step.action).toBe('details');
        expect(step.actionLabel).toBe('View details');
        expect(step.error).toBe('用户端点: 原始错误 (E_WS)');
    });

    it('ws server 零客户端仍算 ok，但不宣称机器人已连上', () => {
        const step = nextStep(input());
        expect(step.id).toBe('ready');
        expect(step.done).toBe(true);
        expect(step.title).not.toContain('机器人已连接');
        expect(step.hint).toContain('回复由机器人程序负责');
        expect(step.hint).toContain('核对消息');
    });

    it('历史消息整理失败但账号可用时不阻塞', () => {
        const step = nextStep(
            input({
                connections: [
                    conn({
                        databaseMigration: {
                            phase: 'failed',
                            usable: true,
                            processed: 0,
                            total: null,
                            progress: null,
                            estimatedRemainingSeconds: null,
                        },
                    }),
                ],
            }),
        );
        expect(step.id).toBe('ready');
        expect(step.hint).toContain('不影响');
    });
});
