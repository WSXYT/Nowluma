import { useId } from 'react';
import { useT } from '@/i18n';
import { History, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { NotificationOptIn } from '@/components/config/notification-opt-in';
import type { OneBotConfig, StatusCommandConfig } from '@/types';

interface GeneralSettingsTabProps {
    config: OneBotConfig;
    onChange: (next: OneBotConfig) => void;
}

export function GeneralSettingsTab({ config, onChange }: GeneralSettingsTabProps) {
    const t = useT();
    const id = useId();
    const sc = config.statusCommand;
    const setStatusCommand = (patch: Partial<StatusCommandConfig>) =>
        onChange({ ...config, statusCommand: { ...sc, ...patch } });

    return (
        <div className="flex min-w-0 flex-col gap-5">
            <Group
                title={t('登录与记录', 'Login and history')}
                icon={History}
                description={t(
                    '补齐最近会话的本地历史。',
                    'Fill gaps in local history for recent chats.',
                )}
            >
                <SettingRow
                    label={t('登录时同步云端历史', 'Sync cloud history at login')}
                    hint={t(
                        '下次登录或重启生效。每次最多同步 3 个群和 3 个好友，各 20 条；自动请求间隔至少 2 秒。仅写入本地历史，不重放事件、不改变已读状态。',
                        'Takes effect at next login or restart. Syncs up to 20 messages each for 3 groups and 3 friends, with at least 2 seconds between automatic requests. Updates local history only, without replaying events or changing read state.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={config.historySync.enabled}
                        onChange={(enabled) => onChange({ ...config, historySync: { enabled } })}
                        ariaLabel={t('登录时补齐云端历史记录', 'Sync cloud history at login')}
                    />
                </SettingRow>
            </Group>

            <Group
                title={t('状态回复', 'Status reply')}
                icon={MessageSquare}
                description={t(
                    '收到触发词时，回复版本、平台与运行时长。',
                    'Reply with the version, platform, and uptime when the trigger is received.',
                )}
            >
                <SettingRow
                    label={t('启用状态回复', 'Enable status reply')}
                    hint={t(
                        '任何人均可触发。关闭后完全不响应。',
                        'Anyone can trigger a reply. When disabled, no reply is sent.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={sc.enabled}
                        onChange={(enabled) => setStatusCommand({ enabled })}
                        ariaLabel={t(
                            `启用 ${sc.trigger} 状态命令`,
                            `Enable ${sc.trigger} status command`,
                        )}
                    />
                </SettingRow>
                <SettingRow
                    label={t('触发词', 'Trigger')}
                    hint={t(
                        '默认 #nl，最长 32 字符。匹配时忽略首尾空格与大小写。',
                        'Defaults to #nl, with a maximum of 32 characters. Matching ignores case and surrounding whitespace.',
                    )}
                    layout="stack"
                >
                    <Label htmlFor={`${id}-trigger`} className="sr-only">
                        {t('触发词', 'Trigger')}
                    </Label>
                    <Input
                        id={`${id}-trigger`}
                        className="max-w-sm font-mono"
                        value={sc.trigger}
                        disabled={!sc.enabled}
                        maxLength={32}
                        onChange={(e) => setStatusCommand({ trigger: e.target.value })}
                    />
                </SettingRow>
                <SettingRow
                    label={t('回复冷却（秒）', 'Reply cooldown (seconds)')}
                    hint={t(
                        '同一会话在冷却期间不重复回复。0 表示不限。',
                        'Only one reply per conversation during the cooldown. Use 0 for no cooldown.',
                    )}
                    layout="stack"
                >
                    <Label htmlFor={`${id}-cooldown`} className="sr-only">
                        {t('回复冷却（秒）', 'Reply cooldown (seconds)')}
                    </Label>
                    <Input
                        id={`${id}-cooldown`}
                        type="number"
                        min={0}
                        className="max-w-sm tabular-nums"
                        value={sc.cooldownSeconds}
                        disabled={!sc.enabled}
                        onChange={(e) => {
                            const n = Math.trunc(Number(e.target.value));
                            setStatusCommand({
                                cooldownSeconds: Number.isFinite(n) && n >= 0 ? n : 0,
                            });
                        }}
                    />
                </SettingRow>
                <SettingRow
                    label={t('拦截已命中的消息', 'Intercept matching messages')}
                    hint={t(
                        '不再转发给下游 Bot，仍会回复并记录。',
                        'Keep replying and logging, but do not forward matching messages to downstream bots.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={sc.swallow}
                        onChange={(swallow) => setStatusCommand({ swallow })}
                        ariaLabel={t(
                            `吞掉 ${sc.trigger} 不转发给下游`,
                            `Do not forward ${sc.trigger} to downstream bots`,
                        )}
                        disabled={!sc.enabled}
                    />
                </SettingRow>
            </Group>

            <NotificationOptIn
                selectedIds={config.notifications?.channelIds ?? []}
                onChange={(channelIds) => onChange({ ...config, notifications: { channelIds } })}
            />
        </div>
    );
}
