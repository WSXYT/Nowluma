import { useId } from 'react';
import { Bell, BookOpen, ExternalLink, Github, Globe, Link2, Server, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAppState } from '@/contexts/AppStateContext';
import {
    ALL_LOG_LEVELS,
    LINK_ICON_IDS,
    NOTE_MAX,
    parseAlertsConfig,
    parseAccountConfig,
    parseConnectionsConfig,
    parseHostConfig,
    parseLinkConfig,
    parseNoteConfig,
    parseSessionsConfig,
} from '@/lib/dashboard-layout';
import { useT } from '@/i18n';

/** Curated link-card icons, shared by the picker form and the widget renderer. */
export const LINK_ICON_COMPONENTS: Record<string, typeof Link2> = {
    link: Link2,
    external: ExternalLink,
    github: Github,
    book: BookOpen,
    server: Server,
    globe: Globe,
    star: Star,
    bell: Bell,
};

// Per-widget config forms, shown inside a dialog opened from a dashboard
// widget's edit-overlay gear. `config` is the widget's opaque block.config;
// `onChange` merges a partial back via setBlockConfig.

type SortOpt = 'recent' | 'uin' | 'nickname';
const SORT_LABELS: Record<SortOpt, [string, string]> = {
    recent: ['最近', 'Most recent'],
    uin: ['QQ 号', 'QQ number'],
    nickname: ['昵称', 'Nickname'],
};

interface FormProps {
    config: Record<string, unknown> | undefined;
    onChange: (c: Record<string, unknown>) => void;
}

export function AlertsConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseAlertsConfig(config);
    return (
        <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t('显示条数', 'Entries to show')}</span>
                <Input
                    type="number"
                    min={1}
                    max={50}
                    value={c.count}
                    onChange={(e) =>
                        onChange({
                            count: Math.min(
                                50,
                                Math.max(1, Math.trunc(Number(e.target.value) || 1)),
                            ),
                        })
                    }
                    className="h-8 w-24"
                />
            </label>
            <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">
                    {t('显示级别', 'Visible levels')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {ALL_LOG_LEVELS.map((lv) => {
                        const on = c.levels.includes(lv);
                        return (
                            <button
                                key={lv}
                                type="button"
                                onClick={() => {
                                    const next = on
                                        ? c.levels.filter((x) => x !== lv)
                                        : [...c.levels, lv];

                                    if (next.length > 0) {
                                        onChange({ levels: next });
                                    }
                                }}
                                className={cn(
                                    'rounded-md border px-2.5 py-1 text-xs uppercase transition-colors cursor-pointer',
                                    on
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:bg-accent/40',
                                )}
                            >
                                {lv}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export function SessionsConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseSessionsConfig(config);
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{t('排序', 'Sort by')}</span>
                <div className="flex flex-wrap gap-1.5">
                    {(['recent', 'uin', 'nickname'] as SortOpt[]).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => onChange({ sort: s })}
                            className={cn(
                                'rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                                c.sort === s
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-accent/40',
                            )}
                        >
                            {t(...SORT_LABELS[s])}
                        </button>
                    ))}
                </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                    {t('筛选（昵称 / QQ 号）', 'Filter by nickname or QQ number')}
                </span>
                <Input
                    value={c.filter}
                    placeholder={t('留空显示全部', 'Leave blank to show all')}
                    maxLength={100}
                    onChange={(e) => onChange({ filter: e.target.value })}
                    className="h-8"
                />
            </label>
        </div>
    );
}

const HOST_PANELS = [
    { key: 'cpu', label: ['CPU 使用率', 'CPU usage'] },
    { key: 'memory', label: ['内存使用', 'Memory usage'] },
    { key: 'runtime', label: ['运行进程', 'Runtime process'] },
] as const;

export function HostConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseHostConfig(config);
    return (
        <div className="flex flex-col gap-3">
            <span className="text-sm text-muted-foreground">
                {t('显示的指标', 'Metrics to show')}
            </span>
            {HOST_PANELS.map(({ key, label: [zh, en] }) => (
                <label key={key} className="flex items-center justify-between gap-3 text-sm">
                    <span>{t(zh, en)}</span>
                    <ToggleSwitch
                        value={c[key]}
                        ariaLabel={t(zh, en)}
                        onChange={(v) => {
                            // Keep at least one panel on (an all-off card is empty).
                            const next = { ...c, [key]: v };

                            if (next.cpu || next.memory || next.runtime) {
                                onChange({ [key]: v });
                            }
                        }}
                    />
                </label>
            ))}
        </div>
    );
}

const CONN_SORTS = [
    { key: 'default', label: ['默认', 'Default'] },
    { key: 'name', label: ['名称', 'Name'] },
    { key: 'status', label: ['异常优先', 'Issues first'] },
] as const;

