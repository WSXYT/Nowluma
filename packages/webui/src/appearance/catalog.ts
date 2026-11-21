// Frontend appearance catalogues. The server stores only ids; the visuals
// (swatches, font stacks, gradients, palette previews) live here.
import type { Palette } from '@/types';

export type AccentColor =
    'neutral' | 'lavender' | 'sky' | 'blue' | 'violet' | 'rose' | 'emerald' | 'amber' | 'orange';

export interface AccentSpec {
    id: AccentColor;
    label: string;
    labelEn: string;
    swatch: string;
    light: { primary: string; ring: string };
    dark: { primary: string; ring: string };
}

export const ACCENTS: AccentSpec[] = [
    {
        id: 'neutral',
        label: '中性',
        labelEn: 'Neutral',
        swatch: '#111111',
        light: { primary: 'oklch(21% 0 0)', ring: 'oklch(21% 0 0)' },
        dark: { primary: 'oklch(98% 0 0)', ring: 'oklch(98% 0 0)' },
    },
    {
        id: 'lavender',
        label: '薰衣草',
        labelEn: 'Lavender',
        swatch: '#8561bd',
        light: { primary: 'oklch(57% 0.14 300)', ring: 'oklch(57% 0.14 300)' },
        dark: { primary: 'oklch(78% 0.115 300)', ring: 'oklch(78% 0.115 300)' },
    },
    {
        id: 'sky',
        label: '天蓝',
        labelEn: 'Sky blue',
        swatch: '#38bdf8',
        light: { primary: 'oklch(68.5% 0.155 230)', ring: 'oklch(68.5% 0.155 230)' },
        dark: { primary: 'oklch(75% 0.14 230)', ring: 'oklch(75% 0.14 230)' },
    },
    {
        id: 'blue',
        label: '靛蓝',
        labelEn: 'Indigo',
        swatch: '#3b82f6',
        light: { primary: 'oklch(60% 0.18 258)', ring: 'oklch(60% 0.18 258)' },
        dark: { primary: 'oklch(70% 0.16 258)', ring: 'oklch(70% 0.16 258)' },
    },
    {
        id: 'violet',
        label: '紫罗兰',
        labelEn: 'Violet',
        swatch: '#8b5cf6',
        light: { primary: 'oklch(60% 0.2 290)', ring: 'oklch(60% 0.2 290)' },
        dark: { primary: 'oklch(72% 0.17 290)', ring: 'oklch(72% 0.17 290)' },
    },
    {
        id: 'rose',
        label: '玫瑰',
        labelEn: 'Rose',
        swatch: '#f43f5e',
        light: { primary: 'oklch(63% 0.21 18)', ring: 'oklch(63% 0.21 18)' },
        dark: { primary: 'oklch(72% 0.18 18)', ring: 'oklch(72% 0.18 18)' },
    },
    {
        id: 'emerald',
        label: '翡翠',
        labelEn: 'Emerald',
        swatch: '#10b981',
        light: { primary: 'oklch(64% 0.16 162)', ring: 'oklch(64% 0.16 162)' },
        dark: { primary: 'oklch(74% 0.15 162)', ring: 'oklch(74% 0.15 162)' },
    },
    {
        id: 'amber',
        label: '琥珀',
        labelEn: 'Amber',
        swatch: '#f59e0b',
        light: { primary: 'oklch(72% 0.17 70)', ring: 'oklch(72% 0.17 70)' },
        dark: { primary: 'oklch(78% 0.16 70)', ring: 'oklch(78% 0.16 70)' },
    },
    {
        id: 'orange',
        label: '夕橙',
        labelEn: 'Orange',
        swatch: '#f97316',
        light: { primary: 'oklch(67% 0.2 45)', ring: 'oklch(67% 0.2 45)' },
        dark: { primary: 'oklch(74% 0.18 45)', ring: 'oklch(74% 0.18 45)' },
    },
];

export const RADIUS_OPTIONS = [
    { value: 0.25, label: '默认', labelEn: 'Default' },
    { value: 0.375, label: '紧凑', labelEn: 'Compact' },
    { value: 0.5, label: '标准', labelEn: 'Standard' },
    { value: 0.75, label: '舒适', labelEn: 'Soft' },
    { value: 1.0, label: '圆润', labelEn: 'Round' },
] as const;

export const POLL_INTERVAL_OPTIONS = [
    { value: 1000, label: '1 秒（实时）' },
    { value: 3000, label: '3 秒（默认）' },
    { value: 5000, label: '5 秒（节能）' },
    { value: 10000, label: '10 秒（省电）' },
    { value: 0, label: '已暂停' },
] as const;

export interface FontSpec {
    id: string;
    label: string;
    labelEn: string;
    stack: string;
}

export const FONT_SANS_OPTIONS: FontSpec[] = [
    {
        id: 'default',
        label: '默认（本地系统）',
        labelEn: 'Default (system)',
        stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif",
    },
    {
        id: 'system',
        label: '平台原生',
        labelEn: 'Platform native',
        stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    },
    {
        id: 'rounded',
        label: '圆润（平台字体）',
        labelEn: 'Rounded (platform)',
        stack: "ui-rounded, 'SF Pro Rounded', system-ui, sans-serif",
    },
    {
        id: 'serif',
        label: '衬线（本地字体）',
        labelEn: 'Serif (local)',
        stack: "Georgia, 'Songti SC', 'STSong', serif",
    },
];

