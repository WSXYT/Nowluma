import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as segmentedControl from '../src/components/interior/segmented-control';
import * as dropdown from '../src/components/interior/dropdown';
import { AppearancePanel } from '../src/components/settings/appearance-panel';
import { BackgroundCard } from '../src/components/settings/background-card';
import { DataPanel } from '../src/components/settings/data-panel';
import { Group, Segmented, SettingRow } from '../src/components/settings/settings-controls';
import { ActionFeedbackProvider } from '../src/contexts/ActionFeedbackContext';
import { DEFAULT_APPEARANCE } from '../src/contexts/ThemeContext';
import { LocaleProvider } from '../src/i18n';
import type { UiAppearance } from '../src/types';

const preferences = vi.hoisted(() => ({
    appearance: null as UiAppearance | null,
    managedBy: null as string | null,
    setAppearance: vi.fn(),
    setPages: vi.fn(),
    setTopbarItems: vi.fn(),
}));
vi.mock('@/contexts/ThemeContext', async (original) => {
    const actual = await original<Record<string, unknown>>();
    return {
        ...actual,
        useTheme: () => ({
            appearance: preferences.appearance,
            savedAppearance: preferences.appearance,
            setAppearance: preferences.setAppearance,
            resolved: 'light',
            managedBy: preferences.managedBy,
            performance: { mode: 'high', low: false },
            uploadBackground: vi.fn(),
            removeBackground: vi.fn(),
        }),
    };
});
vi.mock('@/contexts/LayoutContext', async (original) => {
    const actual = await original<Record<string, unknown>>();
    return {
        ...actual,
        useLayout: () => ({
            pages: actual.DEFAULT_PAGES,
            setPages: preferences.setPages,
            topbarItems: [],
            setTopbarItems: preferences.setTopbarItems,
        }),
    };
});

beforeEach(() => {
    preferences.appearance = structuredClone(DEFAULT_APPEARANCE);
    preferences.managedBy = null;
    preferences.setAppearance.mockClear();
    vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), {
            matchMedia: () => ({
                matches: false,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            }),
        }),
    );
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('settings-controls', () => {
    it('keeps the row label and numeric option values across the shared segmented control', () => {
        const control = vi.spyOn(segmentedControl, 'SegmentedControl');
        const onChange = vi.fn();
        const html = renderToStaticMarkup(
            <Group title="数据刷新">
                <SettingRow label="轮询间隔">
                    <Segmented
                        value={0}
                        options={[
                            { value: 0, label: '暂停' },
                            { value: 5000, label: '5 秒' },
                        ]}
                        onChange={onChange}
                    />
                </SettingRow>
            </Group>,
        );
        const props = control.mock.calls[0][0];
        expect(props.label).toBe('轮询间隔');
        expect(props.value).toBe('0');
        expect(html).toContain('role="radiogroup" aria-label="轮询间隔"');
        const labelId = html.match(/<p id="([^"]+)"/)?.[1];
        expect(labelId).toBeDefined();
        expect(html).toContain(`aria-labelledby="${labelId}"`);

        props.onValueChange?.('5000');
        props.onValueChange?.('0');
        props.onValueChange?.('unknown');
        expect(onChange.mock.calls).toEqual([[5000], [0]]);
    });

    it.each([
        ['zh', '选项'],
        ['en', 'Options'],
    ] as const)(
        'keeps the %s standalone accessible name and disables every option',
        (language, label) => {
            const control = vi.spyOn(segmentedControl, 'SegmentedControl');
            const html = renderToStaticMarkup(
                <LocaleProvider fixed={language}>
                    <Segmented
                        value="dark"
                        options={[
                            { value: 'light', label: 'Light' },
                            { value: 'dark', label: 'Dark' },
                        ]}
                        onChange={() => undefined}
                        disabled
                    />
                </LocaleProvider>,
            );
            const props = control.mock.calls[0][0];
            expect(props.label).toBe(label);
            expect(props.options.every((option) => option.disabled)).toBe(true);
            expect(html).toContain(`role="radiogroup" aria-label="${label}"`);
            expect(html.match(/role="radio"[^>]+aria-disabled="true"/g)).toHaveLength(2);
        },
    );

    it('renders localized background presets without changing the selected gradient', () => {
        const html = renderToStaticMarkup(
            <LocaleProvider fixed="en">
                <BackgroundCard
                    appearance={{
                        ...DEFAULT_APPEARANCE,
                        background: {
                            ...DEFAULT_APPEARANCE.background,
                            type: 'gradient',
                            gradient: 'aurora',
                        },
                    }}
                    setAppearance={vi.fn()}
                    uploadBackground={vi.fn()}
                    removeBackground={vi.fn()}
                />
            </LocaleProvider>,
        );
        expect(html).toContain('aria-label="Background type"');
        expect(html).toMatch(/aria-pressed="true" title="Aurora" aria-label="Aurora"/);
        expect(html).toMatch(/aria-pressed="false" title="Sunset" aria-label="Sunset"/);
    });

    it('renders English appearance presets and keeps host-managed preferences guarded', () => {
        preferences.appearance!.palette = 'nord';
        preferences.appearance!.fontSans = 'custom';
        preferences.appearance!.fontSansCustom = 'Fixture Sans';
        preferences.appearance!.cssVars = { '--foreground': '#123456' };
        preferences.managedBy = 'Fixture host';
        const html = renderToStaticMarkup(
            <LocaleProvider fixed="en">
                <ActionFeedbackProvider>
                    <AppearancePanel />
                </ActionFeedbackProvider>
            </LocaleProvider>,
        );
        expect(html).toContain('Fixture host manages the appearance.');
        expect(html).toContain(
            '<fieldset disabled="" class="contents" aria-label="Theme, colors, and background">',
        );
        expect(html).toContain('aria-checked="true" aria-label="Nord"');
        expect(html).toContain('aria-label="Lavender"');
        expect(html).toMatch(
            /<input[^>]*aria-label="Custom interface font"[^>]*value="Fixture Sans"/,
        );
        expect(html).toContain('aria-label="Choose color for Primary text"');
        expect(preferences.setAppearance).not.toHaveBeenCalled();
    });

    it('localizes data formatting choices while preserving numeric polling and route values', () => {
        preferences.appearance!.pollInterval = 0;
        const select = vi.spyOn(dropdown, 'Dropdown');
        const control = vi.spyOn(segmentedControl, 'SegmentedControl');
        const html = renderToStaticMarkup(
            <LocaleProvider fixed="en">
                <DataPanel />
            </LocaleProvider>,
        );
        expect(html).toContain('Polling is paused');
        expect(html).toContain('aria-label="Polling interval"');
        expect(html).toContain('aria-label="Time format"');
        expect(html).toContain('12-hour (AM/PM)');
        expect(select.mock.calls[0][0].label).toBe('Default page');
        expect(select.mock.calls[0][0].items.map((item) => item.value)).toEqual([
            '/',
            '/processes',
            '/config',
            '/logs',
            '/debug',
            '/settings',
        ]);
        expect(
            select.mock.calls[0][0].items.every((item) => !/[\u3400-\u9fff]/u.test(item.label)),
        ).toBe(true);
        control.mock.calls[0][0].onValueChange?.('5000');
        expect(preferences.setAppearance).toHaveBeenCalledExactlyOnceWith({ pollInterval: 5000 });
    });
});
