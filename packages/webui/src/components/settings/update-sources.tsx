import { useEffect, useId, useState } from 'react';
import { normalizeUpdateSourceConfig } from '@nowluma/common/update-source';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useT } from '@/i18n';
import { useApi } from '@/lib/api';
import type { UpdateSourceConfig, UpdateSourceProbe } from '@/types';

export function UpdateSources() {
    const t = useT();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const id = useId();
    const [config, setConfig] = useState<UpdateSourceConfig | null>(null);
    const [mirrors, setMirrors] = useState('');
    const [results, setResults] = useState<UpdateSourceProbe[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [ready, setReady] = useState(false);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        let disposed = false;
        setReady(false);
        void api.update
            .sources()
            .then(({ config: next }) => {
                if (!disposed) {
                    setConfig(next);
                    setMirrors(next.mirrors.join('\n'));
                    setError(null);
                }
            })
            .catch((caught: unknown) => {
                if (!disposed) {
                    setError(caught instanceof Error ? caught.message : String(caught));
                }
            })
            .finally(() => {
                if (!disposed) {
                    setReady(true);
                }
            });

        return () => {
            disposed = true;
        };
    }, [api, reload]);

    const act = async (testing: boolean) => {
        setBusy(true);
        setError(null);

        try {
            await runAction(
                {
                    title: testing
                        ? t('正在检测更新来源', 'Checking update sources')
                        : t('正在保存更新来源', 'Saving update sources'),
                    successTitle: testing
                        ? t('来源检测完成', 'Source check complete')
                        : t('更新来源已保存', 'Update sources saved'),
                    successDetail: testing
                        ? t(
                              '检测从 Nowluma 所在服务器发起',
                              'Checked from the server running Nowluma',
                          )
                        : t('下次检查和下载时生效', 'Applies to the next check and download'),
                    errorTitle: testing
                        ? t('来源检测失败', 'Source check failed')
                        : t('保存失败', 'Save failed'),
                },
                async () => {
                    const next = normalizeUpdateSourceConfig({
                        ...config,
                        mirrors: mirrors
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean),
                    });

                    if (testing) {
                        setResults((await api.update.testSources(next)).results);
                    } else {
                        const saved = await api.update.saveSources(next);

                        if (!saved.saved || !saved.applied) {
                            throw new Error(saved.errors.join(t('；', '; ')) || saved.message);
                        }

                        setConfig(saved.config);
                        setMirrors(saved.config.mirrors.join('\n'));
                        setResults([]);
                    }
                },
            );
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex min-w-0 flex-col gap-3 py-3">
            {error && (
                <p role="alert" className="break-words text-xs text-destructive">
                    {error}
                </p>
            )}
            <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {t('更新来源', 'Update sources')}
                </summary>
                <SkeletonSwap
                    ready={ready}
                    reserve={100}
                    lines={3}
                    label={t('更新来源', 'Update sources')}
                >
                    {config ? (
                        <fieldset
                            disabled={busy}
                            className="flex min-w-0 flex-col gap-3 disabled:opacity-60"
                        >
                            <label className="text-xs font-medium">
                                {t('下载来源模式', 'Download source mode')}
                            </label>
                            <DropdownSelect
                                value={config.mode}
                                ariaLabel={t('下载来源模式', 'Download source mode')}
                                disabled={busy}
                                options={[
                                    { value: 'auto', label: t('自动切换', 'Auto') },
                                    { value: 'direct', label: t('GitHub 直连', 'Direct GitHub') },
                                    { value: 'mirror', label: t('指定镜像', 'Custom mirror') },
                                ]}
                                onChange={(mode) => {
                                    setConfig({ ...config, mode });
                                    setResults([]);
                                }}
                            />
                            <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                                {t(
                                    '自动模式先用 GitHub，失败后按列表切换。镜像用于下载，版本查询也会尝试 GitHub 发布页面。',
                                    'Auto tries GitHub first, then falls back through the list. Mirrors are used for downloads; version checks also try the GitHub releases page.',
                                )}
                            </p>
                            {config.mode === 'mirror' && (
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor={`${id}-mirror`} className="text-xs">
                                        {t('指定镜像地址', 'Custom mirror URL')}
                                    </label>
                                    <Input
                                        id={`${id}-mirror`}
                                        value={config.mirror}
                                        placeholder="https://ghfast.top"
                                        onChange={(event) => {
                                            setConfig({ ...config, mirror: event.target.value });
                                            setResults([]);
                                        }}
                                    />
                                </div>
                            )}
                            <details>
                                <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                    {t(
                                        '编辑候选镜像（每行一个地址）',
                                        'Edit candidate mirrors (one URL per line)',
                                    )}
                                </summary>
                                <Textarea
                                    aria-label={t('候选镜像地址', 'Candidate mirror URLs')}
                                    className="mt-2 min-h-32 font-mono text-xs"
                                    value={mirrors}
                                    onChange={(event) => {
                                        setMirrors(event.target.value);
                                        setResults([]);
                                    }}
                                />
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {t(
                                        '地址后会追加完整 GitHub 链接；支持带路径的代理前缀。',
                                        'The full GitHub URL is appended to the address; proxy prefixes with paths are supported.',
                                    )}
                                </p>
                            </details>
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    size="sm"
                                    variant="glass"
                                    onClick={() => {
                                        void act(true);
                                    }}
                                >
                                    {t('检测可用性', 'Check availability')}
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        void act(false);
                                    }}
                                >
                                    {t('保存来源', 'Save sources')}
                                </Button>
                            </div>
                            {results.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            '按可用性和响应延迟排序；检测结果不代表下载速度。',
                                            'Sorted by availability and response latency; results are not download speed.',
                                        )}
                                    </p>
                                    <ul className="flex min-w-0 flex-col divide-y divide-border/60">
                                        {results.map((result) => (
                                            <li
                                                key={result.mirror}
                                                className="flex min-w-0 flex-wrap items-center gap-2 py-3 text-xs"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-all">
                                                        {result.mirror ||
                                                            t('GitHub 直连', 'Direct GitHub')}
                                                    </p>
                                                    <p
                                                        className={
                                                            result.available
                                                                ? 'text-success'
                                                                : 'text-destructive'
                                                        }
                                                    >
                                                        {result.available
                                                            ? t(
                                                                  `可用 · ${result.latencyMs} ms`,
                                                                  `Available · ${result.latencyMs} ms`,
                                                              )
                                                            : result.error ||
                                                              t('不可用', 'Unavailable')}
                                                    </p>
                                                </div>
                                                {result.available && (
                                                    <Button
                                                        size="sm"
                                                        variant="glass"
                                                        onClick={() => {
                                                            setConfig({
                                                                ...config,
                                                                mode: result.mirror
                                                                    ? 'mirror'
                                                                    : 'direct',
                                                                mirror: result.mirror,
                                                            });
                                                        }}
                                                    >
                                                        {t('选用', 'Use')}
                                                    </Button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                    <Button
                                        size="sm"
                                        variant="glass"
                                        className="self-start"
                                        onClick={() => {
                                            setMirrors(
                                                results
                                                    .filter(
                                                        (result) =>
                                                            result.available && result.mirror,
                                                    )
                                                    .map((result) => result.mirror)
                                                    .join('\n'),
                                            );
                                            setConfig({ ...config, mode: 'auto' });
                                            setResults([]);
                                        }}
                                    >
                                        {t('仅保留可用镜像', 'Keep available mirrors only')}
                                    </Button>
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            '选用或筛选后，点击「保存来源」生效。',
                                            'After choosing or filtering, click “Save sources” to apply.',
                                        )}
                                    </p>
                                </div>
                            )}
                        </fieldset>
                    ) : (
                        ready && (
                            <Button
                                size="sm"
                                variant="glass"
                                onClick={() => setReload((value) => value + 1)}
                            >
                                {t('重试', 'Retry')}
                            </Button>
                        )
                    )}
                </SkeletonSwap>
            </details>
        </div>
    );
}
