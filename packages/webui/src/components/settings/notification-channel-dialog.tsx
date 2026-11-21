// Modal editor for a notification channel — used for both create and edit,
// mirroring NodeEditDialog. Holds a local draft until 保存 (cancel discards).
// The channel id is the stable key per-account opt-ins reference, so it's
// editable only on create and locked on edit.
import { useId, useState } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import {
    DEFAULT_WEBHOOK_BODY,
    DEFAULT_EMAIL_BODY,
    DEFAULT_EMAIL_SUBJECT,
} from '@nowluma/common/notification-templates';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/interior/modal';
import { Button } from '@/components/ui/button';
import { Segmented, SettingRow } from '@/components/settings/settings-controls';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordVisibilityIcon } from '@/components/ui/password-visibility-icon';
import { Textarea } from '@/components/ui/textarea';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
    notificationChannelType,
    type NotificationChannel,
    type NotificationChannelType,
} from '@/types';

interface HeaderRow {
    name: string;
    value: string;
}

function headersToRows(headers?: Record<string, string>): HeaderRow[] {
    const rows = Object.entries(headers ?? {}).map(([name, value]) => ({ name, value }));
    return rows.length > 0 ? rows : [{ name: '', value: '' }];
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> | undefined {
    const out: Record<string, string> = {};

    for (const row of rows) {
        const name = row.name.trim();
        const value = row.value.trim();

        if (!name || !value) {
            continue;
        }

        out[name] = value;
    }

    return Object.keys(out).length > 0 ? out : undefined;
}

const CHANNEL_ID_RE = /^[\w.-]+$/;

function isHttpUrl(u: string): boolean {
    try {
        const x = new URL(u.trim());
        return x.protocol === 'http:' || x.protocol === 'https:';
    } catch {
        return false;
    }
}

function looksLikeEmail(value: string): boolean {
    return /^[^\s<>@]+@[^\s<>@]+$/.test(value.trim()) || /<[^<>@\s]+@[^<>@\s]+>/.test(value);
}

function hasRecipient(value: string): boolean {
    return value.split(/[,;\n]+/).some((part) => looksLikeEmail(part));
}

export function applyType(
    draft: NotificationChannel,
    type: NotificationChannelType,
): NotificationChannel {
    if (type === notificationChannelType(draft)) {
        return { ...draft, type };
    }

    if (type === 'email') {
        const keepBody = draft.bodyTemplate && draft.bodyTemplate !== DEFAULT_WEBHOOK_BODY;
        return {
            ...draft,
            type,
            url: '',
            headers: undefined,
            smtpHost: draft.smtpHost ?? '',
            smtpPort: draft.smtpPort ?? 465,
            smtpSecure: draft.smtpSecure ?? true,
            smtpUser: draft.smtpUser ?? '',
            smtpPass: draft.smtpPass ?? '',
            from: draft.from ?? '',
            to: draft.to ?? '',
            subjectTemplate: draft.subjectTemplate || DEFAULT_EMAIL_SUBJECT,
            bodyTemplate: keepBody ? draft.bodyTemplate : DEFAULT_EMAIL_BODY,
        };
    }

    const keepBody = draft.bodyTemplate && draft.bodyTemplate !== DEFAULT_EMAIL_BODY;
    return {
        id: draft.id,
        name: draft.name,
        type: 'webhook',
        url: draft.url,
        bodyTemplate: keepBody ? draft.bodyTemplate : DEFAULT_WEBHOOK_BODY,
        enabled: draft.enabled,
    };
}

export function toChannel(
    draft: NotificationChannel,
    headerRows: HeaderRow[],
): NotificationChannel {
    const id = draft.id.trim();
    const name = draft.name.trim();
    const enabled = draft.enabled;

    if (notificationChannelType(draft) === 'email') {
        return {
            id,
            name,
            type: 'email',
            url: '',
            bodyTemplate: draft.bodyTemplate,
            enabled,
            smtpHost: draft.smtpHost?.trim() ?? '',
            smtpPort: draft.smtpPort ?? 465,
            smtpSecure: draft.smtpSecure ?? true,
            smtpUser: draft.smtpUser?.trim() || undefined,
            smtpPass: draft.smtpPass || undefined,
            from: draft.from?.trim() ?? '',
            to: draft.to?.trim() ?? '',
            subjectTemplate: draft.subjectTemplate?.trim() || DEFAULT_EMAIL_SUBJECT,
        };
    }

    return {
        id,
        name,
        type: 'webhook',
        url: draft.url.trim(),
        bodyTemplate: draft.bodyTemplate,
        enabled,
        headers: rowsToHeaders(headerRows),
    };
}

interface NotificationChannelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isEdit: boolean;
    /** Seed draft — a blank channel for create, the existing one for edit. */
    initial: NotificationChannel;
    /** Ids of every other channel, for the duplicate check. */
    otherIds: string[];
    onSubmit: (channel: NotificationChannel) => void;
}

