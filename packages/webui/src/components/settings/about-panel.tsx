import { useState, type ReactNode } from 'react';
import {
    Bug,
    Check,
    ExternalLink,
    Github,
    Loader2,
    Mail,
    RefreshCw,
    Sparkles,
    Scale,
    Tag,
    type Sun,
} from 'lucide-react';
import { BRAND_LOGO_URL } from '@/brand';
import { useT } from '@/i18n';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { UpdateInstaller } from '@/components/settings/update-installer';
import { UpdateSources } from '@/components/settings/update-sources';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useAppState } from '@/contexts/AppStateContext';
import { APP_VERSION } from '@/types';

// ─────────────── 关于 ───────────────

const REPO_URL = 'https://github.com/NowLuma/NowLuma';

function UpdateGroup() {
    const t = useT();
    const { updateInfo, refreshUpdate, resources } = useAppState();
    const { runAction } = useActionFeedback();
    const [checking, setChecking] = useState(false);

    const onCheck = async () => {
        setChecking(true);

        try {
            await runAction(
                {
                    title: t('正在检查更新', 'Checking for updates'),
                    detail: t(`当前版本 v${APP_VERSION}`, `Current version v${APP_VERSION}`),
                    successTitle: t('更新检查完成', 'Update check complete'),
                    successDetail: (result) =>
                        result?.hasUpdate && result.latest
                            ? t(
                                  `发现新版本 v${result.latest}`,
                                  `Found new version v${result.latest}`,
                              )
                            : t('当前已是最新版本', 'Already up to date'),
                    errorTitle: t('更新检查失败', 'Update check failed'),
                    resultError: (result) => {
                        if (!result) {
                            return t('更新检查未返回结果', 'Update check returned no result');
                        }

                        if (result.error === 'disabled') {
                            return t('更新检查已关闭', 'Update checks are disabled');
                        }

                        return result.error || null;
                    },
                },
                () => refreshUpdate(true),
            );
        } catch (error) {
            console.error('manual update check failed', error);
        } finally {
            setChecking(false);
        }
    };

    const disabledCheck = !resources.updateInfo.error && updateInfo?.error === 'disabled';
    const updateError = resources.updateInfo.error || (!disabledCheck ? updateInfo?.error : null);

    let status: ReactNode;

    if (updateError) {
        status = <span className="text-muted-foreground">{t('无法检查', 'Unable to check')}</span>;
    } else if (disabledCheck) {
        status = (
            <span className="text-muted-foreground">{t('检查已关闭', 'Checks disabled')}</span>
        );
    } else if (!updateInfo) {
        status = null;
    } else if (updateInfo.hasUpdate && updateInfo.latest) {
        status = <span className="font-medium">{t('发现新版本', 'Update available')}</span>;
    } else {
        status = (
            <span className="inline-flex items-center gap-1.5 text-success">
                <Check className="size-3.5" /> {t('已是最新', 'Up to date')}
            </span>
        );
    }

    // Rich detail block, only when an update is available (narrows `latest`).
    let detail: ReactNode = null;

    if (!updateError && !disabledCheck && updateInfo?.hasUpdate && updateInfo.latest) {
        const latest = updateInfo.latest;
        detail = (
            <div className="flex min-w-0 flex-col gap-3 py-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">v{latest}</span>
                    {updateInfo.publishedAt && (
                        <span className="ml-auto text-meta tabular-nums text-muted-foreground">
                            {new Date(updateInfo.publishedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">
                    {t(
                        `当前 v${updateInfo.current} → 最新 v${latest}`,
                        `Current v${updateInfo.current} → Latest v${latest}`,
                    )}
                </p>
                {updateInfo.notes && (
                    <details className="text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('版本变更', 'Changes')}
                        </summary>
                        <pre className="max-w-prose whitespace-pre-wrap break-words border-l pl-4 font-mono text-xs leading-relaxed">
                            {updateInfo.notes}
                        </pre>
                    </details>
                )}
                {updateInfo.htmlUrl && (
                    <Button asChild variant="glass" size="sm" className="self-start">
                        <a href={updateInfo.htmlUrl} target="_blank" rel="noreferrer noopener">
                            <ExternalLink className="size-4" /> {t('发布说明', 'Release notes')}
                        </a>
                    </Button>
                )}
            </div>
        );
    }

    return (
        <Group title={t('软件更新', 'Software update')} icon={Sparkles}>
            <SettingRow label={t('检查更新', 'Check for updates')}>
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                    <SkeletonSwap
                        ready={resources.updateInfo.ready}
                        reserve={24}
                        lines={1}
                        lineHeight={24}
                        barHeight={8}
                        label={t('更新状态', 'Update status')}
                        className={
                            resources.updateInfo.ready
                                ? 'skeleton-swap-fluid min-h-6 min-w-24'
                                : 'w-24'
                        }
                    >
                        {resources.updateInfo.ready ? status : null}
                    </SkeletonSwap>
                    {!disabledCheck && (
                        <Button variant="glass" size="sm" onClick={onCheck} disabled={checking}>
                            {checking ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <RefreshCw className="size-4" />
                            )}
                            {t('重新检查', 'Check again')}
                        </Button>
                    )}
                </div>
            </SettingRow>
            {detail}
            {updateError && (
                <p role="alert" className="py-3 text-xs text-destructive">
                    {updateError}
                </p>
            )}
            <UpdateSources />
            <UpdateInstaller
                version={
                    !updateError && !disabledCheck && updateInfo?.hasUpdate
                        ? updateInfo.latest
                        : null
                }
            />
        </Group>
    );
}

export function AboutPanel() {
    const t = useT();

    return (
        <div className="flex min-w-0 flex-col gap-7">
            <header
                aria-label="Nowluma"
                className="flex flex-wrap items-center gap-3 border-b pb-5"
            >
                <img src={BRAND_LOGO_URL} alt="" className="size-9 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl font-semibold tracking-tight">Nowluma</h2>
                    <p className="mt-1 text-xs text-muted-foreground">QQ NT · OneBot v11</p>
                </div>
                <code className="font-mono text-xs text-muted-foreground tabular-nums">
                    v{APP_VERSION}
                </code>
            </header>

            <UpdateGroup />

            <Group
                title={t('项目与许可', 'Project and licensing')}
                icon={Scale}
                description="© 2026 Nowluma contributors"
            >
                <SettingRow label={t('源代码', 'Source code')}>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
                        <AboutLink href={REPO_URL} icon={Github}>
                            GitHub
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/releases`} icon={Tag}>
                            {t('发行版', 'Releases')}
                        </AboutLink>
                        <AboutLink href={`${REPO_URL}/issues`} icon={Bug}>
                            {t('反馈问题', 'Report an issue')}
                        </AboutLink>
                    </div>
                </SettingRow>
                <SettingRow
                    label="GPLv3"
                    hint={t(
                        '允许使用、修改和分发（含商业用途），无担保；第三方与原生组件遵循各自许可。',
                        'Use, modify and redistribute, including commercially, with no warranty; third-party and native components keep their own licenses.',
                    )}
                >
                    <AboutLink href="https://www.gnu.org/licenses/gpl-3.0.html" icon={Scale}>
                        {t('查看许可', 'View license')}
                    </AboutLink>
                </SettingRow>
                <SettingRow label={t('侵权投诉', 'Copyright complaints')}>
                    <AboutLink href="mailto:ws675170761@gmail.com" icon={Mail}>
                        ws675170761@gmail.com
                    </AboutLink>
                </SettingRow>
            </Group>
        </div>
    );
}

function AboutLink({
    href,
    icon: Icon,
    children,
}: {
    href: string;
    icon: typeof Sun;
    children: ReactNode;
}) {
    return (
        <Button asChild variant="glass" size="sm" className="max-w-full whitespace-normal">
            <a href={href} target="_blank" rel="noreferrer noopener">
                <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="min-w-0 break-all">{children}</span>
                <ExternalLink aria-hidden="true" className="size-3 shrink-0 opacity-50" />
            </a>
        </Button>
    );
}
