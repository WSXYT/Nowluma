import { normalizeOneBotConfig } from '@/lib/onebot-config';
import { assertKernelChoiceInput } from '@/lib/api/kernel';
import type { KernelSelection } from '@/lib/api/types';
import { normalizeUpdateSourceConfig } from '@nowluma/common/update-source';
import type { UpdateSourceConfig } from '@nowluma/common/update-source';
import { APP_VERSION, ALL_ACCOUNTS_CONFIRMATION } from '@/types';
import type {
    DebugInvokeResult,
    GlobalSettings,
    HookProcessInfo,
    LogEntry,
    LogLevel,
    NotificationDeliveryRecord,
    NotificationsConfig,
    OneBotConfig,
    StorageCleanupRequest,
    StorageOverviewResponse,
    SystemSettings,
    SystemSettingsPatch,
    UiConfig,
} from '@/types';
import {
    DEMO_DESKTOP_URL,
    DEMO_NEW_PASSWORD,
    DEMO_PASSWORD,
    DEMO_PID,
    DEMO_TOTP,
    DEMO_UIN,
    demoActions,
    demoConfig,
    demoKernelCatalog,
    demoLog,
    demoProcess,
    demoStorage,
    demoSystem,
    demoSystemSettings,
    demoUi,
} from './fixtures';
import type { TutorialLanguage } from './tutorial-options';

export type DemoScenario = 'setup' | 'ready' | 'offline' | 'failure';
export type TutorialBaseline = 'clean' | 'detected' | 'ready' | 'offline';
type TutorialEvidence = {
    configSaved: boolean;
    appearanceSaved: boolean;
    serviceSaved: boolean;
    storageSaved: boolean;
    backupExported: boolean;
    traceExported: boolean;
    sentMessageId: number | null;
    inspectedMessageId: number | null;
    failedWrite: boolean;
};
type Body = Record<string, unknown>;
type Feed = { path: string; send: (data: unknown) => void; close: () => void };

type DemoRequest = {
    path: string;
    method: string;
    url: URL;
    headers: Headers;
    raw: BodyInit | null | undefined;
    body: Body;
    signal: AbortSignal | null | undefined;
};

type DemoState = {
    generation: number;
    token: string | null;
    password: string;
    consent: boolean;
    mustChange: boolean;
    totpEnabled: boolean;
    totpPending: boolean;
    recoveryCodes: string[];
    process: HookProcessInfo;
    kernelSelections: Map<string, KernelSelection>;
    ui: UiConfig;
    config: OneBotConfig;
    settings: SystemSettings;
    hasCert: boolean;
    storage: StorageOverviewResponse;
    notifications: NotificationsConfig;
    recent: NotificationDeliveryRecord[];
    globalConfig: GlobalSettings;
    sources: UpdateSourceConfig;
    updatePhase: 'idle' | 'ready' | 'restarting';
    logLevel: LogLevel;
    logs: LogEntry[];
    messages: Map<number, Body>;
    nextMessageId: number;
    feeds: Set<Feed>;
    listeners: Set<() => void>;
    scenario: DemoScenario;
    failNextMutation: boolean;
    backgroundUrl: string | null;
    notice: string;
    tutorial: TutorialEvidence;
};

class DemoRequestError extends Error {
    status: number;
    notice?: string;

    constructor(message: string, status: number, notice?: string) {
        super(message);
        this.status = status;
        this.notice = notice;
    }
}

function object(value: unknown): Body {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('DEMO: Expected a JSON object');
    }

    return value as Body;
}

function parseDemoConfig(value: unknown) {
    const raw = object(value);

    if (raw.networks !== undefined) {
        const networks = object(raw.networks);

        for (const kind of ['httpServers', 'httpClients', 'wsServers', 'wsClients']) {
            const list = networks[kind];

            if (list === undefined) {
                continue;
            }

            if (!Array.isArray(list) || list.length > 16) {
                throw new Error('DEMO: Invalid adapter list');
            }

            for (const item of list) {
                const network = object(item);

                if (typeof network.name !== 'string' || !network.name.trim()) {
                    throw new Error('DEMO: Adapter name required');
                }

                if (kind.endsWith('Servers')) {
                    if (
                        !Number.isInteger(network.port) ||
                        Number(network.port) < 0 ||
                        Number(network.port) > 65535
                    ) {
                        throw new Error('DEMO: Invalid adapter port');
                    }
                } else if (typeof network.url !== 'string' || !network.url.trim()) {
                    throw new Error('DEMO: Adapter URL required');
                }
            }
        }
    }

    return normalizeOneBotConfig(raw);
}

function validateDemoShape(value: unknown, sample: unknown): void {
    if (Array.isArray(sample)) {
        if (!Array.isArray(value) || value.length > 1000) {
            throw new Error('DEMO: Invalid array');
        }

        if (sample.length) {
            value.forEach((item) => validateDemoShape(item, sample[0]));
        }
    } else if (sample !== null && typeof sample === 'object') {
        const payload = object(value);

        for (const [key, expected] of Object.entries(sample)) {
            validateDemoShape(payload[key], expected);
        }
    } else if (
        typeof value !== typeof sample ||
        (typeof value === 'number' && !Number.isFinite(value))
    ) {
        throw new Error('DEMO: Invalid field type');
    }
}

const DEMO_NOTIFICATION_SHAPE = {
    version: 1,
    debounceSeconds: 10,
    channels: [{ id: '', name: '', url: '', bodyTemplate: '', enabled: true }],
};
const DEMO_GLOBAL_SHAPE = {
    rkey: { fallbackServers: [''] },
    musicSignUrl: '',
    videoUploadConcurrency: 2,
};

function parseUiUpdate(current: UiConfig, body: Body): UiConfig {
    const next: UiConfig = {
        ...current,
        appearance: {
            ...current.appearance,
            ...(body.appearance ? object(body.appearance) : {}),
        },
        layout: { ...current.layout, ...(body.layout ? object(body.layout) : {}) },
        pages: { ...current.pages, ...(body.pages ? object(body.pages) : {}) },
    };
    validateDemoShape(next, demoUi());
    // Custom CSS is never evaluated by the static practice site.
    next.appearance.customCss = '';
    return next;
}

function parseSettingsUpdate(current: SystemSettings, body: Body): SystemSettings {
    if (
        body.webuiPort !== undefined &&
        (!Number.isInteger(body.webuiPort) ||
            Number(body.webuiPort) < 1 ||
            Number(body.webuiPort) > 65535)
    ) {
        throw new Error('Invalid port');
    }

    const settings = { ...current, ...(body as SystemSettingsPatch) };
    validateDemoShape(settings, demoSystemSettings());
    return settings;
}

