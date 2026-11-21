import type { DemoApi, TutorialBaseline } from './api';
import type { TutorialId, TutorialLanguage } from './tutorial-options';

export type TutorialText = Readonly<{ zh: string; en: string }>;
export type TutorialTarget = Readonly<{ selector: string }>;
export type TutorialProof =
    | 'reading'
    | 'login'
    | 'consent'
    | 'password'
    | 'appearance'
    | 'console'
    | 'process'
    | 'kernel'
    | 'online'
    | 'stopped'
    | 'account-config'
    | 'http-config'
    | 'config-saved'
    | 'logs'
    | 'log-filter'
    | 'trace-export'
    | 'debug'
    | 'message-sent'
    | 'message-inspected'
    | 'appearance-panel'
    | 'service-panel'
    | 'service-saved'
    | 'storage-panel'
    | 'storage-saved'
    | 'logs-cleaned'
    | 'backup-export'
    | 'diagnostics'
    | 'offline';
export type TutorialStep = Readonly<{
    id: string;
    title: TutorialText;
    hint: TutorialText;
    route: string;
    proof: TutorialProof;
    target: TutorialTarget;
}>;
export type TutorialLesson = Readonly<{
    id: TutorialId;
    title: TutorialText;
    baseline: TutorialBaseline;
    steps: readonly TutorialStep[];
}>;

// Selectors identify the same real controls in both console languages.
export const tutorialControl = (id: string, container = '.demo-console') =>
    `${container} [data-tutorial-control="${id}"]`;
const processTarget = { selector: tutorialControl('process-detail') };
const consoleTarget = { selector: '.demo-console main' };
const serviceTarget = { selector: '[data-settings-tab="system"]' };
const diagnosticsTarget = { selector: tutorialControl('copy-diagnostics') };
const actionTarget = { selector: `${tutorialControl('debug-action')} button` };

