import { useRef, useState } from 'react';
import {
    AlertTriangle,
    Code2,
    Download,
    Loader2,
    Plus,
    RotateCcw,
    Trash2,
    Upload,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Textarea } from '@/components/ui/textarea';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { DEFAULT_LAYOUT, DEFAULT_PAGES } from '@/contexts/LayoutContext';
import { DEFAULT_APPEARANCE, useTheme } from '@/contexts/ThemeContext';
import { useApi } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import { defaultTranslate, useT, type Translate } from '@/i18n';

// ─────────────── 高级（自定义 CSS + 备份/重置） ───────────────

// Ready-made CSS snippets, inserted at the cursor / appended. Plain string
// constants (no editor library) — the operator tweaks them in the textarea and
// native Cmd/Ctrl+Z undoes. Each is a complete, valid rule.
const CSS_SNIPPETS: { zh: string; en: string; css: string }[] = [
    {
        zh: '侧栏字号',
        en: 'Sidebar font size',
        css: '.text-sidebar-foreground {\n  font-size: 1.05em;\n}',
    },
    {
        zh: '卡片毛玻璃',
        en: 'Frosted cards',
        css: '.bg-card {\n  -webkit-backdrop-filter: blur(8px);\n  backdrop-filter: blur(8px);\n  background-color: color-mix(in oklab, var(--card) 80%, transparent);\n}',
    },
    {
        zh: '隐藏滚动条',
        en: 'Hide scrollbars',
        css: '* {\n  scrollbar-width: none;\n}\n*::-webkit-scrollbar {\n  width: 0;\n  height: 0;\n}',
    },
    {
        zh: '加粗标题',
        en: 'Bold headings',
        css: 'h1, h2, h3 {\n  font-weight: 700;\n  letter-spacing: -0.01em;\n}',
    },
    { zh: '紧凑卡片', en: 'Compact cards', css: '.rounded-xl {\n  border-radius: 0.5rem;\n}' },
];

// On-blur sanity check: parse the CSS once and surface a gentle warning if it
// looks broken (unbalanced braces, or non-empty input that parses to zero
// rules). Best-effort — returns null when parsing isn't available or the CSS
// looks fine. Never blocks saving; the operator can always ?safe-mode=1.
function validateCss(css: string, t: Translate = defaultTranslate): string | null {
    const trimmed = css.trim();

    if (!trimmed) {
        return null;
    }

    const opens = (trimmed.match(/\{/g) ?? []).length;
    const closes = (trimmed.match(/\}/g) ?? []).length;

    if (opens !== closes) {
        return t(
            `括号不匹配（${opens} 个 “{” / ${closes} 个 “}”）— 可能有规则未闭合。`,
            `Unbalanced braces (${opens} “{” / ${closes} “}”) — a rule may be unclosed.`,
        );
    }

    if (opens === 0) {
        return t(
            '没有检测到任何 CSS 规则（缺少 “{ … }”）。',
            'No CSS rules found (missing “{ … }”).',
        );
    }

    try {
        if (typeof CSSStyleSheet === 'function' && 'replaceSync' in CSSStyleSheet.prototype) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(trimmed);

            if (sheet.cssRules.length === 0) {
                return t(
                    '未解析出有效规则，请检查语法。',
                    'No valid rules parsed; check the syntax.',
                );
            }
        }
    } catch {
        return t('CSS 解析失败，请检查语法。', 'CSS parsing failed; check the syntax.');
    }

    return null;
}

