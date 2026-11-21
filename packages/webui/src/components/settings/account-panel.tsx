import { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { TotpPanel } from '@/components/settings/totp-panel';
import { Button } from '@/components/ui/button';
import { useAppState } from '@/contexts/AppStateContext';
import { useT } from '@/i18n';

// ─────────────── 账号安全 ───────────────

export function AccountPanel() {
    const t = useT();
    const { onLogout } = useAppState();
    const [showChangePwd, setShowChangePwd] = useState(false);
    const [pwdSavedAt, setPwdSavedAt] = useState<number | null>(null);
    const [confirmLogout, setConfirmLogout] = useState(false);

    return (
        <div className="flex min-w-0 flex-col gap-7">
            <Group title={t('访问密码', 'Access password')} icon={KeyRound}>
                <SettingRow
                    label={t('访问密码', 'Access password')}
                    hint={
                        pwdSavedAt ? (
                            <span className="text-success">
                                {t('已更新（', 'Updated (')}
                                {new Date(pwdSavedAt).toLocaleTimeString()}
                                {t(
                                    '）— 其他设备的会话已失效。',
                                    ') — other device sessions have been revoked.',
                                )}
                            </span>
                        ) : (
                            t(
                                '修改后其他设备的会话将立即失效。',
                                'Other device sessions are revoked immediately after the change.',
                            )
                        )
                    }
                >
                    <Button variant="glass" size="sm" onClick={() => setShowChangePwd(true)}>
                        <KeyRound className="size-4" /> {t('修改密码', 'Change password')}
                    </Button>
                </SettingRow>
                <details className="py-3 text-xs text-muted-foreground">
                    <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {t('密码存储', 'Password storage')}
                    </summary>
                    <p className="max-w-prose leading-relaxed">
                        {t(
                            '管理员账号为 admin；密码以 scrypt 哈希保存在',
                            'The admin account is admin; the password is stored as a scrypt hash in',
                        )}{' '}
                        <code className="font-mono">config/webui.json</code>
                        {t('。', '.')}
                    </p>
                </details>
            </Group>

            <TotpPanel />

            <Group title={t('当前会话', 'Current session')} icon={ShieldCheck}>
                <SettingRow
                    label={t('退出登录', 'Sign out')}
                    hint={t('清除当前浏览器的会话令牌。', 'Clears this browser’s session token.')}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmLogout(true)}
                        className="text-destructive hover:text-destructive"
                    >
                        {t('退出登录', 'Sign out')}
                    </Button>
                </SettingRow>
            </Group>

            <ConfirmDialog
                open={confirmLogout}
                onOpenChange={setConfirmLogout}
                title={t('确认退出登录？', 'Sign out?')}
                description={t(
                    '退出后将清除当前会话令牌，需要重新输入访问密码才能进入控制台。',
                    'Signing out clears the current session token; the access password is required to return to the console.',
                )}
                confirmText={t('退出登录', 'Sign out')}
                cancelText={t('取消', 'Cancel')}
                destructive
                activity={{
                    title: t('正在退出登录', 'Signing out'),
                    successTitle: t('已退出登录', 'Signed out'),
                    errorTitle: t('退出登录失败', 'Sign-out failed'),
                }}
                onConfirm={onLogout}
            />
            <ChangePasswordDialog
                open={showChangePwd}
                onOpenChange={setShowChangePwd}
                onSuccess={() => setPwdSavedAt(Date.now())}
            />
        </div>
    );
}
