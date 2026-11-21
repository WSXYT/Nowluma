// Modal editor used for both "create" and "edit". Holds a local draft
// copy of the adapter until the user clicks save (so cancel really does
// throw away changes). Validation is minimal — blank-name and dup-name
// disable the save button; everything else is best-effort coercion.
//
// The local draft lives in a stable, unboxed document form. Only the modal
// actions are short operations; save settlement still controls dismissal.

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useT, type Translate } from '@/i18n';
import {
    ArrowLeftRight,
    ArrowUpRight,
    Check,
    Copy,
    Eye,
    EyeOff,
    Loader2,
    Radio,
    RefreshCw,
    Server,
    type LucideIcon,
} from 'lucide-react';
import { Modal } from '@/components/interior/modal';
import { Button } from '@/components/ui/button';
import { DropdownSelect, type DropdownOption } from '@/components/ui/dropdown-select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { cn, copyText } from '@/lib/utils';
import { accessTokenFeedback, type AccessTokenFeedback } from '@/lib/access-token-feedback';
import { allowEmptyInboundAccessToken } from '@/lib/transport-security';
import type {
    HttpClientNetwork,
    HttpServerNetwork,
    MessageFormat,
    NetworkKind,
    OneBotNetworks,
    WsClientNetwork,
    WsRole,
    WsServerNetwork,
} from '@/types';
import { generateAccessToken, NETWORK_TABS } from './defaults';

type AnyAdapter<K extends NetworkKind> = OneBotNetworks[K][number];

const KIND_ICON: Record<NetworkKind, LucideIcon> = {
    httpServers: Server,
    httpClients: ArrowUpRight,
    wsServers: Radio,
    wsClients: ArrowLeftRight,
};

interface NodeEditDialogProps<K extends NetworkKind> {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    kind: K;
    /** Initial draft state — caller seeds it with `defaultEntry` for create
     *  or the existing item for edit. */
    initial: AnyAdapter<K>;
    /** True when editing an existing adapter (drives title + button copy). */
    isEdit: boolean;
    /** Names of every other adapter in the same list, for duplicate check. */
    otherNames: string[];
    /** Account context used when evaluating user-chosen access tokens. */
    uin: string;
    onSubmit: (item: AnyAdapter<K>) => Promise<void>;
}