export function AdvancedPanel() {
    const t = useT();
    const { savedAppearance: appearance, setAppearance, managedBy } = useTheme();
    const { runAction } = useActionFeedback();
    const cssRef = useRef<HTMLTextAreaElement>(null);
    const [cssWarn, setCssWarn] = useState<string | null>(null);
    const api = useApi();
    const fileRef = useRef<HTMLInputElement>(null);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [pendingImport, setPendingImport] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);

    const onExport = async () => {
        setMsg(null);
        setBusy(true);

        try {
            const config = await runAction(
                {
                    title: t('正在导出界面配置', 'Exporting UI configuration'),
                    detail: t('外观、布局与自定义 CSS', 'Appearance, layout and custom CSS'),
                    successTitle: t('界面配置已导出', 'UI configuration exported'),
                    errorTitle: t('界面配置导出失败', 'UI configuration export failed'),
                },
                () => api.ui.get(),
            );
            downloadBlob(
                new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }),
                'nowluma-ui-config.json',
            );
        } catch (error) {
            console.error('export UI config failed', error);
            setMsg({
                kind: 'err',
                text: error instanceof Error ? error.message : t('导出失败', 'Export failed'),
            });
        } finally {
            setBusy(false);
        }
    };

    const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        if (fileRef.current) {
            fileRef.current.value = '';
        }

        if (!file) {
            return;
        }

        if (file.size > 256 * 1024) {
            setMsg({
                kind: 'err',
                text: t(
                    '导入失败：文件过大（上限 256KB）',
                    'Import failed: file too large (256KB limit)',
                ),
            });
            return;
        }

        setPendingImport(file);
    };

    const importUiConfig = async (file: File) => {
        setMsg(null);
        setBusy(true);

        try {
            const parsed = JSON.parse(await file.text()) as unknown;

            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('shape');
            }

            await runAction(
                {
                    title: t('正在导入界面配置', 'Importing UI configuration'),
                    detail: file.name,
                    successTitle: t('界面配置已导入', 'UI configuration imported'),
                    successDetail: t('即将重新载入界面', 'Reloading the UI'),
                    errorTitle: t('界面配置导入失败', 'UI configuration import failed'),
                    surviveReload: true,
                },
                () => api.ui.save(parsed as Parameters<typeof api.ui.save>[0]),
            );
            // The server normalized it; reload so appearance + layout both re-read.
            window.location.reload();
        } catch (error) {
            setBusy(false);
            setMsg({
                kind: 'err',
                text:
                    error instanceof SyntaxError ||
                    (error instanceof Error && error.message === 'shape')
                        ? t(
                              '导入失败：不是有效的配置 JSON',
                              'Import failed: not a valid configuration JSON',
                          )
                        : t(
                              `导入失败：${error instanceof Error ? error.message : '未知错误'}`,
                              `Import failed: ${error instanceof Error ? error.message : 'unknown error'}`,
                          ),
            });
            throw error;
        }
    };

    const doReset = async () => {
        setBusy(true);

        try {
            await runAction(
                {
                    title: t('正在重置界面配置', 'Resetting UI configuration'),
                    detail: t(
                        '恢复外观、布局、导航与自定义 CSS',
                        'Restore appearance, layout, navigation and custom CSS',
                    ),
                    successTitle: t('界面配置已重置', 'UI configuration reset'),
                    successDetail: t('即将重新载入界面', 'Reloading the UI'),
                    errorTitle: t('界面配置重置失败', 'UI configuration reset failed'),
                    surviveReload: true,
                },
                () =>
                    api.ui.save({
                        appearance: DEFAULT_APPEARANCE,
                        layout: DEFAULT_LAYOUT,
                        pages: DEFAULT_PAGES,
                    }),
            );
            window.location.reload();
        } catch (error) {
            setBusy(false);
            setMsg({
                kind: 'err',
                text: error instanceof Error ? error.message : t('重置失败', 'Reset failed'),
            });
            throw error;
        }
    };

    // Insert a template at the cursor (or append), then re-validate.
    const insertSnippet = (snippet: string) => {
        const ta = cssRef.current;
        const cur = appearance.customCss;
        let next: string;

        if (ta && ta.selectionStart != null) {
            const before = cur.slice(0, ta.selectionStart);
            const after = cur.slice(ta.selectionEnd ?? ta.selectionStart);
            const sep = before && !before.endsWith('\n') ? '\n' : '';
            next = `${before}${sep}${snippet}\n${after}`;
        } else {
            next = cur ? `${cur}\n${snippet}\n` : `${snippet}\n`;
        }

        setAppearance({ customCss: next.slice(0, 50000) });
        setCssWarn(validateCss(next, t));
    };

    return (
        <div className="flex min-w-0 flex-col gap-7">
            {managedBy && (
                <p className="text-sm text-muted-foreground">
                    {t(
                        `自定义 CSS 已保留，跟随${managedBy}外观期间暂停应用。`,
                        `Custom CSS is kept but paused while following the ${managedBy} appearance.`,
                    )}
                </p>
            )}
            <fieldset
                disabled={!!managedBy || busy}
                className="contents"
                aria-label={t('自定义 CSS', 'Custom CSS')}
            >
                <Group
                    title={t('自定义 CSS', 'Custom CSS')}
                    icon={Code2}
                    description={t(
                        '登录后应用，不影响登录页。',
                        'Applied after sign-in; the login page is unaffected.',
                    )}
                >
                    <div className="flex min-w-0 flex-col gap-3 py-3">
                        <details>
                            <summary className="min-h-11 cursor-pointer py-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {t('插入样式片段', 'Insert style snippet')}
                            </summary>
                            <div className="flex flex-wrap items-center gap-1.5 pb-2">
                                {CSS_SNIPPETS.map((s) => (
                                    <Button
                                        key={s.zh}
                                        type="button"
                                        variant="glass"
                                        size="sm"
                                        onClick={() => insertSnippet(s.css)}
                                    >
                                        <Plus className="size-3" /> {t(s.zh, s.en)}
                                    </Button>
                                ))}
                            </div>
                        </details>
                        <Textarea
                            ref={cssRef}
                            aria-label={t('自定义 CSS', 'Custom CSS')}
                            value={appearance.customCss}
                            onChange={(e) => {
                                setAppearance({ customCss: e.target.value });

                                if (cssWarn) {
                                    setCssWarn(null);
                                }
                            }}
                            onBlur={(e) => setCssWarn(validateCss(e.target.value, t))}
                            maxLength={50000}
                            spellCheck={false}
                            placeholder={t(
                                '/* 例如：放大侧栏字号 */\n.text-sidebar-foreground { font-size: 1.05em; }',
                                '/* For example: enlarge sidebar text */\n.text-sidebar-foreground { font-size: 1.05em; }',
                            )}
                            className="h-64 resize-y rounded-[4px] bg-transparent p-3 font-mono text-base leading-relaxed md:text-[12px]"
                        />
                        {cssWarn && (
                            <p
                                role="alert"
                                className="flex items-start gap-1.5 text-xs text-warning"
                            >
                                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {cssWarn}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-meta text-muted-foreground">
                                {t(
                                    `${appearance.customCss.length} / 50000 字符`,
                                    `${appearance.customCss.length} / 50000 characters`,
                                )}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setAppearance({ customCss: '' });
                                    setCssWarn(null);
                                }}
                                disabled={!appearance.customCss}
                                className="text-destructive hover:text-destructive"
                            >
                                <Trash2 className="size-4" /> {t('清空', 'Clear')}
                            </Button>
                        </div>
                        <details className="text-xs text-muted-foreground">
                            <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {t('临时停用自定义样式', 'Temporarily disable custom styles')}
                            </summary>
                            <p className="max-w-prose leading-relaxed">
                                {t('在地址后加 ', 'Add ')}
                                <code className="font-mono">?safe-mode=1</code>
                                {t(
                                    ' 可临时禁用自定义 CSS；保存的内容不会被删除。',
                                    ' to the address to disable custom CSS temporarily; saved content is kept.',
                                )}
                            </p>
                        </details>
                    </div>
                </Group>
            </fieldset>
            <Group title={t('界面配置', 'UI configuration')} icon={Download}>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={onImportFile}
                    className="hidden"
                />
                <SettingRow
                    label={t('导出与导入', 'Export and import')}
                    hint={t(
                        '外观、布局与自定义 CSS；背景图片需重新上传。',
                        'Appearance, layout and custom CSS; background images must be uploaded again.',
                    )}
                >
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="glass" size="sm" onClick={onExport} disabled={busy}>
                            <Download className="size-4" /> {t('导出', 'Export')}
                        </Button>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={() => fileRef.current?.click()}
                            disabled={busy}
                        >
                            {busy ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Upload className="size-4" />
                            )}
                            {t('导入', 'Import')}
                        </Button>
                    </div>
                </SettingRow>
                <SettingRow
                    label={t('恢复默认', 'Restore defaults')}
                    hint={t(
                        '重置外观、布局、导航与自定义 CSS。',
                        'Reset appearance, layout, navigation and custom CSS.',
                    )}
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmReset(true)}
                        disabled={busy}
                        className="text-destructive hover:text-destructive"
                    >
                        <RotateCcw className="size-4" /> {t('重置全部', 'Reset all')}
                    </Button>
                </SettingRow>
                {msg && (
                    <p
                        role={msg.kind === 'ok' ? 'status' : 'alert'}
                        className={cn(
                            'py-3 text-xs',
                            msg.kind === 'ok' ? 'text-success' : 'text-destructive',
                        )}
                    >
                        {msg.text}
                    </p>
                )}
            </Group>

            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                title={t('重置全部界面配置', 'Reset all UI configuration')}
                description={t(
                    '将外观、仪表盘布局、导航与自定义 CSS 全部恢复为默认。此操作不可撤销。',
                    'Restore appearance, dashboard layout, navigation and custom CSS to their defaults. This cannot be undone.',
                )}
                confirmText={t('重置', 'Reset')}
                cancelText={t('取消', 'Cancel')}
                destructive
                onConfirm={doReset}
            />

            <ConfirmDialog
                open={pendingImport !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingImport(null);
                    }
                }}
                title={t('导入并覆盖界面配置？', 'Import and overwrite UI configuration?')}
                description={
                    pendingImport
                        ? t(
                              `将使用 ${pendingImport.name} 覆盖当前外观、布局、导航与自定义 CSS，随后重新载入界面。`,
                              `Use ${pendingImport.name} to overwrite the current appearance, layout, navigation and custom CSS, then reload the UI.`,
                          )
                        : ''
                }
                confirmText={t('确认导入', 'Import')}
                cancelText={t('取消', 'Cancel')}
                destructive
                onConfirm={async () => {
                    if (!pendingImport) {
                        return;
                    }

                    await importUiConfig(pendingImport);
                    setPendingImport(null);
                }}
            />
        </div>
    );
}
