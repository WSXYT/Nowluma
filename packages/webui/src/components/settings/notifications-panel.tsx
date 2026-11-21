import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WEBHOOK_BODY } from '@nowluma/common/notification-templates';
import { Bell, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
    notificationChannelType,
    type NotificationChannel,
    type NotificationsConfig,
} from '@/types';
import { NotificationChannelDialog } from './notification-channel-dialog';

/** A fresh channel with a non-colliding default id. */
function blankChannel(existing: NotificationChannel[]): NotificationChannel {
    const used = new Set(existing.map((c) => c.id));
    let n = existing.length + 1;

    while (used.has(`channel-${n}`)) {
        n += 1;
    }

    return {
        id: `channel-${n}`,
        name: '',
        type: 'webhook',
        url: '',
        bodyTemplate: DEFAULT_WEBHOOK_BODY,
        enabled: true,
    };
}

interface DialogState {
    index: number | null; // null → create
    seed: NotificationChannel;
}

export function NotificationsPanel() {
    const t = useT();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [config, setConfig] = useState<NotificationsConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [testing, setTesting] = useState<string | null>(null);
    const { msg, flash, setMsg } = useFlashMessage();
    const saveTimer = useRef<number | null>(null);
    const saveGen = useRef(0);

    const load = useCallback(async () => {
        setLoading(true);
        setMsg(null);

        try {
            setConfig(await api.notifications.getConfig());
        } catch (error) {
            console.error('load notifications config failed', error);
            setMsg(null);
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

    /** Apply locally + debounced auto-save. A generation guard reconciles with
     *  the server's normalized result only if no newer edit landed meanwhile. */
    const commit = (
        next: NotificationsConfig,
        copy: { title: string; successTitle: string } = {
            title: t('正在更新通知配置', 'Updating notification settings'),
            successTitle: t('通知配置已更新', 'Notification settings updated'),
        },
    ) => {
        setConfig(next);
        const gen = ++saveGen.current;

        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
        }

        saveTimer.current = window.setTimeout(() => {
            saveTimer.current = null;
            void runAction(
                {
                    title: copy.title,
                    detail: t('正在同步通知渠道设置', 'Syncing notification channel settings'),
                    successTitle: copy.successTitle,
                    successDetail: t('通知配置已同步', 'Notification settings synced'),
                    errorTitle: t('通知配置更新失败', 'Notification settings update failed'),
                },
                () => api.notifications.saveConfig(next),
            )
                .then((result) => {
                    // Only the latest save reconciles + confirms; a superseded in-flight
                    // save stays silent (its successor will confirm).
                    if (saveGen.current !== gen) {
                        return;
                    }

                    setConfig(result);
                    flash('ok', t('已保存', 'Saved'));
                })
                .catch((error) => {
                    if (saveGen.current !== gen) {
                        return;
                    }

                    console.error('save notifications config failed', error);
                    setMsg({
                        kind: 'err',
                        text:
                            error instanceof Error
                                ? error.message
                                : t('保存通知配置失败', 'Failed to save notification settings'),
                    });
                });
        }, 350);
    };

    if (loading || !config) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={6}
                lineHeight={26}
                reserve={156}
                label={t('通知配置', 'Notification settings')}
                className={!loading ? 'skeleton-swap-fluid min-h-[156px]' : ''}
            >
                {!loading && !config ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-destructive"
                    >
                        <span>
                            {msg?.text ??
                                t('加载通知配置失败', 'Failed to load notification settings')}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => void load()}>
                            {t('重试', 'Retry')}
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const channels = config.channels;
    const setChannels = (
        next: NotificationChannel[],
        copy?: { title: string; successTitle: string },
    ) => commit({ ...config, channels: next }, copy);
    const otherIds = (index: number | null) =>
        channels.filter((_, i) => i !== index).map((c) => c.id);

    const openCreate = () => setDialog({ index: null, seed: blankChannel(channels) });
    const openEdit = (i: number) => setDialog({ index: i, seed: channels[i] });

    const submitChannel = (ch: NotificationChannel, index: number | null) => {
        if (index === null) {
            setChannels([...channels, ch], {
                title: t('正在新增通知渠道', 'Adding notification channel'),
                successTitle: t('通知渠道已新增', 'Notification channel added'),
            });
        } else {
            setChannels(
                channels.map((c, idx) => (idx === index ? ch : c)),
                {
                    title: t('正在更新通知渠道', 'Updating notification channel'),
                    successTitle: t('通知渠道已更新', 'Notification channel updated'),
                },
            );
        }
    };

    const test = async (id: string) => {
        setTesting(id);

        // Persist any pending edit first — the server tests the stored channel by id.
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }

        try {
            const res = await runAction(
                {
                    title: t('正在测试通知渠道', 'Testing notification channel'),
                    detail: id,
                    successTitle: t('测试通知已发送', 'Test notification sent'),
                    successDetail: id,
                    errorTitle: t('通知渠道测试失败', 'Notification channel test failed'),
                    resultError: (result) =>
                        result.success
                            ? null
                            : result.message || t('测试发送失败', 'Test delivery failed'),
                },
                async () => {
                    await api.notifications.saveConfig(config);
                    return api.notifications.test(id);
                },
            );

            if (res.success) {
                flash('ok', res.message ?? t('测试发送成功', 'Test sent successfully'));
            } else {
                setMsg({
                    kind: 'err',
                    text: res.message || t('测试发送失败', 'Test delivery failed'),
                });
            }
        } catch (error) {
            console.error('test notification channel failed', error);
            setMsg({
                kind: 'err',
                text:
                    error instanceof Error
                        ? error.message
                        : t('测试请求失败', 'Test request failed'),
            });
        } finally {
            setTesting(null);
        }
    };

    return (
        <SkeletonSwap
            ready
            lines={6}
            lineHeight={26}
            reserve={156}
            label={t('通知配置', 'Notification settings')}
            className="skeleton-swap-fluid min-h-[156px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <Group title={t('通知策略', 'Notification policy')} icon={Bell}>
                    <SettingRow
                        label={t('下线等待', 'Offline delay')}
                        hint={t(
                            '下线超过此时长才通知；恢复时再通知。0 表示立即通知。',
                            'Notify only after being offline this long; notify again on recovery. 0 means notify immediately.',
                        )}
                    >
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                aria-label={t('去抖窗口（秒）', 'Debounce window (seconds)')}
                                min={0}
                                max={3600}
                                className="w-28 tabular-nums"
                                value={config.debounceSeconds}
                                disabled={testing !== null}
                                onChange={(e) => {
                                    const n = Math.trunc(Number(e.target.value));
                                    commit({
                                        ...config,
                                        debounceSeconds: Number.isFinite(n)
                                            ? Math.min(3600, Math.max(0, n))
                                            : 0,
                                    });
                                }}
                            />
                            <span className="text-xs text-muted-foreground">{t('秒', 's')}</span>
                        </div>
                    </SettingRow>
                </Group>

                <Group
                    title={t('通知渠道', 'Notification channels')}
                    description={t(
                        '在账号的配置页选择要启用的渠道。',
                        'Choose enabled channels on each account’s settings page.',
                    )}
                >
                    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <span className="text-xs tabular-nums text-muted-foreground">
                            {channels.length === 1
                                ? t('1 个渠道', '1 channel')
                                : t(`${channels.length} 个渠道`, `${channels.length} channels`)}
                        </span>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={openCreate}
                            disabled={testing !== null}
                        >
                            <Plus className="size-3.5" /> {t('新增渠道', 'Add channel')}
                        </Button>
                    </div>
                    {channels.length === 0 ? (
                        <p className="py-5 text-sm text-muted-foreground">
                            {t('尚未添加渠道。', 'No channels yet.')}
                        </p>
                    ) : (
                        <div className="divide-y divide-border/60">
                            {channels.map((ch, i) => (
                                <ChannelRow
                                    key={ch.id}
                                    channel={ch}
                                    testing={testing === ch.id}
                                    disabled={testing !== null}
                                    onToggle={(v) =>
                                        setChannels(
                                            channels.map((c, idx) =>
                                                idx === i ? { ...c, enabled: v } : c,
                                            ),
                                            {
                                                title: t(
                                                    '正在更新通知渠道',
                                                    'Updating notification channel',
                                                ),
                                                successTitle: t(
                                                    '通知渠道已更新',
                                                    'Notification channel updated',
                                                ),
                                            },
                                        )
                                    }
                                    onTest={() => void test(ch.id)}
                                    onEdit={() => openEdit(i)}
                                    onDelete={() =>
                                        setChannels(
                                            channels.filter((_, idx) => idx !== i),
                                            {
                                                title: t(
                                                    '正在删除通知渠道',
                                                    'Deleting notification channel',
                                                ),
                                                successTitle: t(
                                                    '通知渠道已删除',
                                                    'Notification channel deleted',
                                                ),
                                            },
                                        )
                                    }
                                />
                            ))}
                        </div>
                    )}
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

                {dialog && (
                    <NotificationChannelDialog
                        open
                        onOpenChange={(open) => !open && setDialog(null)}
                        isEdit={dialog.index != null}
                        initial={dialog.seed}
                        otherIds={otherIds(dialog.index)}
                        onSubmit={(channel) => submitChannel(channel, dialog.index)}
                    />
                )}
            </div>
        </SkeletonSwap>
    );
}

interface ChannelRowProps {
    channel: NotificationChannel;
    testing: boolean;
    disabled: boolean;
    onToggle: (v: boolean) => void;
    onTest: () => void;
    onEdit: () => void;
    onDelete: () => void;
}

/** Info-only row + inline actions. No live-typed fields — editing is the dialog. */
function ChannelRow({
    channel,
    testing,
    disabled,
    onToggle,
    onTest,
    onEdit,
    onDelete,
}: ChannelRowProps) {
    const t = useT();
    const kind = notificationChannelType(channel);
    return (
        <div
            className={cn(
                'grid min-w-0 gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start',
                !channel.enabled && 'opacity-60',
            )}
        >
            <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="break-words text-sm font-medium">
                        {channel.name || channel.id}
                    </h3>
                    {channel.name && (
                        <code className="break-all text-xs text-muted-foreground">
                            {channel.id}
                        </code>
                    )}
                    <span className="text-xs text-muted-foreground">
                        {kind === 'email' ? t('邮件', 'Email') : 'Webhook'}
                    </span>
                    {!channel.enabled && (
                        <span className="text-xs text-muted-foreground">
                            {t('已停用', 'Disabled')}
                        </span>
                    )}
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {kind === 'email'
                        ? [channel.to, channel.smtpHost].filter(Boolean).join(' · ')
                        : channel.url}
                </p>
                <details className="mt-1 text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {t('消息模板', 'Message template')}
                    </summary>
                    {kind === 'email' && channel.subjectTemplate && (
                        <div className="pb-3">
                            <p className="mb-1 font-medium text-foreground">
                                {t('主题', 'Subject')}
                            </p>
                            <pre className="max-w-prose whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                                {channel.subjectTemplate}
                            </pre>
                        </div>
                    )}
                    {kind === 'email' && (
                        <p className="mb-1 font-medium text-foreground">{t('正文', 'Body')}</p>
                    )}
                    <pre className="max-w-prose whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                        {channel.bodyTemplate}
                    </pre>
                </details>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <ToggleSwitch
                    value={channel.enabled}
                    onChange={onToggle}
                    ariaLabel={t(
                        `启用 ${channel.name || channel.id}`,
                        `Enable ${channel.name || channel.id}`,
                    )}
                    disabled={disabled}
                />
                <Button
                    variant="glass"
                    size="sm"
                    onClick={onTest}
                    disabled={disabled}
                    aria-label={t(
                        `测试发送 ${channel.name || channel.id}`,
                        `Send test to ${channel.name || channel.id}`,
                    )}
                    className="text-muted-foreground hover:text-foreground"
                >
                    {testing ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <Send className="optical-forward size-4" />
                    )}
                    {t('测试', 'Test')}
                </Button>
                <Button
                    variant="glass"
                    size="sm"
                    onClick={onEdit}
                    disabled={disabled}
                    aria-label={t(
                        `编辑 ${channel.name || channel.id}`,
                        `Edit ${channel.name || channel.id}`,
                    )}
                >
                    <Pencil className="size-4" /> {t('编辑', 'Edit')}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDelete}
                    aria-label={t(
                        `删除 ${channel.name || channel.id}`,
                        `Delete ${channel.name || channel.id}`,
                    )}
                    disabled={disabled}
                    className="text-muted-foreground hover:text-destructive"
                >
                    <Trash2 className="size-4" /> {t('删除', 'Delete')}
                </Button>
            </div>
        </div>
    );
}