function parseBackup(body: Body): {
    config: OneBotConfig;
    ui: UiConfig;
    settings: SystemSettings;
    globalConfig: GlobalSettings;
    notifications: NotificationsConfig;
} {
    const backup = object(body.backup);

    if (backup.demo !== true || backup.version !== 1 || body.restoreCredentials === true) {
        throw new Error('Only simulator backups without credential restoration are accepted');
    }

    const config = parseDemoConfig(backup.config);
    const ui = object(backup.ui);

    if (!ui.appearance || !ui.layout || !ui.pages) {
        throw new Error('Incomplete backup');
    }

    const settings = object(backup.settings);
    const globalConfig = object(backup.globalConfig);
    const notifications = object(backup.notifications);
    validateDemoShape(ui, demoUi());
    validateDemoShape(settings, demoSystemSettings());
    validateDemoShape(globalConfig, DEMO_GLOBAL_SHAPE);
    validateDemoShape(notifications, DEMO_NOTIFICATION_SHAPE);
    return {
        config,
        ui: structuredClone(ui) as unknown as UiConfig,
        settings: settings as unknown as SystemSettings,
        globalConfig: globalConfig as unknown as GlobalSettings,
        notifications: notifications as unknown as NotificationsConfig,
    };
}

function parseNotificationsUpdate(current: NotificationsConfig, body: Body): NotificationsConfig {
    if (!Array.isArray(body.channels) || body.channels.length > 16) {
        throw new Error('Invalid channels');
    }

    const config = { ...current, ...body };
    validateDemoShape(config, DEMO_NOTIFICATION_SHAPE);
    return config;
}

function parseGlobalConfigUpdate(current: GlobalSettings, body: Body): GlobalSettings {
    const config = { ...current, ...body };
    validateDemoShape(config, DEMO_GLOBAL_SHAPE);
    return config;
}

function validateStorageLimits(body: Body): void {
    for (const field of ['logMaxTotalMb', 'logRetainDays'] as const) {
        if (
            body[field] !== undefined &&
            (!Number.isFinite(body[field]) || Number(body[field]) < 0)
        ) {
            throw new Error('Invalid storage limit');
        }
    }
}

async function readDemoRequest(input: RequestInfo | URL, init: RequestInit): Promise<DemoRequest> {
    if (init.signal?.aborted) {
        throw new DOMException('DEMO request aborted', 'AbortError');
    }

    const request = input instanceof Request ? input : null;
    const origin = typeof location === 'undefined' ? 'https://demo.invalid' : location.origin;
    const url = new URL(request?.url ?? String(input), origin);

    if (url.origin !== origin) {
        throw new DemoRequestError(
            'DEMO: External URLs are blocked; no request was sent',
            403,
            `DEMO blocked external request: ${url.origin}`,
        );
    }

    if (!url.pathname.startsWith('/api/')) {
        throw new DemoRequestError(
            `DEMO: Unsupported URL ${url.pathname}; no network fallback`,
            404,
            `DEMO blocked unsupported URL: ${url.pathname}`,
        );
    }

    const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers ?? request?.headers);
    const raw = init.body ?? (request && method !== 'GET' ? await request.text() : undefined);

    if (typeof raw === 'string' && raw.length > 2_000_000) {
        throw new DemoRequestError('DEMO: Request too large', 413);
    }

    const body = typeof raw === 'string' && raw ? object(JSON.parse(raw)) : {};
    return {
        path: url.pathname,
        method,
        url,
        headers,
        raw,
        body,
        signal: init.signal ?? request?.signal,
    };
}

