// 「接下来做什么」的判定逻辑。
//
// 只做纯计算：输入是首页已经拿到的资源快照，输出是当前该显示的一步。
// 不读 DOM、不请求接口、不保存状态，这样表驱动测试可以直接覆盖全部状态。
//
// 关键约束（见 packages/webui/README.md 的账号检测说明）：
// - account !== null 只表示「本地认出了身份」，不等于登录完成；
// - 资源 ready 才代表「读到了空」，未 ready 的空数组不能当成「没打开 QQ」；
// - 任一侧读取失败时不能说成功，即使还留着上次的数据。
import type { AccountConnections, AdapterStatus, HookProcessInfo, QQInfo } from '@/types';
import { defaultTranslate, type Translate } from '@/i18n';

export type StepId =
    | 'reading'
    | 'read-error'
    | 'no-qq'
    | 'choose-qq'
    | 'selection-lost'
    | 'mismatch'
    | 'busy'
    | 'connecting'
    | 'load-failed'
    | 'disconnected'
    | 'need-load'
    | 'manual-stopped'
    | 'waiting-online'
    | 'need-login'
    | 'account-preparing'
    | 'account-failed'
    | 'no-network'
    | 'network-off'
    | 'network-broken'
    | 'network-warn'
    | 'ready';

export type StepAction =
    'refresh-all' | 'choose-qq' | 'load' | 'refresh' | 'open-config' | 'details';

export interface StepView {
    id: StepId;
    /** 一句话人话。不要出现「注入」「管道」「OneBot」这类术语。 */
    title: string;
    /** 补充说明；没有就给空串。 */
    hint: string;
    action: StepAction | null;
    actionLabel: string;
    /** 这一步是否算「已经做完了」。 */
    done: boolean;
    /** 该显示的原始错误，非空时必须以 role="alert" 展示。 */
    error: string;
}

export interface StepInput {
    ready: { processList: boolean; qqList: boolean; connections: boolean };
    errors: { processList: string; qqList: string; connections: string };
    processList: HookProcessInfo[];
    qqList: QQInfo[];
    connections: AccountConnections[];
    /** 面板自己选定的 PID；未选为 null。 */
    selectedPid: number | null;
    /** 正在进行的操作（load/unload/refresh）。 */
    pendingOp: 'load' | 'unload' | 'refresh' | null;
}

type StepCopy = readonly [
    title: readonly [string, string],
    hint: readonly [string, string] | null,
    action: StepAction | null,
    actionLabel: readonly [string, string] | null,
];

const CHECK_AGAIN = ['重新检查', 'Check again'] as const;
const VIEW_DETAILS = ['查看原因', 'View details'] as const;
const CONFIGURE_BOT = ['配置机器人连接', 'Configure bot connections'] as const;
const RECONNECT = ['重新连接', 'Reconnect'] as const;
const RETRY_CONNECT = ['重试接入', 'Retry connection'] as const;