export const FONT_MONO_OPTIONS: FontSpec[] = [
    {
        id: 'default',
        label: '默认（系统等宽）',
        labelEn: 'Default (system monospace)',
        stack: "ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
    },
    {
        id: 'system',
        label: '平台等宽',
        labelEn: 'Platform monospace',
        stack: 'ui-monospace, Menlo, Consolas, monospace',
    },
];

export interface GradientSpec {
    id: string;
    label: string;
    labelEn: string;
    css: string;
}

export const GRADIENT_OPTIONS: GradientSpec[] = [
    {
        id: 'aurora',
        label: '极光',
        labelEn: 'Aurora',
        css: 'linear-gradient(135deg, #1e3a8a 0%, #0ea5e9 50%, #22d3ee 100%)',
    },
    {
        id: 'sunset',
        label: '日落',
        labelEn: 'Sunset',
        css: 'linear-gradient(135deg, #f97316 0%, #db2777 50%, #7c3aed 100%)',
    },
    {
        id: 'forest',
        label: '森野',
        labelEn: 'Forest',
        css: 'linear-gradient(135deg, #064e3b 0%, #10b981 55%, #84cc16 100%)',
    },
    {
        id: 'dusk',
        label: '暮色',
        labelEn: 'Dusk',
        css: 'linear-gradient(160deg, #0f172a 0%, #334155 55%, #64748b 100%)',
    },
    {
        id: 'rose',
        label: '霞光',
        labelEn: 'Rose glow',
        css: 'linear-gradient(135deg, #9f1239 0%, #fb7185 55%, #fda4af 100%)',
    },
];

export const UI_SCALE = { min: 0.9, max: 1.2, step: 0.05 } as const;

/** The sentinel `fontSans`/`fontMono` id selecting the free-form custom family. */
export const FONT_CUSTOM_ID = 'custom';

/** Light-flavored palettes; every other non-default palette is dark. */
export const LIGHT_PALETTES = new Set<Palette>([
    'catppuccin-latte',
    'rose-pine-dawn',
    'everforest-light',
]);

/** A palette fixes light/dark; 'default' defers to mode. */
export function paletteResolved(p: Palette): 'light' | 'dark' | null {
    if (p === 'default') {
        return null;
    }

    return LIGHT_PALETTES.has(p) ? 'light' : 'dark';
}

export interface PaletteSpec {
    id: Palette;
    label: string;
    labelEn?: string;
    /** Picker preview: surface tile + three signature accent dots. */
    preview: { bg: string; surface: string; dots: [string, string, string] };
}

export const PALETTE_OPTIONS: PaletteSpec[] = [
    {
        id: 'default',
        label: '默认',
        labelEn: 'Default',
        preview: { bg: '#f1f5f9', surface: '#ffffff', dots: ['#8561bd', '#10b981', '#f43f5e'] },
    },
    {
        id: 'catppuccin-latte',
        label: 'Latte',
        preview: { bg: '#eff1f5', surface: '#ffffff', dots: ['#8839ef', '#40a02b', '#d20f39'] },
    },
    {
        id: 'catppuccin-frappe',
        label: 'Frappé',
        preview: { bg: '#303446', surface: '#414559', dots: ['#ca9ee6', '#a6d189', '#e78284'] },
    },
    {
        id: 'catppuccin-macchiato',
        label: 'Macchiato',
        preview: { bg: '#24273a', surface: '#363a4f', dots: ['#c6a0f6', '#a6da95', '#ed8796'] },
    },
    {
        id: 'catppuccin-mocha',
        label: 'Mocha',
        preview: { bg: '#1e1e2e', surface: '#313244', dots: ['#cba6f7', '#a6e3a1', '#f38ba8'] },
    },
    {
        id: 'rose-pine',
        label: 'Rosé Pine',
        preview: { bg: '#191724', surface: '#1f1d2e', dots: ['#c4a7e7', '#9ccfd8', '#eb6f92'] },
    },
    {
        id: 'rose-pine-moon',
        label: 'Rosé Pine Moon',
        preview: { bg: '#232136', surface: '#2a273f', dots: ['#c4a7e7', '#9ccfd8', '#eb6f92'] },
    },
    {
        id: 'rose-pine-dawn',
        label: 'Rosé Pine Dawn',
        preview: { bg: '#faf4ed', surface: '#fffaf3', dots: ['#907aa9', '#286983', '#b4637a'] },
    },
    {
        id: 'nord',
        label: 'Nord',
        preview: { bg: '#2e3440', surface: '#3b4252', dots: ['#81a1c1', '#a3be8c', '#bf616a'] },
    },
    {
        id: 'everforest-dark',
        label: 'Everforest 暗',
        labelEn: 'Everforest Dark',
        preview: { bg: '#2d353b', surface: '#343f44', dots: ['#a7c080', '#7fbbb3', '#e67e80'] },
    },
    {
        id: 'everforest-light',
        label: 'Everforest 亮',
        labelEn: 'Everforest Light',
        preview: { bg: '#efebd4', surface: '#fdf6e3', dots: ['#8da101', '#3a94c5', '#f85552'] },
    },
];
