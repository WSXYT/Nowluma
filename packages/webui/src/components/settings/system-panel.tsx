// Listener changes apply after restart; environment overrides remain authoritative.
import { useEffect, useId, useRef, useState } from 'react';
import { desktopLink, normalizeVncUrl } from '@nowluma/common/desktop-url';
import {
    Database,
    Download,
    Loader2,
    Lock,
    Monitor,
    Pencil,
    Save,
    Server,
    ShieldCheck,
    Trash2,
    Upload,
} from 'lucide-react';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Badge } from '@/components/ui/badge';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DesktopButton } from '@/components/desktop-button';
import { DeploymentDiagnostics } from '@/components/settings/deployment-diagnostics';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi } from '@/lib/api';
import { useFlashMessage } from '@/hooks/use-flash-message';
import { useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';
import type { SystemSettingsResponse } from '@/types';

export function SystemPanel() {
    const t = useT();
    const id = useId();
    const api = useApi();
    const { runAction } = useActionFeedback();
    const [data, setData] = useState<SystemSettingsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { msg, flash, setMsg } = useFlashMessage(4000);

    // editable form state
    const [port, setPort] = useState('');
    const [host, setHost] = useState('127.0.0.1');
    const [trustProxy, setTrustProxy] = useState('');
    const [tlsEnabled, setTlsEnabled] = useState(false);
    const [vncPort, setVncPort] = useState('0');
    const [vncUrl, setVncUrl] = useState('');
    const [hookAutoLoad, setHookAutoLoad] = useState(false);
    const [certPem, setCertPem] = useState('');
    const [keyPem, setKeyPem] = useState('');
    // When a cert is already installed we hide the PEM inputs (sensitive) and
    // show an installed summary and a Replace button; editing reveals the inputs again.
    const [editingCert, setEditingCert] = useState(false);

    // backup / restore
    const [exportCreds, setExportCreds] = useState(false);
    const [restoreCreds, setRestoreCreds] = useState(false);
    const [confirmDeleteCert, setConfirmDeleteCert] = useState(false);
    const [pendingBackup, setPendingBackup] = useState<File | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async (): Promise<boolean> => {
        try {
            const res = await api.systemSettings.get();
            setData(res);
            setPort(String(res.settings.webuiPort));
            setHost(res.settings.webuiHost);
            setTrustProxy(res.settings.trustProxy);
            setTlsEnabled(res.settings.tlsEnabled);
            setVncPort(String(res.effective?.vncPort ?? res.settings.vncPort));
            setVncUrl(res.effective?.vncUrl ?? res.settings.vncUrl ?? '');
            setHookAutoLoad(res.effective?.hookAutoLoad ?? res.settings.hookAutoLoad === true);
            return true;
        } catch (error) {
            console.error('load system settings failed', error);
            setMsg({
                kind: 'err',
                text:
                    error instanceof Error
                        ? error.message
                        : t('加载系统设置失败', 'Could not load service settings'),
            });
            return false;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const overridden = (field: string) => data?.envOverrides.includes(field) ?? false;

    const saveSettings = async () => {
        const portNum = Number(port);

        if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
            flash('err', t('端口必须是 1–65535 的整数', 'Port must be an integer from 1 to 65535'));
            return;
        }

        const vncNum = Number(vncPort);

        if (!Number.isInteger(vncNum) || vncNum < 0 || vncNum > 65535) {
            flash(
                'err',
                t(
                    'QQ 桌面端口必须是 0–65535 的整数',
                    'QQ desktop port must be an integer from 0 to 65535',
                ),
            );
            return;
        }

        try {
            normalizeVncUrl(vncUrl);
        } catch (error) {
            flash(
                'err',
                error instanceof Error ? error.message : t('桌面地址无效', 'Invalid desktop URL'),
            );
            return;
        }

        setSaving(true);

        try {
            await runAction(
                {
                    title: t('正在更新服务设置', 'Updating service settings'),
                    detail: `${host.trim()}:${portNum}`,
                    successTitle: t('服务设置已更新', 'Service settings updated'),
                    successDetail: t(
                        '重启 Nowluma 后生效',
                        'Changes apply after restarting Nowluma',
                    ),
                    errorTitle: t('服务设置更新失败', 'Could not update service settings'),
                },
                () =>
                    api.systemSettings.save({
                        webuiPort: portNum,
                        webuiHost: host.trim(),
                        trustProxy,
                        tlsEnabled,
                        vncPort: overridden('vncPort') ? undefined : vncNum,
                        vncUrl: overridden('vncUrl') ? undefined : vncUrl.trim(),
                        hookAutoLoad: overridden('hookAutoLoad') ? undefined : hookAutoLoad,
                    }),
            );
            const refreshed = await load();

            if (refreshed) {
                flash(
                    'ok',
                    t(
                        '已保存，重启 Nowluma 后生效',
                        'Saved. Changes apply after restarting Nowluma.',
                    ),
                );
            } else {
                setMsg({
                    kind: 'err',
                    text: t(
                        '已保存，但状态刷新失败；请手动刷新页面，重启后应用。',
                        'Saved, but status refresh failed. Refresh the page. Changes apply after restart.',
                    ),
                });
            }
        } catch (e) {
            setMsg({
                kind: 'err',
                text: e instanceof Error ? e.message : t('保存失败', 'Save failed'),
            });
        } finally {
            setSaving(false);
        }
    };

    const uploadCert = async () => {
        if (!certPem.trim() || !keyPem.trim()) {
            flash('err', t('请同时填入证书与私钥', 'Enter both the certificate and private key'));
            return;
        }

        setSaving(true);

        try {
            await runAction(
                {
                    title: t('正在更新 TLS 证书', 'Updating TLS certificate'),
                    detail: t('正在校验证书与私钥', 'Validating the certificate and private key'),
                    successTitle: t('TLS 证书已更新', 'TLS certificate updated'),
                    successDetail: t(
                        '重启 Nowluma 后生效',
                        'Changes apply after restarting Nowluma',
                    ),
                    errorTitle: t('TLS 证书更新失败', 'Could not update the TLS certificate'),
                },
                () => api.systemSettings.uploadCert(certPem, keyPem),
            );
            setCertPem('');
            setKeyPem('');
            setEditingCert(false);
            setData((previous) =>
                previous && !previous.hasCert ? { ...previous, hasCert: true } : previous,
            );
            const refreshed = await load();

            if (refreshed) {
                flash(
                    'ok',
                    t('证书已保存，重启后生效', 'Certificate saved. Changes apply after restart.'),
                );
            } else {
                setMsg({
                    kind: 'err',
                    text: t(
                        '证书已保存，但状态刷新失败；请手动刷新页面，重启后应用。',
                        'Certificate saved, but status refresh failed. Refresh the page. Changes apply after restart.',
                    ),
                });
            }
        } catch (e) {
            setMsg({
                kind: 'err',
                text:
                    e instanceof Error
                        ? e.message
                        : t('证书保存失败', 'Could not save the certificate'),
            });
        } finally {
            setSaving(false);
        }
    };

    const deleteCert = async () => {
        setSaving(true);

        try {
            await runAction(
                {
                    title: t('正在删除 TLS 证书', 'Deleting TLS certificate'),
                    detail: t(
                        '正在移除服务器上的证书与私钥',
                        'Removing the certificate and private key from the server',
                    ),
                    successTitle: t('TLS 证书已删除', 'TLS certificate deleted'),
                    errorTitle: t('TLS 证书删除失败', 'Could not delete the TLS certificate'),
                },
                () => api.systemSettings.deleteCert(),
            );
            setEditingCert(false);
            setData((previous) => (previous?.hasCert ? { ...previous, hasCert: false } : previous));
            const refreshed = await load();

            if (refreshed) {
                flash('ok', t('证书已删除', 'Certificate deleted'));
            } else {
                setMsg({
                    kind: 'err',
                    text: t(
                        '证书已删除，但状态刷新失败；请手动刷新页面。',
                        'Certificate deleted, but status refresh failed. Refresh the page.',
                    ),
                });
            }
        } catch (e) {
            setMsg({
                kind: 'err',
                text: e instanceof Error ? e.message : t('删除失败', 'Deletion failed'),
            });
            throw e;
        } finally {
            setSaving(false);
        }
    };

    const exportBackup = async () => {
        setSaving(true);

        try {
            const bundle = await runAction(
                {
                    title: t('正在导出配置备份', 'Exporting configuration backup'),
                    detail: exportCreds
                        ? t('包含敏感配置', 'Includes sensitive settings')
                        : t('不包含敏感配置', 'Excludes sensitive settings'),
                    successTitle: t('配置备份已导出', 'Configuration backup exported'),
                    errorTitle: t('配置备份导出失败', 'Could not export the configuration backup'),
                },
                () => api.systemSettings.exportBackup(exportCreds),
            );
            downloadBlob(
                new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
                `nowluma-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
            );
            flash('ok', t('已导出备份', 'Backup exported'));
        } catch (e) {
            setMsg({
                kind: 'err',
                text: e instanceof Error ? e.message : t('导出失败', 'Export failed'),
            });
        } finally {
            setSaving(false);
        }
    };

    const importBackup = async (file: File) => {
        setSaving(true);

        try {
            const text = await file.text();
            let parsed: Record<string, unknown>;

            try {
                parsed = JSON.parse(text);
            } catch {
                throw new Error(t('文件不是有效的 JSON', 'The file is not valid JSON'));
            }

            const res = await runAction(
                {
                    title: t('正在恢复配置备份', 'Restoring configuration backup'),
                    detail: file.name,
                    successTitle: t('配置备份已恢复', 'Configuration backup restored'),
                    successDetail: t(
                        '恢复结果已写入服务器',
                        'Restored settings were written to the server',
                    ),
                    errorTitle: t('配置备份恢复失败', 'Could not restore the configuration backup'),
                },
                () => api.systemSettings.importBackup(parsed, restoreCreds),
            );
            const parts = res.restored.length
                ? [
                      t(
                          `已恢复 ${res.restored.length} 项`,
                          `Settings restored: ${res.restored.length}`,
                      ),
                  ]
                : [t('没有可恢复的配置', 'No settings to restore')];

            if (res.skipped.length) {
                parts.push(
                    t(
                        `跳过 ${res.skipped.length} 项（敏感配置，含 OneBot 配置）`,
                        `Sensitive settings skipped (including OneBot): ${res.skipped.length}`,
                    ),
                );
            }

            if (res.migrated.length) {
                parts.push(
                    t(
                        `兼容转换 ${res.migrated.length} 项`,
                        `Settings migrated: ${res.migrated.length}`,
                    ),
                );
            }

            const summary = `${parts.join(t('，', '. '))}${res.restartRequiredToApply ? t('，重启后生效', '. Changes apply after restart') : ''}`;
            const refreshed = await load();

            if (refreshed) {
                flash('ok', summary);
            } else {
                setMsg({
                    kind: 'err',
                    text: t(
                        `${summary}；但界面状态刷新失败，请手动刷新页面`,
                        `${summary}. The display could not refresh. Refresh the page.`,
                    ),
                });
            }
        } catch (e) {
            const message = e instanceof Error ? e.message : t('恢复失败', 'Restore failed');
            const refreshed = await load();
            setMsg({
                kind: 'err',
                text: refreshed
                    ? message
                    : t(
                          `${message}；界面状态刷新失败，请手动刷新页面`,
                          `${message} — status refresh failed. Refresh the page.`,
                      ),
            });
            throw e;
        } finally {
            setSaving(false);

            if (fileRef.current) {
                fileRef.current.value = '';
            }
        }
    };

    if (loading || !data) {
        return (
            <SkeletonSwap
                ready={!loading}
                lines={7}
                lineHeight={26}
                reserve={182}
                label={t('系统设置', 'Service settings')}
                className={!loading ? 'skeleton-swap-fluid min-h-[182px]' : ''}
            >
                {!loading && !data ? (
                    <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-3 border-b py-4 text-sm text-destructive"
                    >
                        <span>
                            {msg?.text ?? t('加载系统设置失败', 'Could not load service settings')}
                        </span>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={() => {
                                setLoading(true);
                                void load();
                            }}
                        >
                            {t('重试', 'Retry')}
                        </Button>
                    </div>
                ) : null}
            </SkeletonSwap>
        );
    }

    const effectiveDesktop = data.effective ?? data.settings;
    let desktopError = '';

    try {
        desktopLink(effectiveDesktop.vncPort, effectiveDesktop.vncUrl ?? '', window.location.href);
    } catch (error) {
        desktopError =
            error instanceof Error ? error.message : t('桌面地址无效', 'Invalid desktop URL');
    }

    const EnvBadge = ({ field }: { field: string }) =>
        overridden(field) ? (
            <Badge variant="secondary" className="gap-1 text-micro">
                <Lock className="h-3 w-3" />{' '}
                {t('运行值由环境变量覆盖', 'Environment variable overrides the runtime value')}
            </Badge>
        ) : null;

    return (
        <SkeletonSwap
            ready
            lines={7}
            lineHeight={26}
            reserve={182}
            label={t('系统设置', 'Service settings')}
            className="skeleton-swap-fluid min-h-[182px]"
        >
            <div className="flex min-w-0 flex-col gap-7">
                <p className="text-xs leading-relaxed text-muted-foreground">
                    {t(
                        '监听、桌面入口与 HTTPS 设置保存后需重启 Nowluma。本机不会自动重启。',
                        'Listener, desktop access, and HTTPS changes require a Nowluma restart. The service does not restart automatically.',
                    )}
                </p>

                {msg && (
                    <div
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </div>
                )}

                <Group
                    title={t('服务监听', 'Service listener')}
                    icon={Server}
                    description={
                        <>
                            {t('当前监听端口：', 'Current listening port: ')}
                            <code className="font-mono">{data.listeningPort}</code>
                            {t('。下方编辑保存配置。', '. Edit the saved settings below.')}
                        </>
                    }
                >
                    <SettingRow label={t('端口', 'Port')} hint={<EnvBadge field="webuiPort" />}>
                        <Input
                            id={`${id}-port`}
                            data-tutorial-control="service-port"
                            aria-label={t('端口', 'Port')}
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            inputMode="numeric"
                            disabled={saving}
                            placeholder="5099"
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow
                        label={t('绑定地址', 'Bind address')}
                        hint={<EnvBadge field="webuiHost" />}
                    >
                        <div className="flex min-w-0 flex-col gap-2">
                            <Input
                                id={`${id}-host`}
                                aria-label={t('绑定地址', 'Bind address')}
                                value={host}
                                onChange={(event) => setHost(event.target.value)}
                                placeholder="127.0.0.1"
                                spellCheck={false}
                                disabled={saving}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="glass"
                                    size="sm"
                                    disabled={saving}
                                    onClick={() => setHost('127.0.0.1')}
                                >
                                    {t('仅本机', 'Local only')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="glass"
                                    size="sm"
                                    disabled={saving}
                                    onClick={() => setHost('0.0.0.0')}
                                >
                                    {t('所有网卡', 'All interfaces')}
                                </Button>
                            </div>
                            <p
                                className={cn(
                                    'text-xs leading-relaxed',
                                    host.trim() === '0.0.0.0'
                                        ? 'text-warning'
                                        : 'text-muted-foreground',
                                )}
                            >
                                {host.trim() === '0.0.0.0'
                                    ? t(
                                          '允许局域网访问；建议启用 HTTPS 并使用强访问凭据。',
                                          'Allows LAN access. Use HTTPS and strong access credentials.',
                                      )
                                    : t(
                                          '默认仅本机访问，也可填写明确的绑定地址。',
                                          'The default allows local access only. You can enter a specific bind address.',
                                      )}
                            </p>
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={t('信任代理 (trust-proxy)', 'Trust proxy (trust-proxy)')}
                        hint={<EnvBadge field="trustProxy" />}
                    >
                        <div className="flex min-w-0 flex-col gap-2">
                            <Input
                                id={`${id}-proxy`}
                                aria-label={t(
                                    '信任代理 (trust-proxy)',
                                    'Trust proxy (trust-proxy)',
                                )}
                                value={trustProxy}
                                onChange={(e) => setTrustProxy(e.target.value)}
                                disabled={saving}
                                placeholder={t(
                                    '留空=只信任 socket 对端；1=信任反代头',
                                    'Blank: trust only the socket peer; 1: trust reverse-proxy headers',
                                )}
                            />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {t(
                                    '仅在受信任反向代理之后设置 1 / loopback / IP 列表。',
                                    'Set 1, loopback, or a list of IP addresses only behind a trusted reverse proxy.',
                                )}
                            </p>
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={t(
                            '自动连接已打开的 QQ',
                            'Automatically connect to running QQ sessions',
                        )}
                        hint={
                            <>
                                <EnvBadge field="hookAutoLoad" />{' '}
                                {t(
                                    'QQ 登录仍在客户端完成。',
                                    'You still sign in to QQ in the client.',
                                )}
                            </>
                        }
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={hookAutoLoad}
                            onChange={setHookAutoLoad}
                            ariaLabel={t(
                                '自动连接已打开的 QQ',
                                'Automatically connect to running QQ sessions',
                            )}
                            disabled={saving || overridden('hookAutoLoad')}
                        />
                    </SettingRow>
                </Group>

                <Group
                    title={t('QQ 桌面', 'QQ desktop')}
                    icon={Monitor}
                    description={t(
                        '只设置入口，不改变桌面服务监听端口。',
                        'These settings only change the desktop link, not the desktop server’s listening port.',
                    )}
                >
                    <SettingRow
                        label={t('noVNC 端口', 'noVNC port')}
                        hint={<EnvBadge field="vncPort" />}
                    >
                        <Input
                            id={`${id}-desktop-port`}
                            aria-label={t('noVNC 端口', 'noVNC port')}
                            value={vncPort}
                            onChange={(e) => setVncPort(e.target.value)}
                            inputMode="numeric"
                            placeholder="0"
                            disabled={saving || overridden('vncPort')}
                            className="max-w-xs tabular-nums"
                        />
                    </SettingRow>
                    <SettingRow
                        label={t('桌面地址（可选）', 'Desktop URL (optional)')}
                        hint={<EnvBadge field="vncUrl" />}
                    >
                        <Input
                            id={`${id}-desktop-url`}
                            aria-label={t('桌面地址（可选）', 'Desktop URL (optional)')}
                            value={vncUrl}
                            onChange={(e) => setVncUrl(e.target.value)}
                            placeholder={t(
                                '/desktop/vnc.html 或 https://地址/vnc.html',
                                '/desktop/vnc.html or https://example.com/vnc.html',
                            )}
                            disabled={saving || overridden('vncUrl')}
                        />
                    </SettingRow>
                    <SettingRow
                        label={t('当前桌面', 'Current desktop')}
                        hint={t(
                            '端口为 0 且地址留空时隐藏入口。',
                            'Set the port to 0 and leave the URL blank to hide the link.',
                        )}
                    >
                        <DesktopButton />
                    </SettingRow>
                    {desktopError && (
                        <p role="alert" className="py-3 text-xs text-destructive">
                            {desktopError}
                        </p>
                    )}
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('桌面地址与认证', 'Desktop URL and authentication')}
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            {t(
                                '地址留空时使用当前主机名和发布端口；同源 HTTPS 反向代理请填代理地址。入口不传递控制台令牌或 QQ 密码。Docker 桌面使用当前控制台会话，QQ 扫码与自动登录仍在客户端完成。',
                                'A blank URL uses the current hostname and published port. For a same-origin HTTPS reverse proxy, enter the proxy URL. The link does not pass console tokens or QQ passwords. The Docker desktop uses the current console session, but QR-code sign-in and automatic sign-in still happen in the QQ client.',
                            )}
                        </p>
                    </details>
                </Group>

                <Group
                    title="HTTPS / TLS"
                    icon={ShieldCheck}
                    description={
                        data.hasCert
                            ? t(
                                  '证书与私钥已安装。',
                                  'The certificate and private key are installed.',
                              )
                            : t(
                                  '启用前需安装有效的 PEM 证书与私钥。',
                                  'Install a valid PEM certificate and private key before enabling HTTPS.',
                              )
                    }
                >
                    <SettingRow
                        label={t('启用 HTTPS', 'Enable HTTPS')}
                        hint={<EnvBadge field="tlsEnabled" />}
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={tlsEnabled}
                            onChange={setTlsEnabled}
                            ariaLabel={t('启用 HTTPS', 'Enable HTTPS')}
                            disabled={saving}
                        />
                    </SettingRow>
                    {data.hasCert && !editingCert ? (
                        <SettingRow
                            label={t('已安装证书', 'Installed certificate')}
                            hint={t(
                                '私钥不回显；未编辑时保留原内容。',
                                'The private key is hidden. The installed certificate and key are preserved unless replaced.',
                            )}
                        >
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    variant="glass"
                                    disabled={saving}
                                    onClick={() => setEditingCert(true)}
                                >
                                    <Pencil className="size-4" />{' '}
                                    {t('更改证书', 'Replace certificate')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setConfirmDeleteCert(true)}
                                    disabled={saving}
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="size-4" />{' '}
                                    {t('删除证书', 'Delete certificate')}
                                </Button>
                            </div>
                        </SettingRow>
                    ) : (
                        <div className="flex min-w-0 flex-col gap-3 py-3">
                            <div className="grid min-w-0 gap-3 md:grid-cols-2">
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Label htmlFor={`${id}-cert`}>
                                        {t('证书 (cert.pem)', 'Certificate (cert.pem)')}
                                    </Label>
                                    <Textarea
                                        id={`${id}-cert`}
                                        className="min-h-28 rounded-[4px] font-mono text-xs"
                                        value={certPem}
                                        onChange={(e) => setCertPem(e.target.value)}
                                        placeholder="-----BEGIN CERTIFICATE-----"
                                        disabled={saving}
                                    />
                                </div>
                                <div className="flex min-w-0 flex-col gap-1.5">
                                    <Label htmlFor={`${id}-key`}>
                                        {t('私钥 (key.pem)', 'Private key (key.pem)')}
                                    </Label>
                                    <Textarea
                                        id={`${id}-key`}
                                        className="min-h-28 rounded-[4px] font-mono text-xs"
                                        value={keyPem}
                                        onChange={(e) => setKeyPem(e.target.value)}
                                        placeholder="-----BEGIN PRIVATE KEY-----"
                                        disabled={saving}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="glass" onClick={uploadCert} disabled={saving}>
                                    {saving ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Save className="size-4" />
                                    )}
                                    {t('保存证书', 'Save certificate')}
                                </Button>
                                {data.hasCert && editingCert && (
                                    <Button
                                        variant="glass"
                                        disabled={saving}
                                        onClick={() => {
                                            setEditingCert(false);
                                            setCertPem('');
                                            setKeyPem('');
                                        }}
                                    >
                                        {t('取消', 'Cancel')}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('TLS 校验与私钥存储', 'TLS validation and private key storage')}
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            {t(
                                '私钥仅写入服务器 ',
                                'The private key is stored only on the server at ',
                            )}
                            <code className="font-mono">config/key.pem</code>
                            {t(
                                '（0600 权限）。无效证书会被拒绝。启用 TLS 后若证书无法加载，WebUI 将停止启动，不会降级为 HTTP。',
                                ' (permissions: 0600). Invalid certificates are rejected. If TLS is enabled and the certificate cannot be loaded, the WebUI will not start or fall back to HTTP.',
                            )}
                        </p>
                    </details>
                </Group>

                <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                    <Button variant="glass" onClick={saveSettings} disabled={saving}>
                        {saving ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Save className="size-4" />
                        )}
                        {t('保存服务设置', 'Save service settings')}
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        {t(
                            '监听、桌面入口与 HTTPS · 重启后应用',
                            'Listener, desktop access, and HTTPS · Apply after restart',
                        )}
                    </span>
                </div>

                <Group title={t('服务配置备份', 'Service configuration backup')} icon={Database}>
                    <SettingRow
                        label={t('导出备份', 'Export backup')}
                        hint={t(
                            '外观、服务设置与证书；不含消息数据库。',
                            'Includes appearance, service settings, and certificates, but not message databases.',
                        )}
                    >
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <ToggleSwitch
                                    value={exportCreds}
                                    onChange={setExportCreds}
                                    ariaLabel={t(
                                        '导出包含敏感配置',
                                        'Include sensitive settings in export',
                                    )}
                                    disabled={saving}
                                />
                                <span className="text-xs">
                                    {t('包含敏感配置', 'Include sensitive settings')}
                                </span>
                                <Button
                                    variant="glass"
                                    data-tutorial-control="service-backup"
                                    onClick={exportBackup}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Download className="size-4" />
                                    )}
                                    {t('导出备份', 'Export backup')}
                                </Button>
                            </div>
                            {exportCreds && (
                                <p className="text-xs leading-relaxed text-destructive">
                                    {t(
                                        '包含 WebUI 登录状态、TLS 私钥、通知渠道地址与 OneBot 访问令牌，请妥善保管。',
                                        'Contains WebUI sign-in state, the TLS private key, notification channel addresses, and OneBot access tokens. Store this backup securely.',
                                    )}
                                </p>
                            )}
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={t('恢复备份', 'Restore backup')}
                        hint={t(
                            '选择文件后确认覆盖。恢复完成需重启。',
                            'Choose a file and confirm that it can overwrite your settings. Restart after restoring.',
                        )}
                    >
                        <div className="flex min-w-0 flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-3">
                                <ToggleSwitch
                                    value={restoreCreds}
                                    onChange={setRestoreCreds}
                                    ariaLabel={t(
                                        '恢复包含敏感配置',
                                        'Include sensitive settings in restore',
                                    )}
                                    disabled={saving}
                                />
                                <span className="text-xs">
                                    {t('恢复敏感配置', 'Restore sensitive settings')}
                                </span>
                                <Button
                                    variant="glass"
                                    onClick={() => fileRef.current?.click()}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Upload className="size-4" />
                                    )}
                                    {t('选择备份文件', 'Choose backup file')}
                                </Button>
                            </div>
                            {restoreCreds && (
                                <p className="text-xs leading-relaxed text-destructive">
                                    {t(
                                        '将覆盖 WebUI 登录状态、TLS 私钥、通知渠道地址与 OneBot 访问令牌；不知道备份中的口令可能无法登录。',
                                        'This overwrites WebUI sign-in state, the TLS private key, notification channel addresses, and OneBot access tokens. You may be unable to sign in without the password from the backup.',
                                    )}
                                </p>
                            )}
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];

                                    if (file) {
                                        setPendingBackup(file);
                                    }

                                    e.target.value = '';
                                }}
                            />
                        </div>
                    </SettingRow>
                    <details className="py-3 text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('备份范围与恢复方式', 'What is backed up and how restore works')}
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            {t(
                                '通知渠道与 OneBot 配置仅随敏感配置导出。恢复前先校验，写入出错会回滚；成功后删除临时快照。',
                                'Notification channels and OneBot configuration are exported only when sensitive settings are included. The backup is validated before restoring. Write failures roll back the changes; a successful restore removes the temporary snapshot.',
                            )}
                        </p>
                    </details>
                </Group>

                <DeploymentDiagnostics />

                <ConfirmDialog
                    open={confirmDeleteCert}
                    onOpenChange={setConfirmDeleteCert}
                    title={t('删除 TLS 证书？', 'Delete the TLS certificate?')}
                    description={t(
                        '将移除服务器上的证书与私钥。若 HTTPS 仍处于启用状态，下次启动将无法继续使用当前证书。',
                        'This removes the certificate and private key from the server. If HTTPS is still enabled, the current certificate will no longer be available on the next startup.',
                    )}
                    confirmText={t('删除证书', 'Delete certificate')}
                    destructive
                    onConfirm={deleteCert}
                />

                <ConfirmDialog
                    open={pendingBackup !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setPendingBackup(null);
                        }
                    }}
                    title={t('恢复配置备份？', 'Restore configuration backup?')}
                    description={
                        pendingBackup
                            ? t(
                                  `将从 ${pendingBackup.name} 覆盖当前系统配置${restoreCreds ? '，包括敏感配置、TLS 私钥与 OneBot 配置' : ''}。成功后需要重启 Nowluma。`,
                                  `This will overwrite the current service configuration using ${pendingBackup.name}${restoreCreds ? ', including sensitive settings, the TLS private key, and OneBot configuration' : ''}. Restart Nowluma after a successful restore.`,
                              )
                            : ''
                    }
                    confirmText={t('确认恢复', 'Confirm restore')}
                    destructive
                    onConfirm={async () => {
                        if (!pendingBackup) {
                            return;
                        }

                        await importBackup(pendingBackup);
                        setPendingBackup(null);
                    }}
                />
            </div>
        </SkeletonSwap>
    );
}
