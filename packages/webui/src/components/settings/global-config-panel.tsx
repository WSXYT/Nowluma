import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, KeyRound, Music, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { DropdownSelect } from '@/components/ui/dropdown-select';
import { Label } from '@/components/ui/label';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { GlobalSettings } from '@/types';

const MUSIC_SIGN_DEFAULT = 'https://ss.xingzhige.com/music_card/card';

function isHttpUrl(value: string): boolean {
    try {
        const u = new URL(value);
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.length > 0;
    } catch {
        return false;
    }
}

export function GlobalConfigPanel() {
    const t = useT();
    const id = useId();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [config, setConfig] = useState<GlobalSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const { msg, flash, setMsg } = useFlashMessage();
    const saveTimer = useRef<number | null>(null);
    const saveGen = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);

        try {
            setConfig(await api.globalConfig.get());
        } catch (error) {
            console.error('load global config failed', error);
            setMsg(error instanceof Error ? { kind: 'err', text: error.message } : null);
        } finally {
            setLoading(false);
        }
    }, [api, setMsg]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(
        () => () => {
            if (saveTimer.current) {
                clearTimeout(saveTimer.current);
            }
        },
        [],
    );

    // Keep partially typed URLs in the draft until the next load.
    const commit = (
        next: GlobalSettings,
        feedback: false | { title: string; successTitle: string } = {
            title: t('正在更新全局配置', 'Updating global configuration'),
            successTitle: t('全局配置已更新', 'Global configuration updated'),
        },
    ) => {
        setConfig(next);
        const gen = ++saveGen.current;

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(() => {
            saveTimer.current = null;
            const dropped =
                next.rkey.fallbackServers.some((s) => s.trim() && !isHttpUrl(s.trim())) ||
                (next.musicSignUrl.trim().length > 0 && !isHttpUrl(next.musicSignUrl.trim()));
            const save =
                feedback === false
                    ? api.globalConfig.save(next)
                    : runAction(
                          {
                              title: feedback.title,
                              successTitle: feedback.successTitle,
                              successDetail: dropped
                                  ? t('已保存，无效项已忽略', 'Saved; invalid entries ignored')
                                  : t('配置已同步', 'Configuration synced'),
                              errorTitle: t(
                                  '全局配置更新失败',
                                  'Global configuration update failed',
                              ),
                          },
                          () => api.globalConfig.save(next),
                      );
            void save
                .then(() => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    flash(
                        'ok',
                        dropped
                            ? t('已保存（无效项已忽略）', 'Saved (invalid entries ignored)')
                            : t('已保存', 'Saved'),
                    );
                })
                .catch((error) => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    console.error('save global config failed', error);
                    setMsg({
                        kind: 'err',
                        text:
                            error instanceof Error
                                ? error.message
                                : t('保存全局配置失败', 'Failed to save global configuration'),
                    });
                });
        }, 500);
    };

    if (loading || !config) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={6}
                lineHeight={26}
                reserve={156}
                label={t('全局配置', 'Global configuration')}
                className={!loading ? 'skeleton-swap-fluid min-h-[156px]' : ''}
            >
                {!loading ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center gap-3 border-b py-5 text-muted-foreground"
                    >
                        <AlertTriangle className="size-4 shrink-0" />
                        <p className="text-sm text-destructive">
                            {msg?.text ??
                                t('加载全局配置失败', 'Failed to load global configuration')}
                        </p>
                        <Button variant="glass" size="sm" onClick={() => void load()}>
                            <RefreshCw className="size-3.5" /> {t('重试', 'Retry')}
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const servers = config.rkey.fallbackServers;
    const setServers = (next: string[]) =>
        commit({ ...config, rkey: { fallbackServers: next } }, false);

    return (
        <SkeletonSwap
            ready
            lines={6}
            lineHeight={26}
            reserve={156}
            label={t('全局配置', 'Global configuration')}
            className="skeleton-swap-fluid min-h-[156px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <Group
                    title={t('rkey 回退', 'rkey fallback')}
                    icon={KeyRound}
                    description={t(
                        '内核无法取得 rkey 时，按顺序请求回退服务。留空关闭。',
                        'When the kernel cannot obtain an rkey, fallback services are requested in order. Leave empty to disable.',
                    )}
                >
                    <div className="flex min-w-0 flex-col gap-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Label>{t('rkey 回退服务器', 'rkey fallback servers')}</Label>
                            <Button
                                variant="glass"
                                size="sm"
                                onClick={() => setServers([...servers, ''])}
                            >
                                <Plus className="size-3.5" /> {t('添加', 'Add')}
                            </Button>
                        </div>

                        {servers.length === 0 ? (
                            <p className="py-3 text-xs text-muted-foreground">
                                {t('回退服务器未启用', 'Fallback servers are not enabled')}
                            </p>
                        ) : (
                            <ol className="flex min-w-0 flex-col divide-y divide-border/60">
                                {servers.map((url, i) => {
                                    const invalid = url.trim().length > 0 && !isHttpUrl(url.trim());
                                    return (
                                        <li
                                            key={i}
                                            className="flex min-w-0 items-center gap-2 py-2"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground"
                                            >
                                                {i + 1}.
                                            </span>
                                            <Input
                                                type="url"
                                                aria-label={t(
                                                    `rkey 回退服务器 ${i + 1}`,
                                                    `rkey fallback server ${i + 1}`,
                                                )}
                                                inputMode="url"
                                                spellCheck={false}
                                                placeholder="https://your-rkey-server.example/rkeys"
                                                value={url}
                                                aria-invalid={invalid}
                                                className={cn(
                                                    'font-mono text-xs',
                                                    invalid &&
                                                        'border-destructive focus-visible:ring-destructive',
                                                )}
                                                onChange={(e) =>
                                                    setServers(
                                                        servers.map((s, idx) =>
                                                            idx === i ? e.target.value : s,
                                                        ),
                                                    )
                                                }
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={t(
                                                    `移除 rkey 回退服务器 ${i + 1}`,
                                                    `Remove rkey fallback server ${i + 1}`,
                                                )}
                                                className="shrink-0 text-muted-foreground hover:text-destructive"
                                                onClick={() =>
                                                    setServers(
                                                        servers.filter((_, idx) => idx !== i),
                                                    )
                                                }
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        <details className="text-xs text-muted-foreground">
                            <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {t('服务接口要求', 'Endpoint requirements')}
                            </summary>
                            <p className="max-w-prose leading-relaxed">
                                {t(
                                    '建议使用自建服务，仅支持 HTTP(S)。端点需返回',
                                    'A self-hosted service is recommended; only HTTP(S) is supported. The endpoint must return',
                                )}{' '}
                                <code className="break-all font-mono">
                                    {'{ group_rkey, private_rkey, expired_time }'}
                                </code>
                                {t('。', '.')}
                            </p>
                        </details>
                    </div>
                </Group>

                <Group title={t('视频上传', 'Video upload')} icon={Video}>
                    <SettingRow
                        label={t('上传连接数', 'Upload connections')}
                        hint={t(
                            '对所有账号的下一次视频上传生效。',
                            'Applies to the next video upload for every account.',
                        )}
                    >
                        <DropdownSelect
                            ariaLabel={t('视频上传连接数', 'Video upload connections')}
                            value={String(config.videoUploadConcurrency ?? 1)}
                            options={[
                                { value: '1', label: t('1 路（默认）', '1 (default)') },
                                { value: '2', label: t('2 路', '2') },
                                { value: '3', label: t('3 路', '3') },
                                { value: '4', label: t('4 路', '4') },
                            ]}
                            onChange={(value) =>
                                commit({ ...config, videoUploadConcurrency: Number(value) })
                            }
                        />
                    </SettingRow>
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('并发策略', 'Concurrency policy')}
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            {t(
                                '小视频使用单连接。多路上传取决于网络和服务器，拥塞时会降低并发。',
                                'Small videos use a single connection. Multi-connection uploads depend on the network and server; concurrency drops under congestion.',
                            )}
                        </p>
                    </details>
                </Group>
                <Group
                    title={t('音乐分享', 'Music sharing')}
                    icon={Music}
                    description={t(
                        '签名服务对所有账号生效。',
                        'The signing service applies to every account.',
                    )}
                >
                    <SettingRow
                        label={t('签名服务地址', 'Signing service URL')}
                        hint={t('留空使用内置服务。', 'Leave blank to use the built-in service.')}
                    >
                        <Input
                            type="url"
                            inputMode="url"
                            spellCheck={false}
                            id={`${id}-music`}
                            aria-label={t('签名服务地址', 'Signing service URL')}
                            placeholder={MUSIC_SIGN_DEFAULT}
                            value={config.musicSignUrl}
                            aria-invalid={
                                config.musicSignUrl.trim().length > 0 &&
                                !isHttpUrl(config.musicSignUrl.trim())
                            }
                            className={cn(
                                'font-mono text-xs',
                                config.musicSignUrl.trim().length > 0 &&
                                    !isHttpUrl(config.musicSignUrl.trim()) &&
                                    'border-destructive focus-visible:ring-destructive',
                            )}
                            onChange={(e) => commit({ ...config, musicSignUrl: e.target.value })}
                        />
                    </SettingRow>
                </Group>

                {msg && (
                    <p
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </p>
                )}
            </div>
        </SkeletonSwap>
    );
}
