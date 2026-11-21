import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsNav, SettingsPage } from '../src/components/pages/settings-page';
import type * as I18n from '../src/i18n';
import type * as Router from '../src/router';
import { SETTINGS_TABS, type SettingsTab } from '../src/router';
import { elements } from './helpers/hook-host';

const route = vi.hoisted(() => ({
    tab: undefined as string | undefined,
    navigate: vi.fn(),
    language: 'zh' as I18n.Language,
}));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18n>();
    return { ...actual, useT: () => actual.translator(route.language) };
});
vi.mock('@/router', async (original) => {
    const actual = await original<typeof Router>();
    return {
        ...actual,
        settingsRoute: {
            ...actual.settingsRoute,
            useSearch: () => ({ tab: route.tab }),
            useNavigate: () => route.navigate,
        },
    };
});
afterEach(() => {
    route.tab = undefined;
    route.language = 'zh';
    route.navigate.mockClear();
});
const panelNames: Record<SettingsTab, string> = {
    appearance: 'AppearancePanel',
    data: 'DataPanel',
    account: 'AccountPanel',
    globalConfig: 'GlobalConfigPanel',
    storage: 'StoragePanel',
    notifications: 'NotificationsPanel',
    system: 'SystemPanel',
    advanced: 'AdvancedPanel',
    developer: 'DeveloperPanel',
    about: 'AboutPanel',
};

describe('SettingsPage category routes', () => {
    it.each(SETTINGS_TABS)('keeps the %s deep link and exactly its requested panel', (tab) => {
        route.tab = tab;
        route.language = 'en';
        const page = elements(SettingsPage());
        const panels = page.filter(
            (item) => typeof item.type === 'function' && item.type.name.endsWith('Panel'),
        );
        expect(
            panels.map((item) => (typeof item.type === 'function' ? item.type.name : '')),
        ).toEqual([panelNames[tab]]);
        const nav = page.find((item) => item.type === SettingsNav)!;
        const section = page.find((item) => item.type === 'section');
        expect(section?.props['data-settings-tab']).toBe(tab);

        if (tab === 'system') {
            expect(section?.props['aria-label']).toBe('Service');
        }

        expect(nav.props.tab).toBe(tab);
        (nav.props.onChange as (next: SettingsTab) => void)('system');
        expect(route.navigate).toHaveBeenCalledWith({
            to: '/settings',
            search: { tab: 'system' },
            replace: true,
        });
    });

    it('keeps the default category URL empty and all ten categories visible', () => {
        const nav = elements(SettingsPage()).find((item) => item.type === SettingsNav)!;
        expect(nav.props.tab).toBe('appearance');
        (nav.props.onChange as (next: SettingsTab) => void)('appearance');
        expect(route.navigate).toHaveBeenCalledWith({ to: '/settings', search: {}, replace: true });
        const html = renderToStaticMarkup(
            <SettingsNav tab="appearance" onChange={() => undefined} />,
        );
        expect(html.match(/<button /g)).toHaveLength(10);
        expect(html.match(/aria-current="page"/g)).toHaveLength(1);
        expect(html).toContain('aria-label="设置导航"');
    });

    it('renders all category labels in English without changing the selected category', () => {
        route.language = 'en';
        const html = renderToStaticMarkup(<SettingsNav tab="storage" onChange={() => undefined} />);
        expect(html).toContain('aria-label="Settings navigation"');
        expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>).)*>Storage<\/span>/s);
        const labels = Array.from(
            html.matchAll(/<span class="min-w-0 break-words">([^<]+)<\/span>/g),
            (match) => match[1],
        );
        expect(labels).toEqual([
            'Appearance',
            'Data and formatting',
            'Account security',
            'Global configuration',
            'Storage',
            'Notifications',
            'Service',
            'Advanced',
            'Developer',
            'About',
        ]);
    });
});