const STEP_COPY = {
    reading: [
        ['正在读取连接状态', 'Reading connection status'],
        null,
        null,
        ['检查中…', 'Checking…'],
    ],
    'read-error': [
        ['连接状态读取失败', 'Could not read connection status'],
        null,
        'refresh-all',
        CHECK_AGAIN,
    ],
    'no-qq': [
        ['先打开并登录 QQ', 'Open QQ and sign in first'],
        [
            '在运行 Nowluma 的设备上打开 QQ 并登录。',
            'Open QQ on the device running Nowluma and sign in.',
        ],
        'refresh-all',
        ['我已打开 QQ', 'I’ve opened QQ'],
    ],
    'choose-qq': [
        ['选择 QQ 会话', 'Select a QQ session'],
        ['多个 QQ 正在运行，请选一个。', 'Multiple QQ sessions are running. Select one.'],
        'choose-qq',
        ['选择 QQ', 'Select QQ'],
    ],
    'selection-lost': [
        ['所选 QQ 已不在列表中', 'The selected QQ session is no longer listed'],
        [
            '重新检查后选择，可能是 QQ 已退出或重启。',
            'QQ may have quit or restarted. Check again, then select a session.',
        ],
        'refresh-all',
        CHECK_AGAIN,
    ],
    mismatch: [
        ['QQ 会话身份待确认', 'QQ session identity is unconfirmed'],
        ['请确认 QQ 已完成登录，再重新检查。', 'Finish signing in to QQ, then check again.'],
        'refresh-all',
        CHECK_AGAIN,
    ],
    busy: [['正在处理 QQ 会话', 'Working on the QQ session'], null, null, ['处理中…', 'Working…']],
    connecting: [
        ['正在接入 QQ 会话', 'Connecting the QQ session'],
        null,
        null,
        ['连接中…', 'Connecting…'],
    ],
    'load-failed': [
        ['QQ 会话接入失败', 'Could not connect the QQ session'],
        [
            '可以重试；持续失败时请查看运行记录。',
            'Try again. If the problem persists, check the runtime logs.',
        ],
        'load',
        RETRY_CONNECT,
    ],
    disconnected: [
        ['QQ 会话连接已断开', 'The QQ session disconnected'],
        null,
        'refresh',
        RECONNECT,
    ],
    'need-load': [
        ['QQ 会话待接入', 'The QQ session is not connected yet'],
        null,
        'load',
        ['选择内核并接入', 'Select a kernel and connect'],
    ],
    'manual-stopped': [
        ['QQ 会话已停止', 'The QQ session was stopped'],
        ['不会自动重新接入。', 'It will not reconnect automatically.'],
        null,
        null,
    ],
    'waiting-online': [
        ['等待 QQ 会话连接', 'Waiting for the QQ session to connect'],
        ['如果状态没有变化，可以重新检查。', 'Check again if the status does not change.'],
        'refresh',
        ['检查一下', 'Check status'],
    ],
    'need-login': [
        ['请在 QQ 中完成登录', 'Finish signing in to QQ'],
        [
            '扫码或密码登录完成后，再回来检查。',
            'Sign in with a QR code or password, then check again.',
        ],
        'refresh',
        ['已登录，检查状态', 'I’ve signed in; check status'],
    ],
    'account-preparing': [
        ['正在准备会话数据', 'Preparing session data'],
        null,
        null,
        ['准备中…', 'Preparing…'],
    ],
    'account-failed': [
        ['会话数据准备失败', 'Could not prepare session data'],
        null,
        'details',
        VIEW_DETAILS,
    ],
    'no-network': [
        ['连接你的机器人', 'Connect your bot'],
        [
            '添加连接，按连接方式配置机器人程序。',
            'Add a connection and configure your bot for that connection type.',
        ],
        'open-config',
        CONFIGURE_BOT,
    ],
    'network-off': [
        ['启用一个机器人连接', 'Enable a bot connection'],
        ['QQ 已接入，连接设置尚未启用。', 'QQ is connected, but no bot connection is enabled.'],
        'open-config',
        CONFIGURE_BOT,
    ],
    'network-broken': [
        ['机器人连接出现异常', 'A bot connection failed'],
        null,
        'details',
        VIEW_DETAILS,
    ],
    'network-warn': [
        ['机器人连接需要检查', 'Check your bot connection'],
        [
            '检查程序是否已连接，以及访问令牌是否一致。',
            'Check that the bot is connected and the access tokens match.',
        ],
        'details',
        VIEW_DETAILS,
    ],
    ready: [
        ['连接已就绪', 'Connection ready'],
        [
            '请在运行记录核对消息；回复由机器人程序负责。',
            'Check messages in the runtime logs. Your bot handles replies.',
        ],
        'details',
        ['连接说明', 'Connection details'],
    ],
} as const satisfies Record<StepId, StepCopy>;

export function stepTitle(id: StepId, t: Translate): string {
    const [[zh, en]] = STEP_COPY[id];
    return t(zh, en);
}

function hasProblems(adapters: AdapterStatus[]): {
    broken: AdapterStatus[];
    warn: AdapterStatus[];
    ok: AdapterStatus[];
} {
    const broken = adapters.filter((a) => a.status === 'down' || a.status === 'degraded');
    const warn = adapters.filter((a) => a.status === 'warn');
    const ok = adapters.filter((a) => a.status === 'ok');
    return { broken, warn, ok };
}

function describeAdapters(list: AdapterStatus[]): string {
    return list
        .map((a) => `${a.name}: ${a.lastError || a.detail}`)
        .filter((s) => s.trim().length > 0)
        .join('\n');
}

/**
 * 选定正在引导的那个 QQ。
 * 规则依次为：保留面板自己的选择 → 复用已选中账号 → 只有一个就走它 → 否则要求选择。
 */
export function pickTargetProcess(
    processList: HookProcessInfo[],
    selectedPid: number | null,
    selectedUin: string | null,
): { target: HookProcessInfo | null; needsChoice: boolean; lostSelection: boolean } {
    if (selectedPid != null) {
        const kept = processList.find((p) => p.pid === selectedPid);

        if (kept) {
            return { target: kept, needsChoice: false, lostSelection: false };
        }

        return { target: null, needsChoice: false, lostSelection: true };
    }

    if (processList.length === 1) {
        return { target: processList[0], needsChoice: false, lostSelection: false };
    }

    if (selectedUin) {
        const byUin = processList.filter((p) => p.uin === selectedUin && p.loggedIn);

        if (byUin.length === 1) {
            return { target: byUin[0], needsChoice: false, lostSelection: false };
        }
    }

    if (processList.length > 1) {
        return { target: null, needsChoice: true, lostSelection: false };
    }

    return { target: null, needsChoice: false, lostSelection: false };
}