export function NodeEditDialog<K extends NetworkKind>(props: NodeEditDialogProps<K>) {
    const t = useT();
    const { open, onOpenChange, kind, initial, isEdit, otherNames, uin, onSubmit } = props;
    const tab = NETWORK_TABS[kind];
    const Icon: LucideIcon = KIND_ICON[kind];

    // Local draft. The parent unmounts this component on close so each
    // open gets a fresh `initial` via useState's lazy init — no effect-based
    // resync needed, which keeps the lifecycle linear.
    const [draft, setDraft] = useState<AnyAdapter<K>>(initial);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState('');

    const trimmedName = draft.name?.trim() ?? '';
    const blankName = trimmedName.length === 0;
    const duplicateName = !blankName && otherNames.includes(trimmedName);

    const isInboundServer = kind === 'httpServers' || kind === 'wsServers';
    const tokenChanged = (draft.accessToken ?? '') !== (initial.accessToken ?? '');
    const enforceTokenPolicy = isInboundServer && (!isEdit || tokenChanged);
    const inbound = isInboundServer ? (draft as HttpServerNetwork | WsServerNetwork) : null;
    const allowEmptyToken =
        typeof window !== 'undefined' &&
        allowEmptyInboundAccessToken(window.location.hostname, inbound?.host);
    const tokenFeedback = useMemo(
        () =>
            enforceTokenPolicy
                ? accessTokenFeedback(
                      draft.accessToken ?? '',
                      [uin, draft.name ?? '', kind, inbound?.host ?? '', inbound?.port ?? 0],
                      allowEmptyToken,
                      t,
                  )
                : undefined,
        [
            allowEmptyToken,
            draft.accessToken,
            draft.name,
            enforceTokenPolicy,
            inbound?.host,
            inbound?.port,
            kind,
            uin,
            t,
        ],
    );

    const canSave = !blankName && !duplicateName && (tokenFeedback?.valid ?? true);

    const patch = (changes: Partial<AnyAdapter<K>>) =>
        setDraft({ ...draft, ...changes } as AnyAdapter<K>);

    const isWs = kind === 'wsServers' || kind === 'wsClients';
    const isHttpServer = kind === 'httpServers';
    const role = ((draft as WsServerNetwork | WsClientNetwork).role ?? 'Universal') as WsRole;

    return (
        <Modal
            open={open}
            onClose={() => !busy && onOpenChange(false)}
            closeOnBackdrop={!busy}
            closeOnEscape={!busy}
            className="cp-dialog"
            title={
                <span className="inline-flex items-center gap-2">
                    <span className="grid size-8 place-items-center text-muted-foreground">
                        <Icon className="size-4" />
                    </span>
                    {isEdit
                        ? t(`编辑 ${tab.noun(t)}`, `Edit ${tab.noun(t)}`)
                        : t(`新建 ${tab.noun(t)}`, `Add ${tab.noun(t)}`)}
                </span>
            }
            description={tab.description(t)}
            closeLabel={t('关闭节点编辑弹窗', 'Close connection editor')}
            maxWidth={576}
            maxHeight="calc(100dvh - 2rem)"
            footer={
                <>
                    <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                        {t('取消', 'Cancel')}
                    </Button>
                    <Button
                        variant="glass"
                        disabled={!canSave || busy}
                        onClick={async () => {
                            setBusy(true);
                            setSaveError('');

                            try {
                                const cleaned = { ...draft, name: trimmedName } as AnyAdapter<K>;
                                await onSubmit(cleaned);
                                onOpenChange(false);
                            } catch (error) {
                                setSaveError(
                                    error instanceof Error
                                        ? error.message
                                        : t('保存连接失败', 'Could not save connection'),
                                );
                            } finally {
                                setBusy(false);
                            }
                        }}
                    >
                        {busy && <Loader2 className="size-4 animate-spin" />}
                        {busy
                            ? t('保存中…', 'Saving…')
                            : isEdit
                              ? t('保存连接', 'Save connection')
                              : t('添加连接', 'Add connection')}
                    </Button>
                </>
            }
        >
            {saveError && (
                <p
                    role="alert"
                    className="mb-4 break-words border-l-2 border-destructive pl-3 text-sm text-destructive"
                >
                    {saveError}
                </p>
            )}
            <fieldset disabled={busy} className="flex min-w-0 flex-col gap-5">
                <div className="flex min-w-0 items-center justify-between gap-4 border-b border-border py-3">
                    <div className="min-w-0">
                        <Label className="text-sm font-medium text-foreground">
                            {t('启用', 'Enabled')}
                        </Label>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            {t(
                                '关闭后保存即可保留配置但不启动该节点',
                                'Save with this off to keep the settings without starting the connection.',
                            )}
                        </p>
                    </div>
                    <ToggleSwitch
                        value={draft.enabled !== false}
                        onChange={(v) =>
                            patch({ enabled: v ? undefined : false } as Partial<AnyAdapter<K>>)
                        }
                        ariaLabel={t('启用', 'Enabled')}
                    />
                </div>

                <Section caption={t('连接', 'Connection')}>
                    <div className="flex min-w-0 flex-col gap-3">
                        <Field
                            label={t('名称', 'Name')}
                            placeholder={t('自定义', 'Custom')}
                            value={draft.name}
                            onChange={(v) => patch({ name: v } as Partial<AnyAdapter<K>>)}
                            error={
                                blankName
                                    ? t('请填写名称', 'Enter a name')
                                    : duplicateName
                                      ? t('名称与其它节点重复', 'Another connection has this name')
                                      : undefined
                            }
                        />
                        <KindFields kind={kind} draft={draft} patch={patch} />
                    </div>
                </Section>

                <Section caption={t('鉴权', 'Authentication')}>
                    <div className="min-w-0">
                        <TokenField
                            label={t('授权 Token', 'Access token')}
                            placeholder={
                                isInboundServer
                                    ? t(
                                          '留空则关闭鉴权（监听本机或从本机打开页面时可保存）',
                                          'Leave blank to disable authentication (allowed for a local listener or when viewing locally)',
                                      )
                                    : t(
                                          '按对端要求填写',
                                          'Enter the token required by the remote endpoint',
                                      )
                            }
                            value={draft.accessToken}
                            onChange={(v) =>
                                patch({ accessToken: v || undefined } as Partial<AnyAdapter<K>>)
                            }
                            onGenerate={() =>
                                patch({ accessToken: generateAccessToken() } as Partial<
                                    AnyAdapter<K>
                                >)
                            }
                            feedback={tokenFeedback}
                        />
                    </div>
                </Section>

                <Section caption={t('行为', 'Behavior')}>
                    <div className="divide-y divide-border/60">
                        {isHttpServer && (
                            <SettingRow
                                label={t('启用 WebSocket', 'Enable WebSocket')}
                                desc={t(
                                    '复用当前 HTTP 端口和授权 Token 接收 WebSocket 连接',
                                    'Accept WebSocket connections on the same HTTP port with the same access token.',
                                )}
                            >
                                <ToggleSwitch
                                    value={(draft as HttpServerNetwork).enableWebSocket === true}
                                    onChange={(v) =>
                                        patch({ enableWebSocket: v } as unknown as Partial<
                                            AnyAdapter<K>
                                        >)
                                    }
                                    ariaLabel={t('启用 WebSocket', 'Enable WebSocket')}
                                />
                            </SettingRow>
                        )}

                        {isHttpServer && (
                            <SettingRow
                                label={t('启用 SSE', 'Enable SSE')}
                                desc={t(
                                    '通过当前 HTTP 路径下的 /_events 持续推送事件，支持短暂断线重放',
                                    'Stream events at /_events under the current HTTP path and replay events after brief disconnects.',
                                )}
                            >
                                <ToggleSwitch
                                    value={(draft as HttpServerNetwork).enableSse === true}
                                    onChange={(v) => patch({ ...draft, enableSse: v })}
                                    ariaLabel={t('启用 SSE', 'Enable SSE')}
                                />
                            </SettingRow>
                        )}

                        <SettingRow
                            label={t('消息格式', 'Message format')}
                            desc={t(
                                '数组为标准 OneBot 段，CQ 码为兼容字符串',
                                'Arrays use standard OneBot segments. CQ codes use the legacy string format.',
                            )}
                        >
                            <DropdownSelect
                                className="w-32"
                                ariaLabel={t('消息格式', 'Message format')}
                                value={(draft.messageFormat ?? 'array') as MessageFormat}
                                options={[
                                    { value: 'array', label: t('数组', 'Array') },
                                    { value: 'string', label: t('CQ 码', 'CQ codes') },
                                ]}
                                onChange={(v) =>
                                    patch({ messageFormat: v } as Partial<AnyAdapter<K>>)
                                }
                            />
                        </SettingRow>

                        {isWs && (
                            <SettingRow
                                label={t('角色', 'Role')}
                                desc={t(
                                    'Universal 收发合一，Event / Api 分离',
                                    'Universal handles both events and API calls. Event and Api separate them.',
                                )}
                            >
                                <DropdownSelect
                                    className="w-32"
                                    ariaLabel={t('角色', 'Role')}
                                    value={role}
                                    options={WS_ROLE_OPTIONS}
                                    onChange={(v) =>
                                        patch({ role: v } as unknown as Partial<AnyAdapter<K>>)
                                    }
                                />
                            </SettingRow>
                        )}

                        <SettingRow
                            label={t('上报自身消息', 'Report own messages')}
                            desc={t(
                                '将机器人自己发送的消息也作为 message_sent 事件上报',
                                'Report messages the bot sends as message_sent events.',
                            )}
                        >
                            <ToggleSwitch
                                value={!!draft.reportSelfMessage}
                                onChange={(v) =>
                                    patch({ reportSelfMessage: v } as Partial<AnyAdapter<K>>)
                                }
                                ariaLabel={t('上报自身消息', 'Report own messages')}
                            />
                        </SettingRow>
                    </div>
                </Section>
            </fieldset>
        </Modal>
    );
}

