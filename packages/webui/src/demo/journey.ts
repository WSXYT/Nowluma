export const DEMO_JOURNEY = [
    {
        id: 'setup',
        title: { zh: '首次设置', en: 'First-run setup' },
        route: '/',
        control: {
            zh: '访问密码 → 阅读说明 → 设置密码 → 显示效果 → 选择接入内核',
            en: 'Access password → Use notices → New password → Display effects → Kernel choice',
        },
        description: {
            zh: '用示例密码登录，依次完成四步：阅读并确认说明；两次填写示例新密码；主动选择动效与玻璃材质；最后预览账号内核，没有账号时点「继续」。',
            en: 'Sign in with the example password, then read and acknowledge the notices, enter and confirm the new password, choose motion and glass quality, and preview the kernel. Choose Continue if no account is detected.',
        },
    },
    {
        id: 'desktop',
        title: { zh: 'QQ 桌面与扫码', en: 'Mock desktop and scan' },
        route: '/processes',
        control: { zh: '打开 QQ 桌面 → 模拟扫码', en: 'Open QQ desktop → Simulate scan' },
        description: {
            zh: '在进程页点「打开 QQ 桌面」，再点「模拟扫码」；也可从引导打开模拟桌面。只会识别示例账号 10001，不打开 VNC、不登录 QQ。',
            en: 'Open the mock desktop and simulate a scan. This detects sample account 10001 without VNC, QR login or a QQ network request.',
        },
    },
    {
        id: 'gate',
        title: { zh: '选择账号内核', en: 'Account kernel' },
        route: '/processes',
        control: {
            zh: '加载 → 选择接入内核 → 勾选风险确认 → 确认并接入',
            en: 'Load → Choose attachment kernel → Acknowledge risks → Confirm and attach',
        },
        description: {
            zh: '对进程 4242 点「加载」，选择兼容内核并主动勾选风险确认，再确认接入。重写内核不可用。取消不会接入；卸载后保持停止，只有主动再次加载才接入。',
            en: 'Load process 4242, select the compatible kernel and actively acknowledge its risks. The rewrite is unavailable. Cancel does not attach; unloading stays in effect until another explicit load.',
        },
    },
    {
        id: 'connection',
        title: { zh: '账号与连接', en: 'Account and connection' },
        route: '/config',
        control: {
            zh: 'DEMO 小光 → HTTP 接口 → 立即保存',
            en: 'Account 10001 → HTTP API → Save now',
        },
        description: {
            zh: '选择账号 10001 后编辑连接。自动保存或「立即保存」只写入内存；可用「下次写入失败」练习失败后的重试，不会打开监听端口。',
            en: 'Select account 10001 and edit its connections. Autosave and Save now write to memory only. Use Fail next write to practise a rejected save and retry. No listener opens.',
        },
    },
    {
        id: 'action',
        title: { zh: '接口与消息', en: 'Actions and messages' },
        route: '/debug',
        control: {
            zh: '接口调用 → send_private_msg → 运行调用',
            en: 'Action tester → send_private_msg → Run action',
        },
        description: {
            zh: '在接口调用中选择账号 10001、send_private_msg，填写 user_id 10002 和消息 #nl，再用返回的 message_id 调用 get_msg。所有结果均为模拟。',
            en: 'Use account 10001, send_private_msg, user 10002 and message #nl, then call get_msg with the returned message_id. All results are simulated.',
        },
    },
    {
        id: 'logs',
        title: { zh: '日志', en: 'Logs' },
        route: '/logs',
        control: { zh: '日志级别 → 导出完整 TRACE', en: 'Log level → Export full TRACE' },
        description: {
            zh: '按级别和关键词筛选日志，可暂停跟随、导出当前视图或完整 TRACE。开启服务端 TRACE 仍需确认；「清空视图」不删除数据。',
            en: 'Filter by level or text, pause following, and export the view or the full TRACE. Enabling server TRACE requires confirmation; clearing the view does not delete data.',
        },
    },
    {
        id: 'storage',
        title: { zh: '存储', en: 'Storage' },
        route: '/settings?tab=storage',
        control: {
            zh: '日志保留 → 保存并应用；清理日志 → 确认清理',
            en: 'Log retention → Save and apply; Clean up logs → Confirm cleanup',
        },
        description: {
            zh: '设置日志保留；清理日志、临时数据或账号数据库需要确认。清理所有账号还要求离线并输入「清理全部账号」。只变更示例计数，不写文件或数据库。',
            en: 'Set log retention and confirm any log, temporary-data or account cleanup. Cleaning all accounts also requires them to be offline and the exact confirmation phrase 清理全部账号. Only sample counts change.',
        },
    },
    {
        id: 'settings',
        title: { zh: '设置', en: 'Settings' },
        route: '/settings?tab=appearance',
        control: {
            zh: '偏好设置 → 外观 / 账号安全 / 服务',
            en: 'Settings → Appearance / Account security / Service',
        },
        description: {
            zh: '十个分类均使用实际控制台组件。手动选择动效与玻璃材质；双重验证示例码是 123456。开发者演练只预览，不保存外观、密码或说明确认。',
            en: 'Explore the ten settings categories. Choose motion and glass quality manually; the example two-factor code is 123456. Onboarding rehearsal does not save appearance, passwords or acknowledgement.',
        },
    },
    {
        id: 'reset',
        title: { zh: '重置与刷新', en: 'Reset and refresh' },
        route: '/settings?tab=advanced',
        control: {
            zh: '顶部「重置」；偏好设置 → 高级 → 重置全部',
            en: 'Reset in the banner; Settings → Advanced → Reset all',
        },
        description: {
            zh: '顶部「重置」或刷新会清空练习数据并回到首次设置。高级页的「重置全部」只恢复界面配置。',
            en: 'Reset or reload clears the simulator and returns it to first setup. Reset all in Advanced restores only the interface preferences.',
        },
    },
] as const;