export function nextStep(
    input: StepInput,
    selectedUin: string | null = null,
    t: Translate = defaultTranslate,
): StepView {
    const { ready, errors, processList, qqList, connections, selectedPid, pendingOp } = input;

    const view = (id: StepId, extra?: Partial<StepView>): StepView => {
        const [, hint, action, actionLabel] = STEP_COPY[id];
        return {
            id,
            title: stepTitle(id, t),
            hint: hint ? t(hint[0], hint[1]) : '',
            action,
            actionLabel: actionLabel ? t(actionLabel[0], actionLabel[1]) : '',
            done: false,
            error: '',
            ...extra,
        };
    };

    // 1. 读取失败优先：有旧数据也不能宣布正常。
    const firstError = [errors.processList, errors.qqList, errors.connections].find(
        (e) => e.trim().length > 0,
    );

    if (firstError) {
        return view('read-error', { error: firstError });
    }

    // 2. 还没读全 → 不能把空数组当成「没开 QQ」。
    if (!ready.processList || !ready.qqList || !ready.connections) {
        return view('reading');
    }

    // 3. 完全没东西。
    if (processList.length === 0 && qqList.length === 0 && connections.length === 0) {
        return view('no-qq');
    }

    // 4. 选目标。
    const { target, needsChoice, lostSelection } = pickTargetProcess(
        processList,
        selectedPid,
        selectedUin,
    );

    if (lostSelection) {
        return view('selection-lost');
    }

    if (needsChoice) {
        return view('choose-qq');
    }

    if (!target) {
        // 有账号或连接记录，但没有任何可对应的进程。
        return view('mismatch');
    }

    // 5. 进程自身的推进。
    if (pendingOp !== null) {
        return view('busy');
    }

    if (
        target.manualStopped === true &&
        (target.status === 'available' || target.status === 'disconnected')
    ) {
        return view('manual-stopped', {
            error: target.error || '',
            action: target.error ? 'details' : null,
            actionLabel: target.error ? t(...VIEW_DETAILS) : '',
        });
    }

    switch (target.status) {
        case 'loading':
            return view('connecting');

        case 'error':
            return view('load-failed', {
                action: target.injected ? 'refresh' : 'load',
                actionLabel: target.injected ? t(...RECONNECT) : t(...RETRY_CONNECT),
                error: target.error || '',
            });

        case 'disconnected':
            return view('disconnected');

        case 'available':
            return view('need-load', { error: target.error || '' });

        case 'connecting':
            return view('waiting-online', { error: target.error || '' });

        case 'loaded':
            return view('need-login', { error: target.error || '' });

        case 'online':
            break;

        default:
            // 状态与标志对不上时不要猜。
            return view('mismatch');
    }

    if (!target.injected || !target.connected || !target.loggedIn) {
        return view('mismatch');
    }

    // 6. 账号准备。
    const matched = connections.filter((c) => c.uin === target.uin);

    if (matched.length > 1) {
        // 同一账号可能同时存在已退出的旧实例，不能取第一条报正常。
        return view('mismatch');
    }

    const account = matched[0];
    const qqEntry = qqList.find((q) => q.uin === target.uin);

    if (!account) {
        return view('mismatch');
    }

    const migration = account.databaseMigration;

    if (migration && migration.usable === false) {
        if (migration.phase === 'failed') {
            return view('account-failed', {
                error: migration.error || '',
            });
        }

        return view('account-preparing');
    }

    if (!qqEntry) {
        return view('mismatch');
    }

    // 历史消息整理失败但账号可用：不阻塞，但要把说明挂出来。
    const migrationNote =
        migration?.phase === 'failed' && migration.usable
            ? t(
                  '历史消息整理没完成，但不影响 QQ 使用。',
                  'Message history migration did not finish. QQ remains usable.',
              )
            : '';

    // 7. 连接设置。
    if (account.adapters.length === 0) {
        return view('no-network');
    }

    const { broken, warn, ok } = hasProblems(account.adapters);

    if (broken.length > 0) {
        return view('network-broken', {
            error: describeAdapters(broken),
        });
    }

    if (warn.length > 0) {
        return view('network-warn', {
            error: describeAdapters(warn),
        });
    }

    if (ok.length === 0) {
        // 全是 disabled。
        return view('network-off');
    }

    // 服务端 ok 只证明「监听着」或「连着」，不证明机器人会自动回复。
    return view('ready', {
        done: true,
        ...(migrationNote ? { hint: migrationNote } : {}),
    });
}