// ─────────────── document form scaffolding ───────────────

/** A document section, without nested inset cards or reading-surface motion. */
function Section({ caption, children }: { caption: string; children: ReactNode }) {
    return (
        <section className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-semibold">{caption}</h3>
            <div className="min-w-0">{children}</div>
        </section>
    );
}

/** Settings row — label (+ optional subtitle) on the left, control on the right. */
function SettingRow({
    label,
    desc,
    children,
}: {
    label: string;
    desc?: string;
    children: ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 py-3">
            <div className="min-w-0">
                <Label className="text-[13px] text-foreground">{label}</Label>
                {desc && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                )}
            </div>
            <div className="shrink-0">{children}</div>
        </div>
    );
}

// ─────────────── kind-specific field strips ───────────────

interface KindFieldsProps<K extends NetworkKind> {
    kind: K;
    draft: AnyAdapter<K>;
    patch: (changes: Partial<AnyAdapter<K>>) => void;
}

function KindFields<K extends NetworkKind>({ kind, draft, patch }: KindFieldsProps<K>) {
    const t = useT();

    // Per-branch narrowing — TS can't follow the generic relationship so
    // each arm casts once. Field components receive specific shapes. The WS
    // `role` lives in the behaviour section, so it is intentionally absent here.
    if (kind === 'httpServers') {
        const it = draft as HttpServerNetwork;
        const set = patch as (c: Partial<HttpServerNetwork>) => void;
        return (
            <div className="flex flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
                    <Field
                        label={t('主机', 'Host')}
                        placeholder="127.0.0.1"
                        value={it.host}
                        onChange={(v) => set({ host: v || undefined })}
                    />
                    <Field
                        label={t('端口', 'Port')}
                        type="number"
                        value={it.port}
                        onChange={(v) => set({ port: Number(v) || 0 })}
                    />
                    <Field
                        label={t('路径', 'Path')}
                        placeholder="/"
                        value={it.path}
                        onChange={(v) => set({ path: v || undefined })}
                    />
                </div>
                {/* The cap only exists for the embedded WebSocket listener. */}
                {it.enableWebSocket === true ? maxPayloadField(it.maxPayloadBytes, set, t) : null}
            </div>
        );
    }

    if (kind === 'httpClients') {
        const it = draft as HttpClientNetwork;
        const set = patch as (c: Partial<HttpClientNetwork>) => void;
        return (
            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field
                    label={t('目标 URL', 'Destination URL')}
                    type="url"
                    placeholder="http://..."
                    value={it.url}
                    onChange={(v) => set({ url: v })}
                />
                <Field
                    label={t('超时 (ms)', 'Timeout (ms)')}
                    type="number"
                    placeholder="5000"
                    value={it.timeoutMs}
                    onChange={(v) => set({ timeoutMs: Number(v) || undefined })}
                />
            </div>
        );
    }

    if (kind === 'wsServers') {
        const it = draft as WsServerNetwork;
        const set = patch as (c: Partial<WsServerNetwork>) => void;
        return (
            <div className="flex flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px]">
                    <Field
                        label={t('主机', 'Host')}
                        placeholder="127.0.0.1"
                        value={it.host}
                        onChange={(v) => set({ host: v || undefined })}
                    />
                    <Field
                        label={t('端口', 'Port')}
                        type="number"
                        value={it.port}
                        onChange={(v) => set({ port: Number(v) || 0 })}
                    />
                    <Field
                        label={t('路径', 'Path')}
                        placeholder="/"
                        value={it.path}
                        onChange={(v) => set({ path: v || undefined })}
                    />
                </div>
                {maxPayloadField(it.maxPayloadBytes, set, t)}
            </div>
        );
    }

    if (kind === 'wsClients') {
        const it = draft as WsClientNetwork;
        const set = patch as (c: Partial<WsClientNetwork>) => void;
        return (
            <div className="flex flex-col gap-2">
                <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px]">
                    <Field
                        label={t('目标 URL', 'Destination URL')}
                        type="url"
                        placeholder="ws://..."
                        value={it.url}
                        onChange={(v) => set({ url: v })}
                    />
                    <Field
                        label={t('重连间隔 (ms)', 'Reconnect interval (ms)')}
                        type="number"
                        value={it.reconnectIntervalMs}
                        onChange={(v) => set({ reconnectIntervalMs: Number(v) || undefined })}
                    />
                </div>
                {maxPayloadField(it.maxPayloadBytes, set, t)}
            </div>
        );
    }

    return null;
}