const overview: TutorialStep = {
    id: 'overview',
    title: { zh: '检查会话与运行状态', en: 'Inspect session and runtime status' },
    hint: {
        zh: '观察概览中的示例账号、进程和连接。在线仅表示模拟器会话；不证明机器人回复。',
        en: 'Inspect the sample account, process and adapter on Overview. Online here is a simulated session, not evidence of bot replies.',
    },
    route: '/',
    proof: 'console',
    target: consoleTarget,
};
const process: TutorialStep = {
    id: 'process',
    title: { zh: '选择 PID 4242 的示例进程', en: 'Inspect sample process PID 4242' },
    hint: {
        zh: '在进程列表选择 4242，查看右侧账号和接入状态。本地识别不等于登录成功。',
        en: 'Select PID 4242 in the process list and inspect its account and attachment status. Local detection is not confirmed login.',
    },
    route: '/processes',
    proof: 'process',
    target: processTarget,
};
const config: TutorialStep = {
    id: 'account',
    title: { zh: '确认账号 10001 的配置上下文', en: 'Inspect account 10001 configuration' },
    hint: {
        zh: '选择 DEMO 小光 / 10001，打开消息行为。配置按账号隔离，不是全局设置。',
        en: 'Select DEMO 小光 / 10001 and inspect Message behavior. These settings belong to this account, not the whole service.',
    },
    route: '/config',
    proof: 'account-config',
    target: { selector: '#config-panel-general' },
};
const http: TutorialStep = {
    id: 'http',
    title: { zh: '打开 HTTP 接口配置', en: 'Open the HTTP adapter configuration' },
    hint: {
        zh: '点「HTTP 接口」，查看 DEMO HTTP 的监听地址和开关；编辑仅保存在本页内存，不会打开端口。',
        en: 'Choose HTTP API and inspect DEMO HTTP. Edits remain in this page’s memory and never open a listening port.',
    },
    route: '/config',
    proof: 'http-config',
    target: { selector: '#config-tab-httpServers' },
};
const saveConfig: TutorialStep = {
    id: 'save-config',
    title: { zh: '保存一次示例账号配置', en: 'Save the sample account configuration' },
    hint: {
        zh: '可编辑 DEMO HTTP 后保存，或点「立即保存」。只有 API 接受保存才完成；失败不会算作完成。',
        en: 'Edit DEMO HTTP and save, or choose Save now. Only an accepted API save completes this step; a failed write does not.',
    },
    route: '/config',
    proof: 'config-saved',
    target: { selector: tutorialControl('config-save') },
};
const logs: TutorialStep = {
    id: 'logs',
    title: { zh: '查看示例日志工作区', en: 'Inspect the sample log workspace' },
    hint: {
        zh: '日志中的 DEMO 标记表示样本，不是真实 QQ 记录。搜索、级别过滤和清空视图不删除服务器文件。',
        en: 'DEMO entries are samples, not QQ records. Search, level filters and clearing the view do not delete server files.',
    },
    route: '/logs',
    proof: 'logs',
    target: { selector: tutorialControl('log-workspace') },
};
const filterLogs: TutorialStep = {
    id: 'filter',
    title: { zh: '搜索 DEMO 日志', en: 'Filter logs for DEMO' },
    hint: {
        zh: '在「搜索消息 / 模块 / 级别」输入 DEMO，确认仍有匹配样本。清除搜索可以恢复视图。',
        en: 'Type DEMO in Search message / module / level and inspect the matching sample entries. Clear the search to restore the view.',
    },
    route: '/logs',
    proof: 'log-filter',
    target: { selector: tutorialControl('log-search') },
};
const service: TutorialStep = {
    id: 'service',
    title: { zh: '打开服务设置', en: 'Inspect service settings' },
    hint: {
        zh: '查看监听端口 5099、绑定地址和代理设置。此处是安装完成后的控制台，不执行系统安装或真实重启。',
        en: 'Inspect port 5099, bind address and proxy settings. This is the post-install console; it does not install software or restart an OS service.',
    },
    route: '/settings?tab=system',
    proof: 'service-panel',
    target: serviceTarget,
};
const diagnostics: TutorialStep = {
    id: 'diagnostics',
    title: { zh: '核对部署诊断中的目录', en: 'Inspect deployment directories' },
    hint: {
        zh: '在服务页向下找到「运行目录」，检查工作目录、HOME 和可写性。所有 /DEMO 路径均为样本；真实路径需在自己的部署核实。',
        en: 'Find Runtime directories on the Service page. Inspect working directory, HOME and write access. /DEMO paths are samples; verify real paths on your own deployment.',
    },
    route: '/settings?tab=system',
    proof: 'diagnostics',
    target: diagnosticsTarget,
};
const storage: TutorialStep = {
    id: 'storage',
    title: { zh: '查看存储分类与保留策略', en: 'Inspect storage categories and retention' },
    hint: {
        zh: '区分日志、临时数据与账号数据库。示例字节数只存在内存，清理不是备份。',
        en: 'Distinguish logs, temporary files and account databases. Sample byte counts are memory-only; cleanup is not backup.',
    },
    route: '/settings?tab=storage',
    proof: 'storage-panel',
    target: { selector: '[data-settings-tab="storage"]' },
};

function reading(id: string, title: TutorialText, hint: TutorialText, route = '/'): TutorialStep {
    return { id, title, hint, route, proof: 'reading', target: consoleTarget };
}

