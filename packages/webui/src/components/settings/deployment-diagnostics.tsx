import { Copy, Folder } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { Group } from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { copyText } from '@/lib/utils';

export function DeploymentDiagnostics() {
    const t = useT();
    const { systemInfo, resources, refreshSystem } = useAppState();
    const { runAction } = useActionFeedback();
    const info = systemInfo?.deployment;

    if (!info) {
        return null;
    }

    const rows: Array<[string, string, string, boolean | undefined]> = [
        ['workdir', t('程序工作目录', 'Working directory'), info.workingDirectory, undefined],
        ['home', t('当前服务 HOME', 'Service HOME'), info.home, undefined],
        [
            'config',
            t('程序配置', 'Application configuration'),
            info.directories.config,
            info.writable.config,
        ],
        ['data', t('消息与媒体', 'Messages and media'), info.directories.data, info.writable.data],
        ['logs', t('运行日志', 'Runtime logs'), info.directories.logs, info.writable.logs],
    ];

    if (systemInfo.platform === 'linux') {
        rows.push([
            'qq',
            t('Linux 默认 QQ 配置', 'Default QQ configuration on Linux'),
            info.directories.qq,
            info.writable.qq,
        ]);
    }

    const report = JSON.stringify(
        {
            mode: info.mode,
            uid: info.uid,
            home: info.home,
            workingDirectory: info.workingDirectory,
            directories: info.directories,
            writable: info.writable,
        },
        null,
        2,
    );

    const copy = async () => {
        try {
            await runAction(
                {
                    title: t('正在复制运行诊断', 'Copying runtime diagnostics'),
                    successTitle: t('诊断已复制', 'Diagnostics copied'),
                    errorTitle: t('复制失败', 'Could not copy diagnostics'),
                },
                async () => {
                    if (!(await copyText(report))) {
                        throw new Error(
                            t(
                                '无法写入剪贴板，请手动复制路径',
                                'Could not write to the clipboard. Copy the paths manually.',
                            ),
                        );
                    }
                },
            );
        } catch {
            // The operation's persistent result notice owns its error.
        }
    };

    return (
        <Group
            title={t('运行目录', 'Runtime directories')}
            icon={Folder}
            description={
                <>
                    {info.mode === 'docker' ? 'Docker' : t('原生运行', 'Native')} · UID{' '}
                    {info.uid ?? t('不适用', 'N/A')}
                </>
            }
        >
            <div className="flex min-w-0 flex-col gap-3 py-3">
                {resources.systemInfo.error && (
                    <p role="alert" className="text-xs text-destructive">
                        {t(
                            `${resources.systemInfo.error}；以下是上次读取结果。`,
                            `${resources.systemInfo.error} Showing the last available results.`,
                        )}
                    </p>
                )}
                <dl className="divide-y divide-border/60">
                    {rows.map(([id, name, directory, writable]) => (
                        <div
                            key={id}
                            className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-6"
                        >
                            <dt className="text-xs text-muted-foreground">{name}</dt>
                            <dd className="min-w-0">
                                <code
                                    className="break-all text-xs"
                                    data-tutorial-control={
                                        id === 'home' ? 'diagnostics-home' : undefined
                                    }
                                >
                                    {directory}
                                </code>
                                {writable !== undefined && (
                                    <p
                                        className={`mt-1 text-xs ${writable ? 'text-success' : 'text-destructive'}`}
                                    >
                                        {writable
                                            ? t('可写', 'Writable')
                                            : t('未创建或不可写', 'Missing or not writable')}
                                    </p>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
                <details className="text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {t('QQ 数据与诊断范围', 'QQ data and diagnostics')}
                    </summary>
                    <p className="max-w-prose leading-relaxed">
                        {t(
                            'QQ 自动登录由客户端保存到用户目录。Docker 需保留整个 HOME 卷，不要用 down -v 重启；原生 QQ 目录取决于 QQ 进程的用户环境。复制诊断不包含令牌、密码或 QQ 登录库。',
                            'The QQ client stores automatic sign-in data in the user directory. In Docker, keep the entire HOME volume; do not use down -v to restart. In native deployments, the QQ directory depends on the QQ process user environment. Copied diagnostics do not include tokens, passwords, or the QQ login database.',
                        )}
                    </p>
                </details>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="glass"
                        data-tutorial-control="copy-diagnostics"
                        onClick={() => void copy()}
                    >
                        <Copy className="size-3.5" /> {t('复制诊断', 'Copy diagnostics')}
                    </Button>
                    <Button size="sm" variant="glass" onClick={refreshSystem}>
                        {t('刷新状态', 'Refresh status')}
                    </Button>
                </div>
            </div>
        </Group>
    );
}