/**
 * Inbound WebSocket frame cap. Shared by every editor that owns a WebSocket
 * transport (wsServers, wsClients, httpServers with the embedded listener): the
 * value is empty by default (transport default of 100 MiB), and the hint spells
 * out why inline PCM audio hits it at ~7:26.
 */
function maxPayloadField(
    value: number | undefined,
    set: (patch: { maxPayloadBytes?: number }) => void,
    t: Translate,
) {
    return (
        <div className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
                <Field
                    label={t('单帧上限 (bytes)', 'Frame limit (bytes)')}
                    type="number"
                    min={1024}
                    max={2147483648}
                    step={1024}
                    placeholder="104857600"
                    value={value}
                    onChange={(v) => set({ maxPayloadBytes: Number(v) || undefined })}
                />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
                {t(
                    '入站 WebSocket 单帧上限，留空即默认 100 MiB（104857600），有效范围 1024 – 2147483648。44.1 kHz 立体声 PCM 语音约 445 秒（7:26）就会触顶并断开连接；超长音频应由上游改发 URL/文件或压缩为 SILK，调大上限会按帧大小增加内存占用。',
                    'Maximum inbound WebSocket frame size. Leave blank for 100 MiB (104857600 bytes). Valid range: 1024–2147483648 bytes. At the default limit, about 445 seconds (7:26) of 44.1 kHz stereo PCM audio fills a frame and disconnects the socket. For longer audio, send a URL or file reference, or compress it as SILK. Larger limits allow higher memory usage.',
                )}
            </p>
        </div>
    );
}

