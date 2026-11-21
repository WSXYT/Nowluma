import { useId, useState } from 'react';
import {
    Accessibility,
    Check,
    Monitor,
    Layers,
    Moon,
    Palette,
    PanelTop,
    RotateCcw,
    Sun,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { localizeTopbarItem, TOPBAR_CATALOGUE } from '@/components/layout/top-bar';
import { BackgroundCard } from '@/components/settings/background-card';
import { DisplayEffectsControls } from '@/components/display-effects';
import {
    Group,
    Segmented,
    SettingRow,
    SliderSettingRow,
    type Opt,
} from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { reconcileLayoutItems, useLayout } from '@/contexts/LayoutContext';
import {
    ACCENTS,
    DEFAULT_APPEARANCE,
    FONT_CUSTOM_ID,
    FONT_MONO_OPTIONS,
    FONT_SANS_OPTIONS,
    PALETTE_OPTIONS,
    paletteResolved,
    RADIUS_OPTIONS,
    UI_SCALE,
    useTheme,
    type AccentScope,
    type DarkIntensity,
    type Density,
    type FontSpec,
    type SidebarStyle,
    type ThemeMode,
} from '@/contexts/ThemeContext';
import { useT } from '@/i18n';
import { useDesktopSidebar } from '@/hooks/use-media-query';
import { cn, toColorInputValue } from '@/lib/utils';

// ── a11y: one-time low-contrast advisory for a custom accent ──
// Pure-advisory per the plan: never blocks, never a persistent banner, and
// fires at most once per session (sessionStorage) so it can't nag.
const CONTRAST_WARNED_KEY = 'nowluma_contrast_warned';

function hexRgb(hex: string): { r: number; g: number; b: number } | null {
    const m = hex.trim().replace('#', '');
    const h =
        m.length === 3
            ? m
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : m;

    if (h.length < 6) {
        return null;
    }

    const r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
    return Number.isNaN(r + g + b) ? null : { r, g, b };
}

function relLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const f = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two hex colours (1…21), or null if unparseable. */
function contrastRatio(a: string, b: string): number | null {
    const ra = hexRgb(a),
        rb = hexRgb(b);

    if (!ra || !rb) {
        return null;
    }

    const la = relLuminance(ra),
        lb = relLuminance(rb);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

// Optional tools in the top bar and more-actions menu retain their saved visibility.
function TopbarPanel() {
    const t = useT();
    const { topbarItems, setTopbarItems } = useLayout();
    const reconciled = reconcileLayoutItems(
        topbarItems,
        TOPBAR_CATALOGUE.map((t) => t.id),
    );
    const shown = new Map(reconciled.map((i) => [i.id, i.visible]));
    const toggle = (id: string) =>
        setTopbarItems(reconciled.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));
    return (
        <Group
            title={t('顶栏工具', 'Top bar tools')}
            icon={PanelTop}
            description={t(
                '工作区管理与更多操作入口始终保留。',
                'Workspace management and More actions are always available.',
            )}
        >
            {TOPBAR_CATALOGUE.map((item) => {
                const { id, label } = localizeTopbarItem(item, t);
                return (
                    <SettingRow key={id} label={label} layout="inline">
                        <ToggleSwitch
                            value={shown.get(id) ?? true}
                            onChange={() => toggle(id)}
                            ariaLabel={label}
                        />
                    </SettingRow>
                );
            })}
        </Group>
    );
}

export function AppearancePanel() {
    const t = useT();
    const modes: Opt<ThemeMode>[] = [
        { value: 'light', label: t('浅色', 'Light'), icon: Sun },
        { value: 'dark', label: t('深色', 'Dark'), icon: Moon },
        { value: 'system', label: t('跟随系统', 'System'), icon: Monitor },
    ];
    const darkIntensities: Opt<DarkIntensity>[] = [
        { value: 'soft', label: t('柔和', 'Soft') },
        { value: 'black', label: t('纯黑 (OLED)', 'Pure black (OLED)') },
    ];
    const accentScopes: Opt<AccentScope>[] = [
        { value: 'global', label: t('全局', 'Global') },
        { value: 'sidebar', label: t('仅导航', 'Navigation only') },
    ];
    const sidebarStyles: Opt<SidebarStyle>[] = [
        { value: 'follow', label: t('跟随背景', 'Match background') },
        { value: 'panel', label: t('浅色面板', 'Light panel') },
        { value: 'accent', label: t('强调色', 'Accent color') },
    ];
    const densities: Opt<Density>[] = [
        { value: 'cozy', label: t('舒适', 'Comfortable') },
        { value: 'compact', label: t('紧凑', 'Compact') },
    ];

    const isDesktop = useDesktopSidebar();
    const {
        savedAppearance: appearance,
        setAppearance,
        uploadBackground,
        removeBackground,
        resolved,
        managedBy,
    } = useTheme();
    const a = appearance;
    // A Catppuccin flavor fixes its own light/dark + darkness, so the mode and
    // intensity controls are inert while one is active.
    const paletteFixed = paletteResolved(a.palette) !== null;

    // Low-contrast accent advisory (applies the change immediately, then — once
    // per session — offers to revert if the accent reads poorly on the canvas).
    const [contrastWarn, setContrastWarn] = useState<{ ratio: number } | null>(null);

    const pickCustomAccent = (hex: string) => {
        setAppearance({ accentMode: 'custom', accentCustom: hex });
        let warned = false;

        try {
            warned = sessionStorage.getItem(CONTRAST_WARNED_KEY) === '1';
        } catch {
            /* ignore */
        }

        if (warned) {
            return;
        }

        // Accent doubles as link/icon colour on the page background — flag UI-level
        // contrast below WCAG AA for large text / non-text (3:1).
        const bg = resolved === 'dark' ? '#0a0a0a' : '#ffffff';
        const ratio = contrastRatio(hex, bg);

        if (ratio !== null && ratio < 3) {
            try {
                sessionStorage.setItem(CONTRAST_WARNED_KEY, '1');
            } catch {
                /* ignore */
            }

            setContrastWarn({ ratio });
        }
    };

    return (
        <div className="flex min-w-0 flex-col gap-7">
            {managedBy && (
                <p className="text-sm leading-relaxed text-muted-foreground" role="status">
                    {t(
                        `外观由${managedBy}管理；个人配色、字体与背景已保留。动效、材质、缩放和无障碍仍可调整。`,
                        `${managedBy} manages the appearance. Your palette, fonts, and background are preserved. You can still adjust motion, materials, scaling, and accessibility.`,
                    )}
                </p>
            )}
            <fieldset
                disabled={!!managedBy}
                className="contents"
                aria-label={t('主题、配色与背景', 'Theme, colors, and background')}
            >
                <Group
                    title={t('主题', 'Theme')}
                    icon={Sun}
                    description={
                        managedBy
                            ? t(
                                  '以下为已保留的个人设置。',
                                  'These are your saved personal settings.',
                              )
                            : t(
                                  '改动立即应用并同步到服务器。',
                                  'Changes apply immediately and sync to the server.',
                              )
                    }
                >
                    <SettingRow
                        label={t('配色方案', 'Color palette')}
                        hint={t(
                            '默认配色跟随显示模式；Catppuccin 自带明暗。',
                            'The default palette follows the display mode. Catppuccin palettes set their own mode.',
                        )}
                        layout="stack"
                    >
                        <div
                            className="flex flex-wrap gap-2"
                            role="radiogroup"
                            aria-label={t('配色方案', 'Color palette')}
                        >
                            {PALETTE_OPTIONS.map((p) => {
                                const active = a.palette === p.id;
                                const label = p.labelEn ? t(p.label, p.labelEn) : p.label;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={label}
                                        onClick={() => setAppearance({ palette: p.id })}
                                        className={cn(
                                            'inline-flex min-h-11 items-center gap-2 rounded-[4px] border px-3 text-xs font-medium transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active
                                                ? 'border-foreground'
                                                : 'border-border hover:bg-muted/40',
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="flex overflow-hidden rounded-[2px] border border-border/60"
                                        >
                                            <span
                                                className="size-3.5"
                                                style={{ backgroundColor: p.preview.bg }}
                                            />
                                            <span
                                                className="size-3.5"
                                                style={{ backgroundColor: p.preview.surface }}
                                            />
                                            {p.preview.dots.map((color, i) => (
                                                <span
                                                    key={i}
                                                    className="size-3.5"
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </span>
                                        <span>{label}</span>
                                        <span aria-hidden="true" className="size-3.5">
                                            {active && <Check className="size-3.5" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={t('显示模式', 'Display mode')}
                        hint={
                            managedBy
                                ? t('明暗模式跟随宿主。', 'Light or dark mode follows the host.')
                                : paletteFixed
                                  ? t(
                                        '当前由 Catppuccin 配色决定明暗。',
                                        'The selected Catppuccin palette controls light or dark mode.',
                                    )
                                  : undefined
                        }
                    >
                        <Segmented
                            value={a.mode}
                            options={modes}
                            onChange={(mode) => setAppearance({ mode })}
                            disabled={paletteFixed}
                        />
                    </SettingRow>
                    <SettingRow
                        label={t('深色强度', 'Dark mode intensity')}
                        hint={
                            managedBy
                                ? t(
                                      '深色材质由宿主外观决定。',
                                      'The host controls dark mode materials.',
                                  )
                                : paletteFixed
                                  ? t(
                                        'Catppuccin 配色自带明暗，无需调节。',
                                        'The selected Catppuccin palette sets its own intensity.',
                                    )
                                  : t(
                                        '纯黑用于 OLED，仅在深色模式下可见。',
                                        'Pure black is designed for OLED and only appears in dark mode.',
                                    )
                        }
                    >
                        <Segmented
                            value={a.darkIntensity}
                            options={darkIntensities}
                            onChange={(darkIntensity) => setAppearance({ darkIntensity })}
                            disabled={paletteFixed}
                        />
                    </SettingRow>
                </Group>

                <Group
                    title={t('强调色', 'Accent color')}
                    icon={Palette}
                    description={t(
                        '按钮、链接与高亮的颜色。',
                        'Color for buttons, links, and highlights.',
                    )}
                >
                    <SettingRow label={t('预设色', 'Color presets')} layout="stack">
                        <div className="flex flex-wrap items-center gap-2">
                            {ACCENTS.map((spec) => {
                                const active =
                                    a.accentMode === 'preset' && a.accentPreset === spec.id;
                                const label = t(spec.label, spec.labelEn);
                                return (
                                    <button
                                        key={spec.id}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() =>
                                            setAppearance({
                                                accentMode: 'preset',
                                                accentPreset: spec.id,
                                            })
                                        }
                                        title={label}
                                        aria-label={label}
                                        className={cn(
                                            'inline-flex min-h-11 items-center gap-2 rounded-[4px] border px-3 text-xs transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            active
                                                ? 'border-foreground'
                                                : 'border-border hover:bg-muted/40',
                                        )}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-4 rounded-[2px] border border-border/60"
                                            style={{ backgroundColor: spec.swatch }}
                                        />
                                        <span>{label}</span>
                                        <span aria-hidden="true" className="size-3.5">
                                            {active && <Check className="size-3.5" />}
                                        </span>
                                    </button>
                                );
                            })}
                            <label
                                title={t('自定义颜色', 'Custom color')}
                                className={cn(
                                    'relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[4px] border px-3 text-xs focus-within:ring-2 focus-within:ring-ring',
                                    a.accentMode === 'custom'
                                        ? 'border-foreground'
                                        : 'border-border',
                                )}
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(a.accentCustom)}
                                    onChange={(e) => pickCustomAccent(e.target.value)}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={t('自定义强调色', 'Custom accent color')}
                                />
                                <span
                                    aria-hidden="true"
                                    className="size-4 rounded-[2px] border border-border/60"
                                    style={{ backgroundColor: a.accentCustom }}
                                />
                                <span>{t('自定义', 'Custom')}</span>
                                <span aria-hidden="true" className="size-3.5">
                                    {a.accentMode === 'custom' && <Check className="size-3.5" />}
                                </span>
                            </label>
                        </div>
                    </SettingRow>
                    <SettingRow
                        label={t('应用范围', 'Accent scope')}
                        hint={t(
                            '“仅导航”时，主区域保持默认色。',
                            'Navigation only keeps the main area in the default color.',
                        )}
                    >
                        <Segmented
                            value={a.accentScope}
                            options={accentScopes}
                            onChange={(accentScope) => setAppearance({ accentScope })}
                        />
                    </SettingRow>
                    <SettingRow label={t('导航样式', 'Navigation style')}>
                        <Segmented
                            value={a.sidebarStyle}
                            options={sidebarStyles}
                            onChange={(sidebarStyle) => setAppearance({ sidebarStyle })}
                        />
                    </SettingRow>
                </Group>

                <BackgroundCard
                    appearance={a}
                    setAppearance={setAppearance}
                    uploadBackground={uploadBackground}
                    removeBackground={removeBackground}
                />
            </fieldset>
            <Group title={t('排版与界面', 'Typography and interface')} icon={Palette}>
                <fieldset
                    disabled={!!managedBy}
                    className="contents"
                    aria-label={t('字体与圆角', 'Fonts and corner radius')}
                >
                    <SettingRow label={t('界面字体', 'Interface font')} layout="stack">
                        <FontField
                            label={t('界面字体', 'interface font')}
                            value={a.fontSans}
                            custom={a.fontSansCustom}
                            presets={FONT_SANS_OPTIONS}
                            onChange={(fontSans) => setAppearance({ fontSans })}
                            onCustomChange={(fontSansCustom) => setAppearance({ fontSansCustom })}
                            placeholder={t(
                                '例如：LXGW WenKai, PingFang SC',
                                'For example: LXGW WenKai, PingFang SC',
                            )}
                        />
                    </SettingRow>
                    <SettingRow
                        label={t('等宽字体', 'Monospace font')}
                        hint={t('用于日志与代码。', 'Used for logs and code.')}
                        layout="stack"
                    >
                        <FontField
                            label={t('等宽字体', 'monospace font')}
                            value={a.fontMono}
                            custom={a.fontMonoCustom}
                            presets={FONT_MONO_OPTIONS}
                            onChange={(fontMono) => setAppearance({ fontMono })}
                            onCustomChange={(fontMonoCustom) => setAppearance({ fontMonoCustom })}
                            placeholder={t(
                                '例如：Cascadia Code, Sarasa Mono SC',
                                'For example: Cascadia Code, Sarasa Mono SC',
                            )}
                        />
                    </SettingRow>
                    <SettingRow label={t('圆角', 'Corner radius')}>
                        <Segmented
                            value={a.radius}
                            options={RADIUS_OPTIONS.map((r) => ({
                                value: r.value,
                                label: t(r.label, r.labelEn),
                            }))}
                            onChange={(radius) => setAppearance({ radius })}
                        />
                    </SettingRow>
                </fieldset>
                <SliderSettingRow
                    label={t('界面缩放', 'Interface scale')}
                    hint={t('整体缩放界面。', 'Scale the entire interface.')}
                    min={UI_SCALE.min}
                    max={UI_SCALE.max}
                    step={UI_SCALE.step}
                    value={a.uiScale}
                    valueLabelFormat={(nextValue) => `${Math.round(nextValue * 100)}%`}
                    onValueChange={(uiScale) => setAppearance({ uiScale })}
                    aria-valuetext={`${Math.round(a.uiScale * 100)}%`}
                />
                <SettingRow label={t('显示密度', 'Display density')}>
                    <Segmented
                        value={a.density}
                        options={densities}
                        onChange={(density) => setAppearance({ density })}
                    />
                </SettingRow>
            </Group>

            <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {t('主题颜色变量', 'Theme color variables')}
                </summary>
                <fieldset
                    disabled={!!managedBy}
                    className="contents"
                    aria-label={t('主题变量', 'Theme variables')}
                >
                    <ThemeVarsPanel
                        cssVars={a.cssVars}
                        onChange={(cssVars) => setAppearance({ cssVars })}
                    />
                </fieldset>
            </details>

            <TopbarPanel />
            <Group
                title={t('显示效果', 'Display effects')}
                icon={Layers}
                description={t(
                    '手动选择动效与材质。改动立即应用，并通过同一外观设置同步保存。',
                    'Choose motion and materials manually. Changes apply immediately and sync with your appearance settings.',
                )}
            >
                <DisplayEffectsControls
                    value={{
                        disableMotion: a.disableMotion,
                        performanceMode: a.performanceMode ?? 'high',
                    }}
                    onChange={setAppearance}
                />
            </Group>

            <Group title={t('交互与无障碍', 'Interaction and accessibility')} icon={Accessibility}>
                <SettingRow
                    label={t('自定义右键菜单', 'Custom context menu')}
                    hint={t(
                        '默认开启；关闭后立即恢复浏览器原生右键菜单。',
                        'On by default. Turn it off to restore the browser context menu immediately.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.customContextMenu}
                        onChange={(customContextMenu) => setAppearance({ customContextMenu })}
                        ariaLabel={t('自定义右键菜单', 'Custom context menu')}
                    />
                </SettingRow>
                <SettingRow
                    label={t('自定义光标', 'Custom cursor')}
                    hint={t('使用主题化自适应光标。', 'Use a cursor that adapts to the theme.')}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.customPointerSystem}
                        disabled={!!managedBy}
                        onChange={(customPointerSystem) => setAppearance({ customPointerSystem })}
                        ariaLabel={t('自定义光标', 'Custom cursor')}
                    />
                </SettingRow>
                <SettingRow
                    label={t('减弱动效', 'Reduce motion')}
                    hint={t(
                        '减少位移与弹簧，保留轻微淡入。',
                        'Reduce movement and spring animations while keeping subtle fades.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.reduceMotion}
                        onChange={(reduceMotion) => setAppearance({ reduceMotion })}
                        ariaLabel={t('减弱动效', 'Reduce motion')}
                    />
                </SettingRow>
                <SettingRow
                    label={t('高对比模式', 'High contrast')}
                    hint={t(
                        '加强边框与次要文字的对比度。',
                        'Increase contrast for borders and secondary text.',
                    )}
                    layout="inline"
                >
                    <ToggleSwitch
                        value={a.highContrast}
                        onChange={(highContrast) => setAppearance({ highContrast })}
                        ariaLabel={t('高对比模式', 'High contrast')}
                    />
                </SettingRow>
                {isDesktop && (
                    <SettingRow
                        label={t('显示导航说明', 'Show navigation descriptions')}
                        hint={t(
                            '在宽屏导航中显示页面用途。',
                            'Describe each page in wide-screen navigation.',
                        )}
                        layout="inline"
                    >
                        <ToggleSwitch
                            value={a.sidebarPinned}
                            onChange={(sidebarPinned) => setAppearance({ sidebarPinned })}
                            ariaLabel={t('显示导航说明', 'Show navigation descriptions')}
                        />
                    </SettingRow>
                )}
            </Group>

            <ConfirmDialog
                open={contrastWarn !== null}
                onOpenChange={(o) => {
                    if (!o) {
                        setContrastWarn(null);
                    }
                }}
                title={t('强调色对比度较低', 'Low accent color contrast')}
                description={t(
                    `所选强调色与背景的对比度约为 ${contrastWarn?.ratio.toFixed(1)}:1，低于推荐的 3:1，用作链接或图标时可能不易辨认。可以保留，或恢复默认强调色。`,
                    `The selected color has about ${contrastWarn?.ratio.toFixed(1)}:1 contrast against the background, below the recommended 3:1. Links and icons may be hard to see. Keep it or restore the default accent.`,
                )}
                confirmText={t('恢复默认色', 'Restore default color')}
                cancelText={t('仍然使用', 'Keep color')}
                onConfirm={() =>
                    setAppearance({
                        accentMode: 'preset',
                        accentPreset: DEFAULT_APPEARANCE.accentPreset,
                        accentCustom: DEFAULT_APPEARANCE.accentCustom,
                    })
                }
            />
        </div>
    );
}

// A font selector: preset segments + a "Custom" segment that reveals a
// free-form family input. On Chromium (where `queryLocalFonts` exists) the
// input gets a native <datalist> populated with the user's installed fonts;
// everywhere else it stays a plain text box (feature-detect, silent fallback).
type LocalFont = { family: string };
type FontQueryWindow = Window & { queryLocalFonts?: () => Promise<LocalFont[]> };

function FontField({
    label,
    value,
    custom,
    presets,
    onChange,
    onCustomChange,
    placeholder,
}: {
    label: string;
    value: string;
    custom: string;
    presets: FontSpec[];
    onChange: (id: string) => void;
    onCustomChange: (family: string) => void;
    placeholder: string;
}) {
    const t = useT();
    const listId = useId();
    const [fonts, setFonts] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [fontLoadError, setFontLoadError] = useState(false);
    const canQuery = typeof (window as FontQueryWindow).queryLocalFonts === 'function';
    const isCustom = value === FONT_CUSTOM_ID;

    const options: Opt<string>[] = [
        ...presets.map((f) => ({ value: f.id, label: t(f.label, f.labelEn) })),
        { value: FONT_CUSTOM_ID, label: t('自定义', 'Custom') },
    ];

    // Lazily enumerate local fonts the first time the field is focused.
    const loadFonts = async () => {
        if (fonts !== null || loading || !canQuery) {
            return;
        }

        setLoading(true);
        setFontLoadError(false);

        try {
            const arr = await (window as FontQueryWindow).queryLocalFonts!();
            setFonts(
                Array.from(new Set(arr.map((f) => f.family))).sort((x, y) => x.localeCompare(y)),
            );
        } catch (error) {
            console.error('Failed to enumerate local fonts', error);
            setFontLoadError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-3">
            <Segmented value={value} options={options} onChange={onChange} />
            {isCustom && (
                <div className="flex flex-col gap-1.5">
                    <input
                        type="text"
                        aria-label={t(`自定义${label}`, `Custom ${label}`)}
                        value={custom}
                        list={canQuery ? listId : undefined}
                        onChange={(e) => onCustomChange(e.target.value)}
                        onFocus={loadFonts}
                        placeholder={placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        style={custom ? { fontFamily: custom } : undefined}
                        data-ui-control=""
                        className="min-h-11 w-full rounded-[4px] border bg-transparent px-3 py-2 text-base outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                    />
                    {canQuery && fonts && fonts.length > 0 && (
                        <datalist id={listId}>
                            {fonts.map((f) => (
                                <option key={f} value={f} />
                            ))}
                        </datalist>
                    )}
                    <SkeletonSwap
                        ready={!loading}
                        reserve={28}
                        lines={1}
                        label={t('本机字体', 'Local fonts')}
                        className={!loading ? 'skeleton-swap-fluid' : ''}
                    >
                        {fontLoadError ? (
                            <div
                                role="alert"
                                className="flex flex-wrap items-center gap-2 text-xs leading-snug text-destructive"
                            >
                                <span>
                                    {t(
                                        '无法读取本机字体，请检查浏览器权限后重试。',
                                        'Could not read local fonts. Check browser permissions and try again.',
                                    )}
                                </span>
                                <button
                                    type="button"
                                    className="min-h-11 shrink-0 px-2 font-medium underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    onClick={() => void loadFonts()}
                                >
                                    {t('重试', 'Retry')}
                                </button>
                            </div>
                        ) : (
                            <p className="text-xs leading-snug text-muted-foreground">
                                {canQuery
                                    ? t(
                                          '可选择本机字体或输入名称；未安装时使用系统字体。',
                                          'Choose an installed font or enter its name. Unavailable fonts fall back to the system font.',
                                      )
                                    : t(
                                          '可输入多个已安装字体，用逗号分隔；未安装时使用系统字体。',
                                          'Enter installed font names separated by commas. Unavailable fonts fall back to the system font.',
                                      )}
                            </p>
                        )}
                    </SkeletonSwap>
                </div>
            )}
        </div>
    );
}

// Curated subset of the cssVars whitelist surfaced as colour pickers. The
// server accepts the full token set; this is just the operator-friendly view.
const CSS_VAR_FIELDS: { token: string; label: [zh: string, en: string] }[] = [
    { token: '--background', label: ['页面背景', 'Page background'] },
    { token: '--foreground', label: ['主文字', 'Primary text'] },
    { token: '--card', label: ['卡片背景', 'Card background'] },
    { token: '--primary', label: ['主色调', 'Primary color'] },
    { token: '--muted-foreground', label: ['次要文字', 'Secondary text'] },
    { token: '--border', label: ['边框', 'Border'] },
    { token: '--sidebar', label: ['导航背景', 'Navigation background'] },
    { token: '--destructive', label: ['危险 / 错误', 'Danger / error'] },
    { token: '--success', label: ['成功', 'Success'] },
    { token: '--warning', label: ['警告', 'Warning'] },
];

// The variable panel: per-token colour overrides layered over the active
// palette/accent. Each override is a single hex value (validated server-side);
// an unset token falls through to the theme default.
function ThemeVarsPanel({
    cssVars,
    onChange,
}: {
    cssVars: Record<string, string>;
    onChange: (next: Record<string, string>) => void;
}) {
    const t = useT();
    const set = (token: string, hex: string) => onChange({ ...cssVars, [token]: hex });

    const clear = (token: string) => {
        const next = { ...cssVars };
        delete next[token];
        onChange(next);
    };

    const count = CSS_VAR_FIELDS.filter((f) => cssVars[f.token]).length;

    return (
        <Group
            title={t('颜色覆盖', 'Color overrides')}
            icon={Palette}
            description={t(
                '覆盖当前配色；未设置的沿用默认值。白名单颜色变量也应用于登录页。',
                'Override the current palette. Unset colors use the defaults. Supported color variables also apply to the sign-in page.',
            )}
        >
            {CSS_VAR_FIELDS.map((f) => {
                const override = cssVars[f.token];
                const label = t(...f.label);
                return (
                    <SettingRow
                        key={f.token}
                        label={label}
                        hint={<code className="font-mono text-meta">{f.token}</code>}
                        layout="inline"
                    >
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {override ? (
                                <span className="font-mono text-meta text-muted-foreground tabular-nums">
                                    {override}
                                </span>
                            ) : (
                                <span className="text-meta text-muted-foreground">
                                    {t('默认', 'Default')}
                                </span>
                            )}
                            <label
                                title={t('选择颜色', 'Choose color')}
                                className="relative size-11 cursor-pointer overflow-hidden rounded-[4px] border bg-muted/40 focus-within:ring-2 focus-within:ring-ring"
                                style={override ? { backgroundColor: override } : undefined}
                            >
                                <input
                                    type="color"
                                    value={toColorInputValue(override || '#888888', '#888888')}
                                    onChange={(e) => set(f.token, e.target.value)}
                                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                    aria-label={t(`${label}颜色`, `Choose color for ${label}`)}
                                />
                            </label>
                            <button
                                type="button"
                                onClick={() => clear(f.token)}
                                disabled={!override}
                                aria-label={t(`重置${label}`, `Reset ${label}`)}
                                className="flex size-11 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:text-destructive disabled:opacity-30"
                            >
                                <RotateCcw className="size-3.5" />
                            </button>
                        </div>
                    </SettingRow>
                );
            })}
            {count > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span className="text-meta text-muted-foreground">
                        {t(`已覆盖 ${count} 个变量`, `Overridden variables: ${count}`)}
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onChange({})}
                        className="text-destructive hover:text-destructive"
                    >
                        <RotateCcw className="size-4" /> {t('全部恢复默认', 'Restore all defaults')}
                    </Button>
                </div>
            )}
        </Group>
    );
}