export function ConnectionsConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseConnectionsConfig(config);
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{t('排序', 'Sort by')}</span>
                <div className="flex flex-wrap gap-1.5">
                    {CONN_SORTS.map(({ key, label: [zh, en] }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onChange({ sort: key })}
                            className={cn(
                                'rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer',
                                c.sort === key
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border text-muted-foreground hover:bg-accent/40',
                            )}
                        >
                            {t(zh, en)}
                        </button>
                    ))}
                </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                    {t('仅显示异常端点', 'Show only endpoints with issues')}
                </span>
                <ToggleSwitch
                    value={c.onlyIssues}
                    ariaLabel={t('仅显示异常端点', 'Show only endpoints with issues')}
                    onChange={(v) => onChange({ onlyIssues: v })}
                />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                    {t('筛选（账号昵称 / QQ 号）', 'Filter by account nickname or QQ number')}
                </span>
                <Input
                    value={c.filter}
                    placeholder={t('留空显示全部', 'Leave blank to show all')}
                    maxLength={100}
                    onChange={(e) => onChange({ filter: e.target.value })}
                    className="h-8"
                />
            </label>
        </div>
    );
}

export function NoteConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseNoteConfig(config);
    const textId = useId();
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={textId} className="text-sm text-muted-foreground">
                {t('便签内容（纯文本，保留换行）', 'Note text (plain text, with line breaks)')}
            </label>
            <Textarea
                id={textId}
                value={c.text}
                onChange={(e) => onChange({ text: e.target.value.slice(0, NOTE_MAX) })}
                maxLength={NOTE_MAX}
                spellCheck={false}
                placeholder={t('写点备注、待办或快捷信息…', 'Write a note, to-do, or reminder…')}
                className="h-40 resize-y rounded-lg bg-card/40 p-3 text-sm leading-relaxed"
            />
            <span className="text-right text-meta text-muted-foreground">
                {c.text.length} / {NOTE_MAX}
            </span>
        </div>
    );
}

export function LinkConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const iconLabels = {
        link: t('link', 'Link'),
        external: t('external', 'External link'),
        github: t('github', 'GitHub'),
        book: t('book', 'Book'),
        server: t('server', 'Server'),
        globe: t('globe', 'Globe'),
        star: t('star', 'Star'),
        bell: t('bell', 'Bell'),
    };
    const c = parseLinkConfig(config);
    const urlInvalid = c_urlRaw(config) !== '' && !c.url;
    return (
        <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('标题', 'Title')}</span>
                <Input
                    value={c.label}
                    placeholder={t('例如：项目文档', 'Example: Project documentation')}
                    maxLength={60}
                    onChange={(e) => onChange({ label: e.target.value })}
                    className="h-8"
                />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                    {t('链接（http/https）', 'Link (HTTP/HTTPS)')}
                </span>
                <Input
                    value={c_urlRaw(config)}
                    placeholder="https://example.com"
                    maxLength={2048}
                    onChange={(e) => onChange({ url: e.target.value })}
                    className={cn('h-8', urlInvalid && 'border-destructive')}
                />
                {urlInvalid && (
                    <span className="text-xs text-destructive">
                        {t(
                            '仅支持 http:// 或 https:// 链接',
                            'Only http:// or https:// links are supported',
                        )}
                    </span>
                )}
            </label>
            <div className="flex flex-col gap-1.5">
                <span className="text-sm text-muted-foreground">{t('图标', 'Icon')}</span>
                <div className="flex flex-wrap gap-1.5">
                    {LINK_ICON_IDS.map((ic) => {
                        const Icon = LINK_ICON_COMPONENTS[ic];
                        const on = c.icon === ic;
                        return (
                            <button
                                key={ic}
                                type="button"
                                onClick={() => onChange({ icon: ic })}
                                aria-label={iconLabels[ic]}
                                className={cn(
                                    'inline-flex size-8 items-center justify-center rounded-md border transition-colors cursor-pointer',
                                    on
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border text-muted-foreground hover:bg-accent/40',
                                )}
                            >
                                <Icon className="size-4" />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// The raw (unvalidated) url so the field stays editable while typing an
// incomplete URL; parseLinkConfig only blesses it once it's http(s).
function c_urlRaw(config: Record<string, unknown> | undefined): string {
    const v = config?.url;
    return typeof v === 'string' ? v.slice(0, 2048) : '';
}

export function AccountConfigForm({ config, onChange }: FormProps) {
    const t = useT();
    const c = parseAccountConfig(config);
    const { qqList } = useAppState();
    const listId = useId();
    const inputId = `${listId}-uin`;
    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm text-muted-foreground">
                {t('QQ 号', 'QQ number')}
            </label>
            <Input
                id={inputId}
                value={c.uin}
                list={listId}
                inputMode="numeric"
                placeholder={t('指定一个账号的 QQ 号', 'Enter an account’s QQ number')}
                maxLength={15}
                onChange={(e) => onChange({ uin: e.target.value.replace(/\D/g, '').slice(0, 15) })}
                className="h-8"
            />
            <datalist id={listId}>
                {qqList.map((q) => (
                    <option key={q.uin} value={q.uin}>
                        {q.nickname || q.uin}
                    </option>
                ))}
            </datalist>
            <span className="text-xs text-muted-foreground">
                {t(
                    '可从已接入账号中选择，或手动输入。',
                    'Choose a connected account or enter its number.',
                )}
            </span>
        </div>
    );
}