// ─────────────── shared form bits ───────────────

interface FieldProps {
    label: string;
    value: string | number | undefined;
    onChange: (v: string) => void;
    placeholder?: string;
    type?: 'text' | 'number' | 'url';
    min?: number;
    max?: number;
    step?: number;
    error?: string;
}

function Field({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    min,
    max,
    step,
    error,
}: FieldProps) {
    const id = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Input
                id={id}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                type={type}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                min={min}
                max={max}
                step={step}
                className={cn(error && 'border-destructive focus-visible:ring-destructive/40')}
            />
            {error && (
                <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    );
}

interface TokenFieldProps {
    label: string;
    value: string | undefined;
    onChange: (v: string) => void;
    onGenerate: () => void;
    placeholder?: string;
    feedback?: AccessTokenFeedback;
}

/**
 * Password-style input for the access token. Hidden by default to keep
 * the value out of over-the-shoulder reads / screenshots; an eye toggle
 * unmasks it and a copy button shoves the current value to the system
 * clipboard with a short confirmation flash.
 */
function TokenField({
    label,
    value,
    onChange,
    onGenerate,
    placeholder,
    feedback,
}: TokenFieldProps) {
    const t = useT();
    const [visible, setVisible] = useState(false);
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<number | null>(null);
    const id = useId();
    const feedbackId = `${id}-feedback`;

    const handleCopy = async () => {
        if (!value) {
            return;
        }

        if (!(await copyText(value))) {
            return;
        }

        setCopied(true);

        if (copiedTimerRef.current != null) {
            window.clearTimeout(copiedTimerRef.current);
        }

        copiedTimerRef.current = window.setTimeout(() => {
            setCopied(false);
            copiedTimerRef.current = null;
        }, 1400);
    };

    return (
        <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex min-w-0 flex-wrap gap-1.5">
                <Input
                    id={id}
                    // Switch input type rather than masking the string so paste /
                    // selection / autofill all behave like a native password field.
                    type={visible ? 'text' : 'password'}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={feedback?.tone === 'error' || undefined}
                    aria-describedby={feedback ? feedbackId : undefined}
                    className="min-w-0 flex-1 basis-40 font-mono"
                />
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onGenerate}
                    aria-label={t('生成新的随机令牌', 'Generate random token')}
                    title={t('生成新的随机令牌', 'Generate random token')}
                >
                    <RefreshCw className="size-4" />
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    disabled={!value}
                    aria-label={copied ? t('已复制', 'Copied') : t('复制', 'Copy token')}
                    title={copied ? t('已复制', 'Copied') : t('复制', 'Copy token')}
                >
                    {copied ? (
                        <Check className="size-4 text-success" />
                    ) : (
                        <Copy className="size-4" />
                    )}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? t('隐藏', 'Hide token') : t('显示', 'Show token')}
                    title={visible ? t('隐藏', 'Hide token') : t('显示', 'Show token')}
                >
                    {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
            </div>
            {feedback && (
                <p
                    id={feedbackId}
                    aria-live="polite"
                    className={cn(
                        'text-xs',
                        feedback.tone === 'error'
                            ? 'text-destructive'
                            : feedback.tone === 'warning'
                              ? 'text-warning'
                              : 'text-success',
                    )}
                >
                    {feedback.message}
                </p>
            )}
        </div>
    );
}

const WS_ROLE_OPTIONS: ReadonlyArray<DropdownOption<WsRole>> = [
    { value: 'Universal', label: 'Universal' },
    { value: 'Event', label: 'Event' },
    { value: 'Api', label: 'Api' },
];