const firstRun: readonly TutorialStep[] = [
    {
        id: 'login',
        title: { zh: '用公开示例密码登录', en: 'Log in with the public example password' },
        hint: {
            zh: '访问密码填 DemoOnly!2026 并登录。不要输入自己的密码。',
            en: 'Enter DemoOnly!2026 in Access password and log in. Never enter your own password.',
        },
        route: '/',
        proof: 'login',
        target: { selector: '#login-password' },
    },
    {
        id: 'consent',
        title: {
            zh: '阅读并主动确认练习说明',
            en: 'Read and actively accept the practice notices',
        },
        hint: {
            zh: '阅读使用与隐私说明，主动勾选「我已阅读」，再点「确认并继续」。引导不会代替你确认。',
            en: 'Read the use and privacy notices, actively acknowledge both, then confirm and continue. The guide never accepts on your behalf.',
        },
        route: '/',
        proof: 'consent',
        target: { selector: tutorialControl('agreement-ack') },
    },
    {
        id: 'password',
        title: { zh: '设置公开示例新密码', en: 'Set the public example new password' },
        hint: {
            zh: '新密码与确认都填 DemoChanged!2026，再「保存并继续」。只保存成功才完成。',
            en: 'Enter DemoChanged!2026 in both new-password fields, then choose Save and continue. Only a successful save completes this step.',
        },
        route: '/',
        proof: 'password',
        target: { selector: '#onboarding-cpw-new' },
    },
    {
        id: 'effects',
        title: { zh: '手动选择显示效果并保存', en: 'Choose and save display effects manually' },
        hint: {
            zh: '主动选择动效开关与完整/磨砂玻璃，再点「保存并继续」。没有自动性能分档。',
            en: 'Explicitly choose motion and full or frosted glass, then select Save and continue. There is no automatic performance tier selection.',
        },
        route: '/',
        proof: 'appearance',
        target: { selector: tutorialControl('effect-preview') },
    },
    {
        id: 'finish',
        title: { zh: '完成内核预览并进入概览', en: 'Finish the kernel preview and enter Overview' },
        hint: {
            zh: '无已识别账号时查看可用性，点「继续」进入控制台。重写内核不可用；此步不伪造账号风险确认。',
            en: 'With no detected account, inspect availability and choose Continue to enter the console. Rewrite remains unavailable; this step does not fabricate account risk consent.',
        },
        route: '/',
        proof: 'console',
        target: consoleTarget,
    },
];
const qq: readonly TutorialStep[] = [
    process,
    {
        id: 'kernel',
        title: {
            zh: '加载并确认此账号的接入内核',
            en: 'Load and confirm this account’s kernel',
        },
        hint: {
            zh: '先在 PID 4242 详情点「加载」。阅读弹出的说明，选择兼容内核、主动勾选风险，再点「确认并接入」。取消不接入，重写内核不可用。',
            en: 'Choose Load for PID 4242. Read the dialog, select the compatible kernel, actively check its risk box, then confirm and attach. Cancel does not attach, and the rewrite remains unavailable.',
        },
        route: '/processes',
        proof: 'kernel',
        target: { selector: tutorialControl('process-load') },
    },
    {
        id: 'online',
        title: { zh: '检查模拟会话在线结果', en: 'Inspect the simulated online result' },
        hint: {
            zh: '等待进程详情显示会话已建立。保存内核不等于接入；本课不证明真实 QQ 投递。',
            en: 'Inspect the process detail after attachment. Saving a kernel choice alone is not attachment, and this lesson proves no real QQ delivery.',
        },
        route: '/processes',
        proof: 'online',
        target: processTarget,
    },
    {
        id: 'stop',
        title: { zh: '卸载并保持手动停止', en: 'Unload and preserve the manual stop' },
        hint: {
            zh: '点「卸载」，确认会话断开。已停止状态不会自动重连，只有主动再次加载才接入。重置可重新练习门禁。',
            en: 'Choose Unload and inspect the disconnected result. Manual stop does not auto-reconnect; only an explicit load attaches again. Restart the lesson to repeat the risk gate.',
        },
        route: '/processes',
        proof: 'stopped',
        target: { selector: tutorialControl('process-unload') },
    },
];

function lesson(
    id: TutorialId,
    title: TutorialText,
    steps: readonly TutorialStep[],
    baseline: TutorialBaseline = 'ready',
): TutorialLesson {
    return { id, title, steps, baseline };
}