export function NotificationChannelDialog(props: NotificationChannelDialogProps) {
    const t = useT();
    const { open, onOpenChange, isEdit, initial, otherIds, onSubmit } = props;
    const controlId = useId();
    // Parent unmounts on close, so each open re-seeds via lazy init.
    const [draft, setDraft] = useState<NotificationChannel>(() => ({
        ...initial,
        type: notificationChannelType(initial),
    }));
    const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => headersToRows(initial.headers));
    const [showPass, setShowPass] = useState(false);
    const reduce = useReducedMotionConfig() ?? false;
    const patch = (p: Partial<NotificationChannel>) => setDraft({ ...draft, ...p });

    const patchHeader = (index: number, p: Partial<HeaderRow>) => {
        setHeaderRows(headerRows.map((row, i) => (i === index ? { ...row, ...p } : row)));
    };

    const type = notificationChannelType(draft);
    const id = draft.id.trim();
    const idBlank = id.length === 0;
    const idBad = !idBlank && (!CHANNEL_ID_RE.test(id) || id.length > 64);
    const idDup = !idBlank && otherIds.includes(id);
    const urlBlank = draft.url.trim().length === 0;
    const urlBad = !urlBlank && !isHttpUrl(draft.url);
    const hostBlank = !(draft.smtpHost ?? '').trim();
    const fromBlank = !(draft.from ?? '').trim();
    const fromBad = !fromBlank && !looksLikeEmail(draft.from ?? '');
    const toBlank = !(draft.to ?? '').trim();
    const toBad = !toBlank && !hasRecipient(draft.to ?? '');
    const port = draft.smtpPort ?? 465;
    const portBad = !Number.isInteger(port) || port < 1 || port > 65535;
    const canSave =
        type === 'email'
            ? !idBlank &&
              !idBad &&
              !idDup &&
              !hostBlank &&
              !fromBlank &&
              !fromBad &&
              !toBlank &&
              !toBad &&
              !portBad
            : !idBlank && !idBad && !idDup && !urlBlank && !urlBad;

    const idError = idBlank
        ? t('请填写渠道 ID', 'Enter a channel ID')
        : idBad
          ? t(
                '只能用字母 / 数字 / . _ - ，≤64 字符',
                'Only letters, numbers, . _ - (≤64 characters)',
            )
          : idDup
            ? t('ID 与其它渠道重复', 'ID is already used by another channel')
            : undefined;
    const urlError = urlBlank
        ? t('请填写 Webhook URL', 'Enter a webhook URL')
        : urlBad
          ? t('必须是 http(s) 地址', 'Must be an http(s) URL')
          : undefined;
    const hostError = hostBlank ? t('请填写 SMTP 主机', 'Enter an SMTP host') : undefined;
    const fromError = fromBlank
        ? t('请填写发件人', 'Enter a sender')
        : fromBad
          ? t('必须是邮箱地址', 'Must be an email address')
          : undefined;
    const toError = toBlank
        ? t('请填写收件人', 'Enter a recipient')
        : toBad
          ? t('至少填写一个邮箱', 'Enter at least one email address')
          : undefined;
    const portError = portBad ? t('端口 1–65535', 'Port 1–65535') : undefined;

    return (
        <Modal
            open={open}
            onClose={() => onOpenChange(false)}
            title={isEdit ? t('编辑渠道', 'Edit channel') : t('新建渠道', 'New channel')}
            closeLabel={t('关闭渠道编辑弹窗', 'Close channel editor')}
            maxWidth={576}
            maxHeight="min(86dvh, 780px)"
            className="cp-dialog"
            footer={
                <>
                    <Button type="button" variant="glass" onClick={() => onOpenChange(false)}>
                        {t('取消', 'Cancel')}
                    </Button>
                    <Button
                        type="submit"
                        form={`${controlId}-form`}
                        variant="glass"
                        disabled={!canSave}
                    >
                        {isEdit ? t('保存修改', 'Save changes') : t('创建渠道', 'Create channel')}
                    </Button>
                </>
            }
        >
            <form
                id={`${controlId}-form`}
                className="flex min-w-0 flex-col gap-3"
                onSubmit={(event) => {
                    event.preventDefault();

                    if (!canSave) {
                        return;
                    }

                    onSubmit(toChannel(draft, headerRows));
                    onOpenChange(false);
                }}
            >
                <SettingRow label={t('渠道类型', 'Channel type')}>
                    <Segmented<NotificationChannelType>
                        value={type}
                        options={[
                            { value: 'webhook', label: 'Webhook' },
                            { value: 'email', label: t('邮件', 'Email') },
                        ]}
                        onChange={(value) => setDraft(applyType(draft, value))}
                    />
                </SettingRow>

                <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                        label={t('渠道 ID', 'Channel ID')}
                        placeholder="dingtalk"
                        value={draft.id}
                        disabled={isEdit}
                        hint={
                            isEdit
                                ? t('创建后不可更改', 'Cannot be changed after creation')
                                : t(
                                      '账号据此勾选；字母/数字/. _ -',
                                      'Accounts select channels by this; letters/numbers/. _ -',
                                  )
                        }
                        error={idError}
                        onChange={(v) => patch({ id: v })}
                    />
                    <Field
                        label={t('显示名', 'Display name')}
                        placeholder={
                            type === 'email'
                                ? t('运维邮箱', 'Ops email')
                                : t('钉钉群机器人', 'DingTalk bot')
                        }
                        value={draft.name}
                        onChange={(v) => patch({ name: v })}
                    />
                </div>

                {type === 'webhook' ? (
                    <>
                        <Field
                            label="Webhook URL"
                            type="url"
                            placeholder="https://oapi.dingtalk.com/robot/send?access_token=…"
                            value={draft.url}
                            error={urlError}
                            onChange={(v) => patch({ url: v })}
                        />

                        <details className="text-xs">
                            <summary className="min-h-11 cursor-pointer py-3 font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {t('请求头（可选）', 'Request headers (optional)')}
                            </summary>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setHeaderRows([...headerRows, { name: '', value: '' }])
                                    }
                                >
                                    <Plus className="size-3.5" />
                                    {t('添加请求头', 'Add header')}
                                </Button>
                            </div>
                            <div className="flex flex-col gap-2">
                                {headerRows.map((row, i) => (
                                    <div
                                        key={i}
                                        className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px]"
                                    >
                                        <Input
                                            value={row.name}
                                            aria-label={t(
                                                `请求头 ${i + 1} 名称`,
                                                `Request header ${i + 1} name`,
                                            )}
                                            placeholder="Authorization"
                                            spellCheck={false}
                                            onChange={(e) =>
                                                patchHeader(i, { name: e.target.value })
                                            }
                                            className="font-mono text-xs"
                                        />
                                        <Input
                                            value={row.value}
                                            aria-label={t(
                                                `请求头 ${i + 1} 值`,
                                                `Request header ${i + 1} value`,
                                            )}
                                            placeholder="Bearer …"
                                            spellCheck={false}
                                            onChange={(e) =>
                                                patchHeader(i, { value: e.target.value })
                                            }
                                            className="col-start-1 font-mono text-xs sm:col-start-2 sm:row-start-1"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t(
                                                `删除请求头 ${i + 1}`,
                                                `Remove request header ${i + 1}`,
                                            )}
                                            onClick={() => {
                                                const next = headerRows.filter(
                                                    (_, idx) => idx !== i,
                                                );
                                                setHeaderRows(
                                                    next.length > 0
                                                        ? next
                                                        : [{ name: '', value: '' }],
                                                );
                                            }}
                                            className="col-start-2 row-start-1 row-span-2 shrink-0 self-start text-muted-foreground hover:text-foreground sm:col-start-3 sm:row-span-1"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">
                                {t(
                                    '可选，默认 Content-Type 为 application/json。',
                                    'Optional; Content-Type defaults to application/json.',
                                )}
                            </p>
                        </details>
                    </>
                ) : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                            <Field
                                label={t('SMTP 主机', 'SMTP host')}
                                placeholder="smtp.qq.com"
                                value={draft.smtpHost ?? ''}
                                error={hostError}
                                onChange={(v) => patch({ smtpHost: v })}
                            />
                            <Field
                                label={t('端口', 'Port')}
                                type="number"
                                placeholder="465"
                                value={String(draft.smtpPort ?? 465)}
                                error={portError}
                                onChange={(v) => {
                                    const n = Math.trunc(Number(v));

                                    if (!Number.isFinite(n)) {
                                        patch({ smtpPort: 465 });
                                        return;
                                    }

                                    patch({
                                        smtpPort: n,
                                        smtpSecure:
                                            n === 465 ? true : n === 587 ? false : draft.smtpSecure,
                                    });
                                }}
                            />
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field
                                label={t('SMTP 用户名', 'SMTP username')}
                                placeholder="bot@qq.com"
                                value={draft.smtpUser ?? ''}
                                hint={t(
                                    '部分内网中继可不填',
                                    'May be blank for some internal relays',
                                )}
                                onChange={(v) => patch({ smtpUser: v })}
                            />
                            <div className="flex flex-col gap-1.5">
                                <Label htmlFor={`${controlId}-smtp-password`}>
                                    {t('SMTP 密码', 'SMTP password')}
                                </Label>
                                <div className="relative">
                                    <Input
                                        id={`${controlId}-smtp-password`}
                                        type={showPass ? 'text' : 'password'}
                                        value={draft.smtpPass ?? ''}
                                        autoComplete="new-password"
                                        spellCheck={false}
                                        placeholder={t('授权码 / 密码', 'App code / password')}
                                        onChange={(e) => patch({ smtpPass: e.target.value })}
                                        className="pr-12 font-mono text-xs"
                                    />
                                    <Button
                                        type="button"
                                        variant="glass"
                                        size="icon-sm"
                                        onClick={() => setShowPass((v) => !v)}
                                        className="absolute right-0 top-1/2 size-11 -translate-y-1/2"
                                        aria-label={
                                            showPass
                                                ? t('隐藏密码', 'Hide password')
                                                : t('显示密码', 'Show password')
                                        }
                                        aria-pressed={showPass}
                                    >
                                        <PasswordVisibilityIcon
                                            visible={showPass}
                                            reduceMotion={reduce}
                                        />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <SettingRow
                            label={t('隐式 TLS', 'Implicit TLS')}
                            hint={t(
                                '465 开启，587 关闭（STARTTLS）。',
                                'On for 465, off for 587 (STARTTLS).',
                            )}
                            layout="inline"
                        >
                            <ToggleSwitch
                                value={draft.smtpSecure ?? true}
                                onChange={(v) => patch({ smtpSecure: v })}
                                ariaLabel={t('隐式 TLS', 'Implicit TLS')}
                            />
                        </SettingRow>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field
                                label={t('发件人', 'Sender')}
                                placeholder="Nowluma <bot@qq.com>"
                                value={draft.from ?? ''}
                                error={fromError}
                                onChange={(v) => patch({ from: v })}
                            />
                            <Field
                                label={t('收件人', 'Recipients')}
                                placeholder="ops@example.com, a@b.com"
                                value={draft.to ?? ''}
                                error={toError}
                                hint={t(
                                    '多个地址用逗号或分号分隔',
                                    'Separate multiple addresses with commas or semicolons',
                                )}
                                onChange={(v) => patch({ to: v })}
                            />
                        </div>

                        <Field
                            label={t('主题模板', 'Subject template')}
                            placeholder={DEFAULT_EMAIL_SUBJECT}
                            value={draft.subjectTemplate ?? DEFAULT_EMAIL_SUBJECT}
                            onChange={(v) => patch({ subjectTemplate: v })}
                        />
                    </>
                )}

                <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${controlId}-body`}>
                        {type === 'email'
                            ? t('正文模板', 'Body template')
                            : t('Body 模板', 'Body template')}
                    </Label>
                    <Textarea
                        id={`${controlId}-body`}
                        value={draft.bodyTemplate}
                        rows={type === 'email' ? 6 : 3}
                        spellCheck={false}
                        onChange={(e) => patch({ bodyTemplate: e.target.value })}
                        className="font-mono text-xs leading-relaxed"
                    />
                    <details className="text-xs text-muted-foreground">
                        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {t('模板变量', 'Template variables')}
                        </summary>
                        <p className="max-w-prose leading-relaxed">
                            {t('变量：', 'Variables: ')}
                            <code className="font-mono">{'{uin}'}</code>{' '}
                            <code className="font-mono">{'{nickname}'}</code>{' '}
                            <code className="font-mono">{'{event}'}</code>
                            {t('（offline/online）', ' (offline/online)')}{' '}
                            <code className="font-mono">{'{time}'}</code>{' '}
                            <code className="font-mono">{'{status}'}</code>
                            {t('（Hook 状态）', ' (hook status)')}{' '}
                            <code className="font-mono">{'{pid}'}</code>
                            {t('（进程 ID）', ' (process ID)')}{' '}
                            <code className="font-mono">{'{error}'}</code>
                            {t('（进程错误）', ' (process error)')}
                            {t('。进程信息为空表示未知。', '. Empty process info means unknown.')}
                            {type === 'email'
                                ? t(
                                      '正文以 < 开头时按 HTML 发送。',
                                      ' A body starting with < is sent as HTML.',
                                  )
                                : ''}
                        </p>
                    </details>
                </div>

                <SettingRow
                    label={t('启用', 'Enabled')}
                    hint={t(
                        '关闭后停止推送，保留配置。',
                        'Stops delivery while off; settings are kept.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={draft.enabled}
                        onChange={(v) => patch({ enabled: v })}
                        ariaLabel={t('启用渠道', 'Enable channel')}
                    />
                </SettingRow>
            </form>
        </Modal>
    );
}

interface FieldProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: 'text' | 'url' | 'number';
    error?: string;
    hint?: string;
    disabled?: boolean;
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    error,
    hint,
    disabled,
}: FieldProps) {
    const id = useId();
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                aria-invalid={!!error}
                aria-describedby={error || hint ? `${id}-help` : undefined}
                type={type}
                value={value}
                disabled={disabled}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className={cn(
                    error && 'border-destructive focus-visible:ring-destructive/40',
                    disabled && 'opacity-60',
                )}
            />
            {error ? (
                <p id={`${id}-help`} role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            ) : hint ? (
                <p id={`${id}-help`} className="text-xs text-muted-foreground">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