function json(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function fakeError(message: string, status = 400): Response {
    return json({ success: false, message, code: 'DEMO_ERROR' }, status);
}

// Single owner for every simulated field; construction and reset both start here.
function createDemoState(): DemoState {
    return {
        generation: 0,
        token: null,
        password: DEMO_PASSWORD,
        consent: false,
        mustChange: true,
        totpEnabled: false,
        totpPending: false,
        recoveryCodes: ['DEMO-RECOVERY-0001', 'DEMO-RECOVERY-0002'],
        process: demoProcess(),
        kernelSelections: new Map(),
        ui: demoUi(),
        config: demoConfig(),
        settings: demoSystemSettings(),
        hasCert: false,
        storage: demoStorage(),
        notifications: {
            version: 1,
            debounceSeconds: 10,
            channels: [
                {
                    id: 'demo-webhook',
                    name: 'DEMO webhook · no delivery',
                    type: 'webhook',
                    url: 'https://demo.invalid/webhook',
                    bodyTemplate: '{"text":"DEMO {nickname} {event}"}',
                    enabled: true,
                },
            ],
        },
        recent: [],
        globalConfig: {
            rkey: { fallbackServers: ['https://demo.invalid/rkey'] },
            musicSignUrl: '',
            videoUploadConcurrency: 2,
        },
        sources: {
            mode: 'direct',
            mirror: '',
            mirrors: ['https://demo.invalid/mirror'],
        },
        updatePhase: 'idle',
        logLevel: 'info',
        logs: [
            demoLog(1, 'Practice only — no QQ, VNC, filesystem or outgoing API traffic'),
            demoLog(2, 'DEMO adapter example: waiting for simulated scan', 'warn'),
        ],
        messages: new Map<number, Body>([
            [
                100,
                {
                    message_id: 100,
                    user_id: 10002,
                    message: [{ type: 'text', data: { text: 'DEMO sample message' } }],
                    raw_message: 'DEMO sample message',
                    time: 1784851200,
                },
            ],
        ]),
        nextMessageId: 101,
        feeds: new Set(),
        listeners: new Set(),
        scenario: 'setup',
        failNextMutation: false,
        backgroundUrl: null,
        notice: 'DEMO ready. Use only the example credentials.',
        tutorial: {
            configSaved: false,
            appearanceSaved: false,
            serviceSaved: false,
            storageSaved: false,
            backupExported: false,
            traceExported: false,
            sentMessageId: null,
            inspectedMessageId: null,
            failedWrite: false,
        },
    };
}

// All effects stay in this instance. There is deliberately no real fetch fallback.
export class DemoApi {
    private state = createDemoState();
    private revision = 0;
    private readonly chapterLanguage?: TutorialLanguage;

    // An embedded chapter fixes its language. The free-practice API serves
    // bilingual notices so switching its UI does not reload the consent gate.
    constructor(chapterLanguage?: TutorialLanguage) {
        this.chapterLanguage = chapterLanguage;
    }

    get tutorialRevision() {
        return this.revision;
    }

    get tutorialSnapshot() {
        return {
            ...this.summary,
            ...this.state.tutorial,
            kernelAccepted: this.canLoadKernel(DEMO_UIN),
            logLevel: this.state.logLevel,
            logRetainDays: this.state.storage.settings.saved.logRetainDays,
            logsBytes: this.state.storage.snapshot.logs.totalBytes,
            cleanupScope: this.state.storage.lastCleanup?.scope ?? null,
            motionDisabled: this.state.ui.appearance.disableMotion,
            webuiPort: this.state.settings.webuiPort,
        };
    }

    // A disclosed teaching fixture, not an auth bypass in the production client.
    // Even ready fixtures never create or pre-check an account risk selection.
    resetTutorial(baseline: TutorialBaseline): string | null {
        this.reset();

        if (baseline === 'clean') {
            return null;
        }

        this.state.token = `demo-tutorial-${++this.state.generation}`;
        this.state.consent = true;
        this.state.mustChange = false;
        this.state.process.account = { uin: DEMO_UIN, nickname: 'DEMO 小光' };

        if (baseline === 'ready' || baseline === 'offline') {
            const online = baseline === 'ready';
            this.state.process = {
                ...this.state.process,
                injected: true,
                connected: online,
                loggedIn: online,
                uin: DEMO_UIN,
                status: online ? 'online' : 'disconnected',
                error: online
                    ? ''
                    : 'DEMO: simulated account offline; inspect logs and diagnostics',
            };
        }

        this.emitState();
        this.announce(
            `DEMO tutorial fixture: ${baseline}. Memory only; no real login or risk acceptance.`,
        );
        return this.state.token;
    }

    subscribe = (listener: () => void) => {
        this.state.listeners.add(listener);

        return () => {
            this.state.listeners.delete(listener);
        };
    };

    get examplePassword() {
        return this.state.password;
    }

    get summary() {
        return {
            authenticated: this.state.token !== null,
            consent: this.state.consent,
            mustChange: this.state.mustChange,
            scanned: this.state.process.account !== null,
            online: this.state.process.status === 'online',
            stopped: this.state.process.manualStopped === true,
            messages: this.state.messages.size,
        };
    }

    get scenario() {
        return this.state.scenario;
    }

    set scenario(scenario: DemoScenario) {
        this.state.scenario = scenario;
    }

    get failNextMutation() {
        return this.state.failNextMutation;
    }

    set failNextMutation(fail: boolean) {
        this.state.failNextMutation = fail;
    }

    get backgroundUrl() {
        return this.state.backgroundUrl;
    }

    set backgroundUrl(url: string | null) {
        this.state.backgroundUrl = url;
    }

    get notice() {
        return this.state.notice;
    }

    set notice(notice: string) {
        this.state.notice = notice;
    }

    reset() {
        this.closeFeeds();

        if (this.state.backgroundUrl) {
            URL.revokeObjectURL(this.state.backgroundUrl);
        }

        const { feeds, listeners, generation } = this.state;
        this.state = {
            ...createDemoState(),
            generation: generation + 1,
            feeds,
            listeners,
        };
        this.announce('DEMO reset: all practice writes, files and sessions cleared.');
    }

    setScenario(scenario: DemoScenario) {
        if (scenario === 'setup') {
            this.reset();
            return;
        }

        this.state.scenario = scenario;

        if (scenario === 'ready') {
            this.state.consent = true;
            this.state.mustChange = false;
            this.scan();
            const canLoad = this.canLoadKernel(DEMO_UIN);
            this.state.process = {
                ...this.state.process,
                injected: canLoad,
                connected: canLoad,
                loggedIn: canLoad,
                uin: canLoad ? DEMO_UIN : '',
                status: canLoad ? 'online' : 'available',
                manualStopped: false,
                error: '',
            };
        } else if (scenario === 'offline') {
            this.state.process = {
                ...this.state.process,
                connected: false,
                loggedIn: false,
                status: 'disconnected',
                manualStopped: false,
                error: 'DEMO: simulated account offline',
            };
        }

        if (scenario === 'failure') {
            this.closeFeeds();
        } else {
            this.emitState();
        }

        this.announce(`DEMO scenario: ${scenario}. No real runtime was changed.`);
    }

    scan() {
        this.state.process.account = { uin: DEMO_UIN, nickname: 'DEMO 小光' };
        this.emitState();
        this.announce('DEMO scan simulated. 选择内核并连接示例账号；这不证明 QQ 消息投递。');
    }

    fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
        const state = this.state;

        try {
            const request = await readDemoRequest(input, init);

            if (this.state !== state) {
                throw new DOMException('DEMO request cancelled by reset', 'AbortError');
            }

            request.signal?.throwIfAborted();
            const response = this.handle(request);

            // Successful mutations and deliberate exports can change lesson evidence.
            // Reads/polls do not continuously rerender the guide.
            if (
                request.method !== 'GET' ||
                request.path === '/api/system/backup/export' ||
                request.path === '/api/logs/export/trace'
            ) {
                this.revision++;
                this.state.listeners.forEach((listener) => listener());
            }

            return response;
        } catch (error) {
            if (this.state !== state) {
                throw new DOMException('DEMO request cancelled by reset', 'AbortError');
            }

            if (error instanceof DOMException && error.name === 'AbortError') {
                throw error;
            }

            if (error instanceof DemoRequestError) {
                if (error.notice) {
                    this.announce(error.notice);
                }

                return fakeError(error.message, error.status);
            }

            return fakeError(`DEMO: ${error instanceof Error ? error.message : 'Invalid request'}`);
        }
    };

    private handle(request: DemoRequest): Response {
        const { path, method } = request;

        if (path === '/api/kernel/catalog' && method === 'GET') {
            return json(demoKernelCatalog());
        }

        if (path === '/api/ui/public' && method === 'GET') {
            return json({ appearance: this.state.ui.appearance });
        }

        if (path === '/api/login' && method === 'POST') {
            return this.login(request.body);
        }

        if (
            this.state.token === null ||
            request.headers.get('X-Nowluma-Token') !== this.state.token
        ) {
            return fakeError('DEMO: Login required', 401);
        }

        const auth = this.authRoute(request);

        if (auth) {
            return auth;
        }

        if (!this.state.consent || this.state.mustChange) {
            return fakeError('DEMO: Finish practice agreement/password setup first', 403);
        }

        if (this.state.scenario === 'failure') {
            return fakeError(
                'DEMO: Simulated API failure. Choose Ready or Reset in the practice guide.',
                503,
            );
        }

        if (method !== 'GET' && this.state.failNextMutation) {
            this.state.failNextMutation = false;
            this.state.tutorial.failedWrite = true;
            this.addLog('Simulated write failure; no data changed', 'error');
            this.announce(
                'DEMO: Write failed intentionally. Retry only after inspecting the result.',
            );
            return fakeError(
                'DEMO: Simulated write failure; nothing changed',
                path.startsWith('/api/kernel/accounts/') ? 500 : 503,
            );
        }

        return (
            this.streamRoute(request) ??
            this.kernelRoute(request) ??
            this.processRoute(request) ??
            this.uiRoute(request) ??
            this.logRoute(request) ??
            this.updateRoute(request) ??
            this.systemRoute(request) ??
            this.storageRoute(request) ??
            this.notificationRoute(request) ??
            this.totpRoute(request) ??
            this.debugRoute(request) ??
            this.unhandled(path, method)
        );
    }

    private login(body: Body): Response {
        if (body.password !== this.state.password) {
            return fakeError(
                `DEMO: Use only example password ${this.state.password}. Never enter a real password.`,
                401,
            );
        }

        if (
            this.state.totpEnabled &&
            body.totp !== DEMO_TOTP &&
            !this.state.recoveryCodes.includes(String(body.recoveryCode))
        ) {
            return body.totp || body.recoveryCode
                ? fakeError('DEMO: Invalid example second factor', 401)
                : json({ needsTotp: true });
        }

        if (body.recoveryCode) {
            this.state.recoveryCodes = this.state.recoveryCodes.filter(
                (code) => code !== body.recoveryCode,
            );
        }

        this.state.token = `demo-session-${++this.state.generation}`;
        this.announce('DEMO login accepted. This is not a real server session.');
        return json({ token: this.state.token, mustChangePassword: this.state.mustChange });
    }

    private authRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/logout' && method === 'POST') {
            this.state.token = null;
            this.closeFeeds();
            return json({ success: true });
        }

        if (path === '/api/status' && method === 'GET') {
            return json({ authenticated: true });
        }

        if (path === '/api/auth/state' && method === 'GET') {
            return json({ mustChangePassword: this.state.mustChange });
        }

        if (path === '/api/agreements' && method === 'GET') {
            const notice = (zh: string, en: string) =>
                this.chapterLanguage === 'zh'
                    ? zh
                    : this.chapterLanguage === 'en'
                      ? en
                      : `${zh}\n\n${en}`;
            return json({
                version: 'demo-v1',
                consentRequired: !this.state.consent,
                documents: [
                    {
                        id: 'eula',
                        title: notice('示例使用说明', 'Sample use notice'),
                        declaredVersion: 'DEMO',
                        effectiveDate: '2026-07-24',
                        text: notice(
                            '这是练习内容，不是正式使用说明。所有操作只在浏览器内存中进行，不连接 QQ、不发送消息、不写入磁盘、不打开真实桌面。不要输入真实密码、令牌或账号数据。正式部署以随附的使用说明、隐私说明和许可证为准。',
                            'This notice is for practice only. Operations run in browser memory: no QQ connection, message delivery, disk writes, or physical desktop. Do not enter actual passwords, tokens, or account data. A real deployment uses its supplied use and privacy notices and license.',
                        ),
                    },
                    {
                        id: 'privacy',
                        title: notice('示例隐私说明', 'Sample privacy notice'),
                        declaredVersion: 'DEMO',
                        effectiveDate: '2026-07-24',
                        text: notice(
                            `仅使用公开示例：访问密码 ${DEMO_PASSWORD}、新密码 ${DEMO_NEW_PASSWORD}、双重验证码 ${DEMO_TOTP}。练习数据不会持久化，重置或刷新即清空。`,
                            `Use only the public examples: access password ${DEMO_PASSWORD}, new password ${DEMO_NEW_PASSWORD}, and verification code ${DEMO_TOTP}. Practice data is not persisted; reset or reload to clear it.`,
                        ),
                    },
                ],
            });
        }

        if (path === '/api/agreements/record-consent' && method === 'POST') {
            if (body.version !== 'demo-v1') {
                return json(
                    {
                        success: false,
                        currentVersion: 'demo-v1',
                        message: 'DEMO: Agreement version changed',
                    },
                    409,
                );
            }

            this.state.consent = true;
            return json({ success: true });
        }

        if (path === '/api/auth/check-strength' && method === 'POST') {
            const valid = body.password === DEMO_NEW_PASSWORD;
            return json({
                valid,
                rules: [
                    {
                        id: 'demo-only',
                        label: `仅输入示例 / Example only: ${DEMO_NEW_PASSWORD}`,
                        ok: valid,
                    },
                ],
            });
        }

        if (path === '/api/auth/change-password' && method === 'POST') {
            if (
                body.oldPassword !== this.state.password ||
                body.newPassword !== DEMO_NEW_PASSWORD
            ) {
                return fakeError(
                    `DEMO: Old password must be the example; new password must be ${DEMO_NEW_PASSWORD}`,
                );
            }

            this.state.password = DEMO_NEW_PASSWORD;
            this.state.mustChange = false;
            return json({ success: true });
        }

        return null;
    }

    private streamRoute({ path, method, signal }: DemoRequest): Response | null {
        if (
            ['/api/state/stream', '/api/logs/stream', '/api/debug/stream'].includes(path) &&
            method === 'GET'
        ) {
            return this.stream(path, signal);
        }

        return null;
    }

    private canLoadKernel(uin: string): boolean {
        const selection = this.state.kernelSelections.get(uin);
        return (
            selection?.kernel === 'compat' &&
            selection.riskAccepted &&
            selection.riskVersion === demoKernelCatalog().riskVersion
        );
    }

    private kernelRoute({ path, method, body }: DemoRequest): Response | null {
        const match = path.match(/^\/api\/kernel\/accounts\/([^/]+)$/);

        if (!match) {
            return null;
        }

        const uin = decodeURIComponent(match[1]);

        if (uin !== DEMO_UIN) {
            return fakeError('DEMO: Unknown account', 400);
        }

        if (method === 'GET') {
            return json({
                selection: this.state.kernelSelections.get(uin) ?? null,
                options: demoKernelCatalog().options,
                canLoad: this.canLoadKernel(uin),
            });
        }

        if (method === 'POST') {
            assertKernelChoiceInput(body);

            if (body.kernel === 'rewrite') {
                return fakeError('当前平台的重写内核尚未验证，暂不可使用', 409);
            }

            if (!body.riskAccepted) {
                return fakeError('必须主动确认兼容内核风险', 400);
            }

            if (body.riskVersion !== demoKernelCatalog().riskVersion) {
                return fakeError('风险说明版本已更新，请重新阅读并确认', 409);
            }

            const selection: KernelSelection = { ...body, acceptedAt: new Date().toISOString() };
            this.state.kernelSelections.set(uin, selection);
            return json({ success: true, selection, canLoad: true });
        }

        return fakeError('DEMO: Unsupported kernel method', 405);
    }

    private processRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/processes' && method === 'GET') {
            return json({ list: [this.state.process] });
        }

        if (path === '/api/qq-list' && method === 'GET') {
            return json({ list: this.accounts() });
        }

        if (path === '/api/connections' && method === 'GET') {
            return json({ list: this.connections() });
        }

        const processAction = path.match(/^\/api\/processes\/(\d+)\/(load|unload|refresh)$/);

        if (processAction && method === 'POST') {
            if (Number(processAction[1]) !== DEMO_PID) {
                return fakeError('DEMO: Unknown process', 404);
            }

            const action = processAction[2];

            if (action === 'refresh' && this.state.process.manualStopped) {
                return json({ success: true, process: this.state.process });
            }

            if (action !== 'unload') {
                if (!this.state.process.account) {
                    return fakeError('DEMO: Open the mock desktop and simulate a scan first', 409);
                }

                if (!this.canLoadKernel(this.state.process.account.uin)) {
                    return fakeError('请为此 QQ 账号选择内核并主动确认兼容内核风险', 409);
                }
            }

            this.state.process = {
                ...this.state.process,
                injected: action !== 'unload',
                connected: action !== 'unload',
                loggedIn: action !== 'unload',
                uin: action === 'unload' ? '' : DEMO_UIN,
                status: action === 'unload' ? 'available' : 'online',
                manualStopped: action === 'unload',
                error: '',
            };
            this.emitState();
            this.addLog(`Process ${action}: in-memory simulation only`, 'success');
            return json({ success: true, process: this.state.process });
        }

        const configAccount = path.match(/^\/api\/config\/([^/]+)$/);

        if (configAccount) {
            if (decodeURIComponent(configAccount[1]) !== DEMO_UIN) {
                return fakeError('DEMO: Unknown account', 404);
            }

            if (method === 'GET') {
                return json({ config: this.state.config });
            }

            if (method === 'POST') {
                this.state.config = parseDemoConfig(body);
                this.state.tutorial.configSaved = true;
                this.emitState();
                this.addLog(
                    'Configuration saved to memory; no listener or remote connection opened',
                    'success',
                );
                return json({
                    config: this.state.config,
                    saved: true,
                    applied: this.state.process.status === 'online',
                    online: this.state.process.status === 'online',
                    errors: [],
                    message: 'DEMO: Saved in memory. No real transport.',
                });
            }
        }

        return null;
    }

    private uiRoute({ path, method, body, raw }: DemoRequest): Response | null {
        if (path === '/api/ui') {
            if (method === 'POST') {
                this.state.ui = parseUiUpdate(this.state.ui, body);

                if (body.appearance) {
                    this.state.tutorial.appearanceSaved = true;
                }
            } else if (method !== 'GET') {
                return fakeError('DEMO: Unsupported UI method', 405);
            }

            return json({ ...(method === 'POST' ? { success: true } : {}), config: this.state.ui });
        }

        if (path === '/api/ui/background' && (method === 'POST' || method === 'DELETE')) {
            if (this.state.backgroundUrl) {
                URL.revokeObjectURL(this.state.backgroundUrl);
            }

            this.state.backgroundUrl = null;

            if (method === 'POST') {
                const file = raw instanceof FormData ? raw.get('file') : null;

                if (
                    !(file instanceof Blob) ||
                    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) ||
                    file.size > 8 * 1024 ** 2
                ) {
                    return fakeError('DEMO: Choose PNG/JPEG/WebP/GIF up to 8 MiB');
                }

                this.state.backgroundUrl = URL.createObjectURL(file);
            }

            this.state.ui.appearance.background = {
                ...this.state.ui.appearance.background,
                hasImage: !!this.state.backgroundUrl,
                imageVersion: this.state.ui.appearance.background.imageVersion + 1,
            };
            return json({ config: this.state.ui });
        }

        return null;
    }

    private logRoute({ path, method, url, body }: DemoRequest): Response | null {
        if (path === '/api/logs' && method === 'GET') {
            return json({
                list: this.state.logs.slice(
                    -Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 500))),
                ),
            });
        }

        if (path === '/api/logs/level' && (method === 'GET' || method === 'POST')) {
            const levels: LogLevel[] = ['trace', 'debug', 'info', 'success', 'warn', 'error'];

            if (method === 'POST') {
                if (!levels.includes(body.level as LogLevel)) {
                    return fakeError('DEMO: Invalid log level');
                }

                this.state.logLevel = body.level as LogLevel;
            }

            return json({ level: this.state.logLevel, levels });
        }

        if (path === '/api/logs/export/trace' && method === 'GET') {
            this.state.tutorial.traceExported = true;
            return new Response(this.state.logs.map((log) => log.line).join('\n'), {
                headers: { 'Content-Disposition': 'attachment; filename="DEMO-trace.log"' },
            });
        }

        return null;
    }

    private updateRoute({ path, method, body }: DemoRequest): Response | null {
        if (!path.startsWith('/api/update/')) {
            return null;
        }

        if (path === '/api/update/check' && method === 'GET') {
            return json({
                current: APP_VERSION,
                latest: '99.0.0-demo',
                hasUpdate: true,
                htmlUrl: null,
                notes: 'DEMO release notes. Download/restart only change memory; no software is downloaded or restarted.',
                publishedAt: '2026-07-24T00:00:00Z',
                checkedAt: Date.now(),
            });
        }

        if (path === '/api/update/sources' && (method === 'GET' || method === 'POST')) {
            if (method === 'POST') {
                this.state.sources = normalizeUpdateSourceConfig(body);
            }

            return json({
                config: this.state.sources,
                saved: true,
                applied: true,
                online: true,
                errors: [],
                message: 'DEMO: Source stored in memory only',
            });
        }

        if (path === '/api/update/sources/test' && method === 'POST') {
            const config = normalizeUpdateSourceConfig(body);
            return json({
                results: [...new Set([config.mirror, ...config.mirrors].filter(Boolean))].map(
                    (mirror) => ({
                        mirror,
                        available: true,
                        latencyMs: 12,
                        error: 'DEMO result — no network probe',
                    }),
                ),
            });
        }

        if (path === '/api/update/download' && method === 'POST') {
            this.state.updatePhase = 'ready';
        } else if (path === '/api/update/restart' && method === 'POST') {
            this.state.updatePhase = 'restarting';
        } else if (path !== '/api/update/status' || method !== 'GET') {
            return null;
        }

        return json({
            current: APP_VERSION,
            phase: this.state.updatePhase,
            ...(this.state.updatePhase === 'idle' ? {} : { version: '99.0.0-demo' }),
        });
    }

    private systemRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/system' && method === 'GET') {
            return json(demoSystem());
        }

        if (path === '/api/system/settings' && (method === 'GET' || method === 'POST')) {
            if (method === 'POST') {
                this.state.settings = parseSettingsUpdate(this.state.settings, body);
                this.state.tutorial.serviceSaved = true;
                return json({ settings: this.state.settings, restartRequiredToApply: true });
            }

            return json({
                settings: this.state.settings,
                effective: {
                    vncPort: 0,
                    vncUrl: DEMO_DESKTOP_URL,
                    hookAutoLoad: this.state.settings.hookAutoLoad,
                },
                hasCert: this.state.hasCert,
                envOverrides: [],
                listeningPort: 5099,
                restartRequiredToApply: false,
            });
        }

        if (path === '/api/system/tls/cert' && (method === 'POST' || method === 'DELETE')) {
            if (
                method === 'POST' &&
                (body.cert !== 'DEMO CERTIFICATE' || body.key !== 'DEMO PRIVATE KEY')
            ) {
                return fakeError(
                    'DEMO: Use literal DEMO CERTIFICATE and DEMO PRIVATE KEY; never upload real keys',
                );
            }

            this.state.hasCert = method === 'POST';
            return json({ success: true });
        }

        if (path === '/api/system/backup/export' && method === 'GET') {
            this.state.tutorial.backupExported = true;
            return json({
                demo: true,
                version: 1,
                config: this.state.config,
                ui: this.state.ui,
                settings: this.state.settings,
                globalConfig: this.state.globalConfig,
                notifications: this.state.notifications,
            });
        }

        if (path === '/api/system/backup/import' && method === 'POST') {
            const backup = parseBackup(body);
            this.state.config = backup.config;
            this.state.ui = backup.ui;
            this.state.ui.appearance.customCss = '';
            this.state.settings = { ...this.state.settings, ...backup.settings };
            this.state.globalConfig = { ...this.state.globalConfig, ...backup.globalConfig };
            this.state.notifications = { ...this.state.notifications, ...backup.notifications };
            this.emitState();
            return json({
                success: true,
                transactionId: 'DEMO-memory-restore',
                restored: ['DEMO config', 'DEMO ui', 'DEMO settings'],
                skipped: ['credentials'],
                migrated: [],
                restartRequiredToApply: false,
            });
        }

        if (path === '/api/global-config' && (method === 'GET' || method === 'POST')) {
            if (method === 'POST') {
                this.state.globalConfig = parseGlobalConfigUpdate(this.state.globalConfig, body);
            }

            return json({ success: true, config: this.state.globalConfig });
        }

        return null;
    }

    private storageRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/system/storage' && method === 'GET') {
            return json(this.state.storage);
        }

        if (path === '/api/system/storage/settings' && method === 'POST') {
            validateStorageLimits(body);
            this.state.storage.settings.saved = { ...this.state.storage.settings.saved, ...body };
            this.state.storage.settings.effective = { ...this.state.storage.settings.saved };
            this.state.tutorial.storageSaved = true;
            this.state.storage.snapshot.logs = {
                ...this.state.storage.snapshot.logs,
                maxTotalBytes: this.state.storage.settings.saved.logMaxTotalMb * 1024 ** 2,
                retainDays: this.state.storage.settings.saved.logRetainDays,
                perUinEnabled: this.state.storage.settings.saved.logPerUin,
            };
            return json({
                success: true,
                settings: this.state.storage.settings,
                status: this.state.storage.snapshot.logs,
                snapshot: this.state.storage.snapshot,
            });
        }

        if (path === '/api/system/storage/cleanup' && method === 'POST') {
            return this.cleanup(body);
        }

        return null;
    }

    private notificationRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/notifications/config' && (method === 'GET' || method === 'POST')) {
            if (method === 'POST') {
                this.state.notifications = parseNotificationsUpdate(this.state.notifications, body);
            }

            return json({ success: true, config: this.state.notifications });
        }

        if (path === '/api/notifications/recent' && method === 'GET') {
            return json({ recent: this.state.recent });
        }

        if (path === '/api/notifications/test' && method === 'POST') {
            if (
                !this.state.notifications.channels.some((channel) => channel.id === body.channelId)
            ) {
                return fakeError('DEMO: Unknown notification channel', 404);
            }

            this.state.recent.unshift({
                time: Date.now(),
                uin: DEMO_UIN,
                event: 'online',
                channelId: String(body.channelId),
                ok: true,
                status: 200,
            });
            this.state.recent = this.state.recent.slice(0, 20);
            return json({
                success: true,
                message: 'DEMO: Simulated delivery; no email or webhook was sent',
                status: 200,
            });
        }

        return null;
    }

    private totpRoute({ path, method, body }: DemoRequest): Response | null {
        if (path === '/api/auth/totp' && method === 'GET') {
            return json(
                this.state.totpEnabled
                    ? {
                          enabled: true,
                          remainingRecoveryCodes: this.state.recoveryCodes.length,
                          label: 'DEMO example only',
                      }
                    : { enabled: false },
            );
        }

        if (path === '/api/auth/totp/begin' && method === 'POST') {
            this.state.totpPending = true;
            return json({
                success: true,
                secret: 'JBSWY3DPEHPK3PXP',
                otpauthUrl: 'otpauth://totp/DEMO?secret=JBSWY3DPEHPK3PXP&issuer=DEMO',
                issuer: 'DEMO example — never enroll',
                accountName: 'DEMO',
            });
        }

        if (path === '/api/auth/totp/confirm' && method === 'POST') {
            if (
                !this.state.totpPending ||
                body.password !== this.state.password ||
                body.code !== DEMO_TOTP
            ) {
                return fakeError('DEMO: Use example password and code 123456');
            }

            this.state.totpEnabled = true;
            this.state.totpPending = false;
            return json({ success: true, recoveryCodes: this.state.recoveryCodes });
        }

        if (
            ['/api/auth/totp/disable', '/api/auth/totp/recovery-codes'].includes(path) &&
            method === 'POST'
        ) {
            if (
                !this.state.totpEnabled ||
                body.password !== this.state.password ||
                (body.totp !== DEMO_TOTP &&
                    !this.state.recoveryCodes.includes(String(body.recoveryCode)))
            ) {
                return fakeError('DEMO: Invalid example second factor');
            }

            if (path.endsWith('/disable')) {
                this.state.totpEnabled = false;
            } else {
                this.state.recoveryCodes = ['DEMO-RECOVERY-0003', 'DEMO-RECOVERY-0004'];
            }

            return json({ success: true, recoveryCodes: this.state.recoveryCodes });
        }

        return null;
    }

    private debugRoute({ path, method, body, raw, signal }: DemoRequest): Response | null {
        if (path === '/api/debug/actions' && method === 'GET') {
            return json({
                actions: demoActions,
                categories: [...new Set(demoActions.map((action) => action.category))].map(
                    (category) => ({
                        category,
                        count: demoActions.filter((action) => action.category === category).length,
                    }),
                ),
            });
        }

        if (['/api/debug/invoke', '/api/debug/invoke-stream'].includes(path) && method === 'POST') {
            if (body.uin !== DEMO_UIN) {
                return fakeError('DEMO: Unknown account', 404);
            }

            if (this.state.process.status !== 'online') {
                return fakeError('DEMO: Account offline', 409);
            }

            const params = object(body.params);
            const result = this.invoke(String(body.action), params);
            this.state.feeds.forEach((feed) => {
                if (feed.path === '/api/debug/stream') {
                    feed.send({
                        kind: 'action',
                        uin: DEMO_UIN,
                        action: body.action,
                        params,
                        response: result,
                        ms: 1,
                    });
                }
            });

            if (path.endsWith('invoke-stream')) {
                return this.stream(path, signal, [result]);
            }

            return json(result);
        }

        if (path === '/api/debug/upload' && method === 'POST') {
            const file = raw instanceof FormData ? raw.get('file') : null;

            if (!(file instanceof Blob) || file.size > 8 * 1024 ** 2) {
                return fakeError('DEMO: Choose a file up to 8 MiB');
            }

            return json({
                status: 'ok',
                path: '/DEMO/memory/upload',
                size: file.size,
                message: 'DEMO: File metadata only; no disk upload',
            });
        }

        return null;
    }

    private announce(message: string) {
        this.state.notice = message;
        this.revision++;
        this.state.listeners.forEach((listener) => listener());
    }

    private accounts() {
        return this.state.process.status === 'online'
            ? [{ uin: DEMO_UIN, nickname: 'DEMO 小光' }]
            : [];
    }

    private connections() {
        return this.accounts().map((account) => ({
            ...account,
            adapters: [
                ...this.state.config.networks.httpServers.map((network) => ({
                    name: network.name,
                    kind: 'httpServer',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO listener only — no socket opened',
                })),
                ...this.state.config.networks.httpClients.map((network) => ({
                    name: network.name,
                    kind: 'httpClient',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO only — no outgoing request',
                })),
                ...this.state.config.networks.wsServers.map((network) => ({
                    name: network.name,
                    kind: 'wsServer',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO listener only — no socket opened',
                })),
                ...this.state.config.networks.wsClients.map((network) => ({
                    name: network.name,
                    kind: 'wsClient',
                    status: network.enabled === false ? 'disabled' : 'ok',
                    detail: 'DEMO only — no WebSocket',
                })),
            ],
        }));
    }

    private emitState() {
        for (const feed of this.state.feeds) {
            if (feed.path === '/api/state/stream') {
                feed.send({ resource: 'processes', data: [this.state.process] });
                feed.send({ resource: 'qq-list', data: this.accounts() });
                feed.send({ resource: 'connections', data: this.connections() });
            }
        }

        this.state.storage.snapshot.accounts[0].online = this.state.process.status === 'online';
    }

    private addLog(message: string, level: LogLevel = 'info') {
        const log = demoLog((this.state.logs.at(-1)?.id ?? 0) + 1, message, level);
        this.state.logs = [...this.state.logs.slice(-199), log];
        this.announce(message);
        this.state.feeds.forEach((feed) => {
            if (feed.path === '/api/logs/stream') {
                feed.send(log);
            }
        });
    }

    private closeFeeds() {
        [...this.state.feeds].forEach((feed) => feed.close());
    }

    private stream(path: string, signal?: AbortSignal | null, frames?: unknown[]) {
        if (signal?.aborted) {
            throw new DOMException('DEMO request aborted', 'AbortError');
        }

        const encoder = new TextEncoder();
        const feeds = this.state.feeds;
        let dispose: (() => void) | null = null;
        const stream = new ReadableStream<Uint8Array>(
            {
                start: (controller) => {
                    let closed = false;

                    const close = () => {
                        if (closed) {
                            return;
                        }

                        closed = true;
                        signal?.removeEventListener('abort', close);
                        feeds.delete(feed);
                        controller.close();
                    };

                    const feed: Feed = {
                        path,
                        close,
                        send: (data) => {
                            if (closed) {
                                return;
                            }

                            const frame = encoder.encode(`data: ${JSON.stringify(data)}\n\n`);

                            if (frame.byteLength > (controller.desiredSize ?? 0)) {
                                dispose?.();
                                const error = new Error('DEMO: Stream buffer limit reached');
                                controller.error(error);
                                this.announce(error.message);
                                return;
                            }

                            controller.enqueue(frame);
                        },
                    };

                    dispose = () => {
                        closed = true;
                        signal?.removeEventListener('abort', close);
                        feeds.delete(feed);
                    };

                    if (frames) {
                        frames.forEach(feed.send);
                        close();
                        return;
                    }

                    if (feeds.size >= 16) {
                        throw new Error('DEMO: Too many open streams');
                    }

                    feeds.add(feed);
                    signal?.addEventListener('abort', close, { once: true });

                    if (path === '/api/logs/stream') {
                        this.state.logs.forEach(feed.send);
                    } else {
                        feed.send({ kind: 'ready' });
                    }

                    if (path === '/api/state/stream') {
                        this.emitState();
                    }
                },
                cancel: () => {
                    dispose?.();
                },
            },
            { highWaterMark: 256 * 1024, size: (frame) => frame.byteLength },
        );
        return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }

    private unhandled(path: string, method: string) {
        this.announce(`DEMO unsupported: ${method} ${path}. No network fallback.`);
        return fakeError(`DEMO: Unsupported endpoint ${method} ${path}`, 404);
    }

    private invoke(action: string, params: Body): DebugInvokeResult {
        let data: unknown;

        switch (action) {
            case 'get_login_info':
                data = { user_id: Number(DEMO_UIN), nickname: 'DEMO 小光' };
                break;
            case 'get_friend_list':
                data = [{ user_id: 10002, nickname: 'DEMO friend', remark: 'DEMO contact' }];
                break;
            case 'get_group_list':
                data = [
                    {
                        group_id: 20001,
                        group_name: 'DEMO practice group',
                        member_count: 2,
                        max_member_count: 200,
                    },
                ];
                break;
            case 'get_group_member_list':
                if (Number(params.group_id) !== 20001) {
                    return { status: 'failed', retcode: 1404, message: 'DEMO: Unknown group' };
                }

                data = [
                    {
                        group_id: 20001,
                        user_id: 10002,
                        nickname: 'DEMO friend',
                        card: 'DEMO',
                        role: 'member',
                    },
                ];
                break;
            case 'get_msg':
                data = this.state.messages.get(Number(params.message_id));

                if (!data) {
                    return { status: 'failed', retcode: 1404, message: 'DEMO: Message not found' };
                }

                if (Number(params.message_id) === this.state.tutorial.sentMessageId) {
                    this.state.tutorial.inspectedMessageId = Number(params.message_id);
                }

                break;
            case 'send_private_msg':
            case 'send_group_msg':
            case 'send_group_forward_msg':
            case 'send_private_forward_msg': {
                const group = action.includes('group');
                const message = params[action.includes('forward') ? 'messages' : 'message'];

                if (
                    Number(params[group ? 'group_id' : 'user_id']) !== (group ? 20001 : 10002) ||
                    !(
                        (typeof message === 'string' && message.length) ||
                        (Array.isArray(message) && message.length)
                    )
                ) {
                    return {
                        status: 'failed',
                        retcode: 1400,
                        message:
                            'DEMO: Choose sample contact 10002 / group 20001 and a non-empty message',
                    };
                }

                const text =
                    typeof message === 'string'
                        ? message
                        : (message as unknown[])
                              .map((segment) => {
                                  const item = object(segment);
                                  const data = item.type === 'text' ? object(item.data) : {};
                                  return typeof data.text === 'string' ? data.text : '';
                              })
                              .join('');
                const messageId = this.state.nextMessageId++;

                if (action === 'send_private_msg' && text === '#nl') {
                    this.state.tutorial.sentMessageId = messageId;
                }

                this.state.messages.set(messageId, {
                    message_id: messageId,
                    user_id: 10002,
                    ...(group ? { group_id: 20001 } : {}),
                    message,
                    time: Math.floor(Date.now() / 1000),
                    sender: { user_id: Number(DEMO_UIN), nickname: 'DEMO 小光' },
                });

                if (this.state.messages.size > 100) {
                    this.state.messages.delete(this.state.messages.keys().next().value!);
                }

                this.addLog(
                    text === '#nl'
                        ? '#nl DEMO reply: account online, adapter simulated; not proof of QQ delivery'
                        : `DEMO message ${messageId} stored only in memory`,
                    'success',
                );
                this.state.feeds.forEach((feed) => {
                    if (feed.path === '/api/debug/stream') {
                        feed.send({
                            kind: 'event',
                            uin: DEMO_UIN,
                            event: {
                                post_type: 'message',
                                message_type: group ? 'group' : 'private',
                                user_id: 10002,
                                ...(group ? { group_id: 20001 } : {}),
                                message_id: messageId,
                                message,
                                demo: true,
                            },
                        });
                    }
                });
                this.announce(`DEMO message ${messageId} stored in memory — not delivered to QQ.`);
                data = { message_id: messageId };
                break;
            }

            default:
                return {
                    status: 'failed',
                    retcode: 1404,
                    message: `DEMO: Action ${action} is not simulated`,
                };
        }

        return { status: 'ok', retcode: 0, data, message: 'DEMO: Simulated result only' };
    }

    private cleanup(body: Body): Response {
        const request = body as unknown as StorageCleanupRequest;
        const snapshot = this.state.storage.snapshot;
        let freedBytes: number;
        let deletedFiles: number;

        if (request.scope === 'logs') {
            // The real transport closes old writers, clears their files, and reopens empty writers.
            deletedFiles = snapshot.logs.fileCount;
            freedBytes = snapshot.logs.totalBytes;
            snapshot.logs.totalBytes = 0;
            snapshot.logs.fileCount = snapshot.logs.activeFileCount;
        } else if (request.scope === 'temporary') {
            // Temporary fixtures retain the active transfers and their share of sample bytes.
            deletedFiles = snapshot.temporary.fileCount - snapshot.temporary.activeItemCount;
            freedBytes = Math.floor(
                (snapshot.temporary.totalBytes * deletedFiles) /
                    Math.max(1, snapshot.temporary.fileCount),
            );
            snapshot.temporary.totalBytes -= freedBytes;
            snapshot.temporary.fileCount = snapshot.temporary.activeItemCount;
        } else if (request.scope === 'account' || request.scope === 'allAccounts') {
            if (!['messages', 'media', 'reactions'].includes(request.category)) {
                return fakeError('DEMO: Invalid cleanup category');
            }

            if (request.scope === 'account' && request.uin !== DEMO_UIN) {
                return fakeError('DEMO: Unknown cleanup account', 404);
            }

            if (
                request.scope === 'allAccounts' &&
                request.confirmation !== ALL_ACCOUNTS_CONFIRMATION
            ) {
                return fakeError('DEMO: Explicit all-account confirmation required');
            }

            const account = snapshot.accounts[0];
            const field = `${request.category}Bytes` as
                'messagesBytes' | 'mediaBytes' | 'reactionsBytes';
            freedBytes = account[field];
            account[field] = 0;
            account.totalBytes -= freedBytes;
            deletedFiles = freedBytes ? 1 : 0;
        } else {
            return fakeError('DEMO: Unknown cleanup scope');
        }

        snapshot.totals = {
            logsBytes: snapshot.logs.totalBytes,
            temporaryBytes: snapshot.temporary.totalBytes,
            accountDataBytes: snapshot.accounts[0].totalBytes,
            managedBytes:
                snapshot.logs.totalBytes +
                snapshot.temporary.totalBytes +
                snapshot.accounts[0].totalBytes,
        };
        const lastCleanup = {
            at: new Date().toISOString(),
            scope: request.scope,
            accountScope:
                request.scope === 'account'
                    ? ('single' as const)
                    : request.scope === 'allAccounts'
                      ? ('all' as const)
                      : ('global' as const),
            ...('category' in request ? { category: request.category } : {}),
            ...('uin' in request ? { uin: request.uin } : {}),
            deletedFiles,
            freedBytes,
            failureCount: 0,
            failures: [],
        };
        this.state.storage.lastCleanup = lastCleanup;
        this.addLog(`DEMO cleanup: ${freedBytes} pretend bytes, no filesystem access`, 'success');
        return json({
            success: true,
            message: 'DEMO: In-memory cleanup only',
            scope: request.scope,
            cleanup: {
                deletedFiles,
                freedBytes,
                failures: [],
                skippedActiveItems:
                    request.scope === 'temporary' ? snapshot.temporary.activeItemCount : 0,
                status: snapshot.logs,
                ...('category' in request ? { category: request.category, uins: [DEMO_UIN] } : {}),
            },
            snapshot,
            lastCleanup,
        });
    }
}