export const TUTORIAL_LESSONS: Record<TutorialId, TutorialLesson> = {
    index: lesson('index', { zh: '文档入门', en: 'Documentation start' }, [
        reading(
            'boundary',
            { zh: '认识本章控制台操作', en: 'Start with the chapter console' },
            {
                zh: '上方是本章操作引导，下方是实际控制台。先在概览查看示例会话，再到进程页检查账号。理解这条操作路线后继续。',
                en: 'The chapter guide is above the console. Start by inspecting the sample session on Overview, then examine its account on Processes. Continue when you understand this route.',
            },
        ),
        overview,
        process,
    ]),
    introduction: lesson('introduction', { zh: '概念与边界', en: 'Concepts and boundaries' }, [
        overview,
        config,
        reading(
            'layers',
            { zh: '区分控制台、会话和适配器', en: 'Distinguish console, session and adapter' },
            {
                zh: '控制台登录、QQ 账号会话、适配器可用和机器人回复是不同证据。模拟在线或接口成功不证明真实消息投递。',
                en: 'Console login, QQ session, adapter availability and bot replies are separate evidence. Simulated online status or API success is not real delivery proof.',
            },
            '/config',
        ),
    ]),
    'install-docker': lesson(
        'install-docker',
        { zh: 'Docker 安装后的控制台检查', en: 'Post-Docker-install console checks' },
        [
            reading(
                'post-install',
                {
                    zh: '安装必须在真实环境执行',
                    en: 'Installation happens in the real environment',
                },
                {
                    zh: '本练习不运行 Docker、不创建卷。安装命令见下方正文；这里只学习安装完成后检查控制台、目录和桌面入口。',
                    en: 'This practice runs no Docker commands and creates no volumes. Use the chapter below for installation; here you learn post-install console, directory and desktop checks.',
                },
            ),
            service,
            diagnostics,
            process,
        ],
    ),
    'install-native': lesson(
        'install-native',
        { zh: '原生安装后的控制台检查', en: 'Post-native-install console checks' },
        [
            reading(
                'post-install',
                { zh: '此处不执行系统安装', en: 'This simulator does not install software' },
                {
                    zh: '真实安装器、权限和程序输出须在隔离系统验证。此处学习安装后的端口、HOME、数据目录检查，样本不代表安装验收。',
                    en: 'Verify the actual installer, permissions and process output in an isolated OS. Here you inspect post-install port, HOME and data directories; samples are not installer acceptance evidence.',
                },
            ),
            service,
            diagnostics,
            process,
        ],
    ),
    'first-run': lesson(
        'first-run',
        { zh: '首次登录与设置', en: 'First login and setup' },
        firstRun,
        'clean',
    ),
    overview: lesson('overview', { zh: '认识概览', en: 'Explore Overview' }, [
        overview,
        process,
        config,
    ]),
    'qq-connection': lesson(
        'qq-connection',
        { zh: '账号接入与手动停止', en: 'Account attachment and manual stop' },
        qq,
        'detected',
    ),
    'onebot-config': lesson(
        'onebot-config',
        { zh: '账号与适配器配置', en: 'Account and adapter configuration' },
        [
            config,
            http,
            saveConfig,
            reading(
                'availability',
                { zh: '配置保存不是投递证明', en: 'Saved configuration is not delivery proof' },
                {
                    zh: '样本适配器的 ok 仅为模拟监听状态。真实服务还需检查访问令牌、地址、防火墙和自己的客户端结果。',
                    en: 'The sample adapter’s ok is only a simulated listener state. A real service also requires checking tokens, addresses, firewall and your own client results.',
                },
                '/config',
            ),
        ],
    ),
    logs: lesson('logs', { zh: '日志搜索与导出', en: 'Log filtering and export' }, [
        logs,
        filterLogs,
        {
            id: 'trace-export',
            title: { zh: '导出完整示例 TRACE', en: 'Export the full sample TRACE' },
            hint: {
                zh: '在日志工具栏点「导出完整 TRACE」，查看导出的完整记录；当前搜索只影响视图，不限制完整导出。',
                en: 'Choose Export full TRACE in the log toolbar and inspect the complete exported record. The current search filters the view, not the full export.',
            },
            route: '/logs',
            proof: 'trace-export',
            target: { selector: tutorialControl('log-export-trace') },
        },
    ]),
    debug: lesson('debug', { zh: '示例发送与查询', en: 'Sample send and lookup' }, [
        {
            id: 'debug',
            title: { zh: '打开接口调用', en: 'Open the action tester' },
            hint: {
                zh: '在开发者工具选择「接口调用」，账号选择 10001。所有返回值均为 DEMO。',
                en: 'Open the action tester in Developer Tools and select account 10001. Every result is simulated.',
            },
            route: '/debug',
            proof: 'debug',
            target: actionTarget,
        },
        {
            id: 'send',
            title: { zh: '主动运行 send_private_msg', en: 'Explicitly invoke send_private_msg' },
            hint: {
                zh: '选择 send_private_msg，user_id 填 10002，message 填 #nl，再点「运行调用」。也可切 JSON 输入 {"user_id":10002,"message":"#nl"}。只存内存，不发 QQ。',
                en: 'Choose send_private_msg, set user_id to 10002 and message to #nl, then choose Run action. Or use JSON: {"user_id":10002,"message":"#nl"}. This stores a memory sample, not a QQ message.',
            },
            route: '/debug',
            proof: 'message-sent',
            target: { selector: tutorialControl('debug-run') },
        },
        {
            id: 'get',
            title: { zh: '用返回的 message_id 查询样本', en: 'Look up the returned message_id' },
            hint: {
                zh: '记下发送结果 message_id（首次为 101），选择 get_msg，填写该 ID 并「运行调用」。查询预置 100 或失败结果不算完成此步。',
                en: 'Note the returned message_id (initially 101), choose get_msg and run it with that ID. Reading seeded message 100 or receiving a failed result does not complete this step.',
            },
            route: '/debug',
            proof: 'message-inspected',
            target: actionTarget,
        },
    ]),
    'settings-console': lesson(
        'settings-console',
        { zh: '控制台显示设置', en: 'Console appearance settings' },
        [
            {
                id: 'appearance',
                title: { zh: '打开外观设置', en: 'Open appearance settings' },
                hint: {
                    zh: '查看外观中的主题、动效与玻璃材质。显示选择由你主动设置，不由性能检测自动切换。',
                    en: 'Inspect theme, motion and glass under Appearance. Display choices are manual, never automatically selected by performance detection.',
                },
                route: '/settings?tab=appearance',
                proof: 'appearance-panel',
                target: { selector: '[data-settings-tab="appearance"]' },
            },
            {
                id: 'save-appearance',
                title: { zh: '改变并保存一项显示选择', en: 'Change and save a display choice' },
                hint: {
                    zh: '切换动效或选择磨砂/完整玻璃。需要 API 实际接受显示保存；仅点击设置导航不算。此模拟器刷新后丢弃偏好。',
                    en: 'Toggle motion or choose frosted/full glass. The API must accept the saved appearance; merely clicking navigation does not count. Reload discards simulator preferences.',
                },
                route: '/settings?tab=appearance',
                proof: 'appearance',
                target: { selector: tutorialControl('motion-setting') },
            },
        ],
    ),
    'settings-runtime': lesson(
        'settings-runtime',
        { zh: '服务配置与应用边界', en: 'Service configuration and application boundary' },
        [
            service,
            {
                id: 'save-service',
                title: { zh: '保存示例端口 5100', en: 'Save sample port 5100' },
                hint: {
                    zh: '把端口从 5099 改成 5100，再点「保存服务设置」。检查「重启后生效」提示；这里只改内存，不改变监听、不重启服务。',
                    en: 'Change port 5099 to 5100 and save the service settings. Inspect the restart-required notice. Only memory changes here; no listener changes and no service restart occurs.',
                },
                route: '/settings?tab=system',
                proof: 'service-saved',
                target: { selector: tutorialControl('service-port') },
            },
            diagnostics,
        ],
    ),
    'access-network': lesson(
        'access-network',
        { zh: '访问与网络边界', en: 'Access and network boundaries' },
        [
            service,
            reading(
                'proxy',
                { zh: '理解绑定与代理信任', en: 'Understand binding and proxy trust' },
                {
                    zh: '127.0.0.1 默认只允许本机。公网访问需要自己的 TLS、强凭据与可信代理；不要照抄任意代理头。本练习没有真实网络探测。',
                    en: '127.0.0.1 is local-only by default. Public access requires your own TLS, strong credentials and trusted proxy configuration. Never blindly trust forwarded headers. This practice performs no network probes.',
                },
                '/settings?tab=system',
            ),
            http,
            saveConfig,
        ],
    ),
    'data-backup': lesson(
        'data-backup',
        { zh: '存储保留、清理与备份', en: 'Retention, cleanup and backup' },
        [
            storage,
            {
                id: 'retention',
                title: { zh: '保存 14 天日志保留', en: 'Save 14-day log retention' },
                hint: {
                    zh: '将「保留天数」改为 14，点「保存并应用」。需要已保存的有效状态等于 14，而非输入框变化。',
                    en: 'Set retention days to 14 and choose Save and apply. Completion requires the accepted effective state to be 14, not merely a changed input.',
                },
                route: '/settings?tab=storage',
                proof: 'storage-saved',
                target: { selector: tutorialControl('storage-retention') },
            },
            {
                id: 'cleanup',
                title: { zh: '确认清理示例日志', en: 'Confirm sample log cleanup' },
                hint: {
                    zh: '在「清理临时数据」区域找到「日志」一行，点该行「清理」；阅读「清理全部日志？」对话框，再点「确认清理」。日志字节数归零后才完成；取消不算。',
                    en: 'Under temporary data cleanup, find the Logs row and choose its cleanup button. Read the confirmation and confirm. Completion requires zero log bytes; cancel does not count.',
                },
                route: '/settings?tab=storage',
                proof: 'logs-cleaned',
                target: { selector: tutorialControl('storage-clean-logs') },
            },
            {
                id: 'backup',
                title: { zh: '导出 DEMO 配置备份', en: 'Export a DEMO configuration backup' },
                hint: {
                    zh: '打开服务页底部「服务配置备份」，不要勾选敏感配置，点「导出备份」。这是示例配置导出，不包含 QQ 登录目录或真实数据库。',
                    en: 'Find the service configuration backup at the bottom of Service. Leave sensitive configuration unchecked and choose Export backup. This exports sample configuration, not QQ login directories or real databases.',
                },
                route: '/settings?tab=system',
                proof: 'backup-export',
                target: { selector: tutorialControl('service-backup') },
            },
        ],
    ),
    troubleshooting: lesson(
        'troubleshooting',
        { zh: '从错误到诊断证据', en: 'From an error to diagnostic evidence' },
        [
            {
                ...process,
                id: 'offline',
                title: {
                    zh: '识别离线而不是猜测原因',
                    en: 'Inspect offline status without guessing the cause',
                },
                hint: {
                    zh: '本课预置离线样本。选择进程，阅读错误和会话状态；离线不能单独证明扫码失败、权限问题或 QQ 退出。',
                    en: 'This lesson seeds an offline sample. Select the process and inspect its error/session state. Offline alone proves neither QR failure, permissions problems nor QQ exit.',
                },
                proof: 'offline',
            },
            logs,
            filterLogs,
            diagnostics,
        ],
        'offline',
    ),
    demo: lesson('demo', { zh: '控制台操作', en: 'Console walkthrough' }, [
        reading(
            'limits',
            { zh: '认识引导、定位与重置', en: 'Use guidance, control focus and restart' },
            {
                zh: '每一步显示当前目标，可定位实际操作控件。完成操作后继续；也可返回重看、收起引导自由操作，或重新练习本章恢复示例账号。',
                en: 'Each step gives an objective and can locate its real control. Complete the operation to continue, revisit earlier steps, close the guide to explore, or restart the chapter to restore its sample account.',
            },
        ),
        overview,
        config,
        http,
        saveConfig,
    ]),
    planned: lesson('planned', { zh: '能力状态与规划', en: 'Capability status and plans' }, [
        process,
        reading(
            'unavailable',
            { zh: '不可用不是已实现', en: 'Unavailable does not mean implemented' },
            {
                zh: '重写内核仍标记不可用，不能选择，也不能静默回退。规划正文不是承诺交付；只以实际控制台和运行时可用性为准。',
                en: 'Rewrite is still unavailable: it cannot be selected or silently substituted. Planned work is not a delivery promise; the actual console/runtime capability is authoritative.',
            },
            '/processes',
        ),
        diagnostics,
    ]),
    developing: lesson(
        'developing',
        { zh: '开发与可验证证据', en: 'Development and verifiable evidence' },
        [
            diagnostics,
            reading(
                'evidence',
                { zh: '区分样本测试与真实验收', en: 'Separate sample tests from real acceptance' },
                {
                    zh: '本练习可验证表单、状态门禁与错误呈现，不能验证原生接入、真实 QQ 登录或消息送达。开发应保留账号隔离、主动风险确认与真实失败。',
                    en: 'This practice exercises forms, state gates and error presentation, not native attachment, real QQ login or delivery. Development must preserve account isolation, active risk acceptance and genuine failures.',
                },
                '/settings?tab=system',
            ),
            config,
            saveConfig,
        ],
    ),
};

export type TutorialSnapshot = DemoApi['tutorialSnapshot'];
export type TutorialSurface = Readonly<{
    console: boolean;
    process: boolean;
    accountConfig: boolean;
    httpConfig: boolean;
    logs: boolean;
    logFiltered: boolean;
    debug: boolean;
    appearance: boolean;
    service: boolean;
    storage: boolean;
    diagnostics: boolean;
}>;

// Pure proof gate: rendered outcomes or accepted domain state, never click delivery.
export function tutorialStepComplete(
    proof: TutorialProof,
    state: TutorialSnapshot,
    surface: TutorialSurface,
): boolean {
    switch (proof) {
        case 'reading':
            return false;
        case 'login':
            return state.authenticated;
        case 'consent':
            return state.consent;
        case 'password':
            return !state.mustChange;
        case 'appearance':
            return state.appearanceSaved;
        case 'console':
            return surface.console;
        case 'process':
            return surface.process;
        case 'kernel':
            return state.kernelAccepted;
        case 'online':
            return state.online && surface.process;
        case 'stopped':
            return state.stopped && !state.online;
        case 'account-config':
            return surface.accountConfig;
        case 'http-config':
            return surface.httpConfig;
        case 'config-saved':
            return state.configSaved;
        case 'logs':
            return surface.logs;
        case 'log-filter':
            return surface.logFiltered;
        case 'trace-export':
            return state.traceExported;
        case 'debug':
            return surface.debug;
        case 'message-sent':
            return state.sentMessageId !== null;
        case 'message-inspected':
            return state.sentMessageId !== null && state.inspectedMessageId === state.sentMessageId;
        case 'appearance-panel':
            return surface.appearance;
        case 'service-panel':
            return surface.service;
        case 'service-saved':
            return state.serviceSaved && state.webuiPort === 5100;
        case 'storage-panel':
            return surface.storage;
        case 'storage-saved':
            return state.storageSaved && state.logRetainDays === 14;
        case 'logs-cleaned':
            return state.cleanupScope === 'logs' && state.logsBytes === 0;
        case 'backup-export':
            return state.backupExported;
        case 'diagnostics':
            return surface.diagnostics;
        case 'offline':
            return !state.online && surface.process;
    }
}

export function tutorialText(text: TutorialText, language: TutorialLanguage): string {
    return text[language];
}
