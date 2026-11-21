import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import type { UiAppearance } from '@nowluma/common/webui-appearance';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import type * as I18n from '../src/i18n';
import { hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    runAction: vi.fn(async (_options: unknown, action: () => Promise<unknown>) => action()),
    startAction: vi.fn(() => ({ fail: vi.fn() })),
    applyAppearance: vi.fn(),
    applyBackgroundLayer: vi.fn(),
    reveal: vi.fn((apply: () => void) => apply()),
}));
const prefs = vi.hoisted(() => ({ language: 'zh' as I18n.Language }));
vi.mock('react', async (load) => ({ ...(await load<typeof React>()) }));
vi.mock('@/i18n', async (original) => ({
    ...(await original<typeof I18n>()),
    useLocale: () => ({
        language: prefs.language,
        locale: prefs.language === 'en' ? 'en' : 'zh-CN',
        locked: false,
        setLanguage: vi.fn(),
    }),
}));
vi.mock('@/contexts/ActionFeedbackContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useActionFeedback: () => mocks,
}));
vi.mock('@/appearance/runtime', () => ({
    getTargetAppearance: () => null,
    presentationStore: { subscribe: vi.fn(), getSnapshot: () => null },
    subscribeHostAppearance: () => vi.fn(),
}));
vi.mock('@/appearance/dom', () => ({
    applyAppearance: mocks.applyAppearance,
    applyBackgroundLayer: mocks.applyBackgroundLayer,
}));
vi.mock('@/appearance/reveal', () => ({
    runThemeReveal: mocks.reveal,
    trackRevealOrigin: () => vi.fn(),
}));

let host = hookHost();
let server: UiAppearance;
let values: Map<string, string>;
let setItem: (key: string, value: string) => void;
const requests = vi.fn<typeof fetch>();
const render = () => host.render(() => ThemeProvider({ children: null }));
const current = () => render().props.value;
const posts = () => requests.mock.calls.filter(([, options]) => options?.method === 'POST');

async function ready() {
    render();
    await vi.advanceTimersByTimeAsync(0);
    const value = current();
    expect(value.ready).toBe(true);
    return value;
}

beforeEach(() => {
    vi.useFakeTimers();
    prefs.language = 'zh';
    vi.clearAllMocks();
    host = hookHost();
    server = {
        ...structuredClone(DEFAULT_APPEARANCE),
        mode: 'light',
        accentPreset: 'violet',
        customCss: '.fixture { color: inherit; }',
        cssVars: { '--primary': '#123456' },
        background: { ...DEFAULT_APPEARANCE.background, type: 'solid', color: '#abcdef' },
    };
    values = new Map([
        ['nowluma_token', 'fixture-session'],
        ['nowluma_ui_appearance', JSON.stringify(DEFAULT_APPEARANCE)],
    ]);
    setItem = vi.fn((key: string, value: string) => {
        values.set(key, value);
    });
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem });
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('window', { matchMedia: () => media, setTimeout: globalThis.setTimeout });
    vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
        getSnapshot(),
    );
    requests.mockImplementation(async (input, options) => {
        if (options?.method === 'POST') {
            const { appearance } = JSON.parse(options.body as string) as {
                appearance: UiAppearance;
            };
            return Response.json({ success: true, config: { appearance } });
        }

        return input === '/api/ui/public'
            ? Response.json({ appearance: { ...server, customCss: '' } })
            : Response.json({ config: { appearance: server } });
    });
    vi.stubGlobal('fetch', requests);
});
afterEach(() => {
    host.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('ThemeProvider manual preferences and replay ownership', () => {
    it('uses the current locale for the clock without restarting the pending initial read', async () => {
        server.timeFormat = '12h';
        const read = Promise.withResolvers<Response>();
        requests.mockImplementationOnce(() => read.promise);
        const initial = current();
        prefs.language = 'en';
        const translated = current();
        expect(translated.reloadAppearance).toBe(initial.reloadAppearance);
        expect(translated.saveAppearance).toBe(initial.saveAppearance);
        expect(requests).toHaveBeenCalledTimes(1);

        read.resolve(Response.json({ config: { appearance: server } }));
        await vi.advanceTimersByTimeAsync(0);
        const time = new Date(2026, 0, 1, 15, 5, 42);
        const options = {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        } as const;
        expect(current().formatClock(time)).toBe(time.toLocaleTimeString('en', options));
        prefs.language = 'zh';
        expect(current().formatClock(time)).toBe(time.toLocaleTimeString('zh-CN', options));
        expect(requests).toHaveBeenCalledTimes(1);
        expect(current().formatClock('invalid fixture time')).toBe('invalid fixture time');
    });

    it('keeps in-flight manual effects over a slow first read while retaining every unrelated server field', async () => {
        const read = Promise.withResolvers<Response>();
        requests.mockImplementationOnce(() => read.promise);
        let value = current();
        value.setAppearance({ disableMotion: true, performanceMode: 'low' });
        value.setAppearance({ background: { imageBlur: 17 } });
        value = current();
        expect(value.appearance).toMatchObject({ disableMotion: true, performanceMode: 'low' });
        await vi.advanceTimersByTimeAsync(600);
        expect(posts()).toHaveLength(0);

        read.resolve(Response.json({ config: { appearance: server } }));
        await vi.advanceTimersByTimeAsync(0);
        value = current();
        expect(value.savedAppearance).toEqual({
            ...server,
            disableMotion: true,
            performanceMode: 'low',
            background: { ...server.background, imageBlur: 17 },
        });
        await vi.advanceTimersByTimeAsync(400);
        expect(posts()).toHaveLength(1);
        expect(JSON.parse(posts()[0][1]!.body as string).appearance).toEqual(value.savedAppearance);
    });

    it('keeps all replay setters local and restores the saved material/motion presentation', async () => {
        let value = await ready();
        const saved = structuredClone(value.savedAppearance);
        vi.mocked(setItem).mockClear();
        requests.mockClear();
        mocks.reveal.mockClear();
        value.setAppearancePreview({});
        value.setMode('dark');
        value.setAppearance({ disableMotion: true, performanceMode: 'low' });
        let tree = render();
        value = tree.props.value;
        expect(value.appearance).toMatchObject({
            mode: 'dark',
            disableMotion: true,
            performanceMode: 'low',
        });
        expect(value.savedAppearance).toEqual(saved);
        expect(value.performance).toEqual({ mode: 'low', low: true });
        expect(tree.props.children.props.reducedMotion).toBe('always');
        expect(mocks.reveal).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(800);
        expect(posts()).toHaveLength(0);
        expect(setItem).not.toHaveBeenCalled();

        value.setAppearancePreview(null);
        tree = render();
        expect(tree.props.value.appearance).toEqual(saved);
        expect(tree.props.value.performance).toEqual({ mode: 'high', low: false });
        expect(tree.props.children.props.reducedMotion).toBe('user');
        expect(mocks.applyAppearance).toHaveBeenLastCalledWith(saved, 'light', null, false);
    });

    it('preserves authenticated custom CSS and unrelated server preferences on explicit first-run save', async () => {
        values.delete('nowluma_token');
        let value = await ready();
        expect(value.savedAppearance.customCss).toBe('');
        values.set('nowluma_token', 'fixture-session');
        server = { ...server, palette: 'nord', customContextMenu: false };
        value.setAppearancePreview({});
        value.setMode('dark');
        await value.saveAppearance({ disableMotion: false, performanceMode: 'low' });
        value = current();
        expect(posts()).toHaveLength(1);
        expect(JSON.parse(posts()[0][1]!.body as string).appearance).toEqual({
            ...server,
            mode: 'dark',
            disableMotion: false,
            performanceMode: 'low',
        });
        expect(value.savedAppearance.customCss).toBe(server.customCss);
        value.setAppearancePreview(null);
        expect(current().performance).toEqual({ mode: 'low', low: true });
        await vi.advanceTimersByTimeAsync(800);
        expect(posts()).toHaveLength(1);
    });

    it('does not replace real preferences or POST defaults when the authenticated pre-save read fails', async () => {
        const value = await ready();
        const saved = structuredClone(value.savedAppearance);
        vi.mocked(setItem).mockClear();
        requests.mockImplementationOnce(async () => new Response('', { status: 503 }));
        await expect(
            value.saveAppearance({ disableMotion: true, performanceMode: 'low' }),
        ).rejects.toThrow('无法读取已保存的外观');
        expect(posts()).toHaveLength(0);
        expect(current().savedAppearance).toEqual(saved);
        expect(setItem).not.toHaveBeenCalled();
    });

    it('serializes a slow old save before the later explicit material choice', async () => {
        const value = await ready();
        const firstWrite = Promise.withResolvers<Response>();
        let first = true;
        requests.mockImplementation(async (_input, options) => {
            if (options?.method === 'POST') {
                const { appearance } = JSON.parse(options.body as string) as {
                    appearance: UiAppearance;
                };

                if (first) {
                    first = false;
                    return firstWrite.promise;
                }

                return Response.json({ success: true, config: { appearance } });
            }

            return Response.json({ config: { appearance: server } });
        });
        const older = value.saveAppearance({ performanceMode: 'high' });
        await vi.advanceTimersByTimeAsync(0);
        const newer = current().saveAppearance({ disableMotion: true, performanceMode: 'low' });
        await vi.advanceTimersByTimeAsync(0);
        expect(posts()).toHaveLength(1);
        firstWrite.resolve(Response.json({ success: true, config: { appearance: server } }));
        await older;
        await newer;
        expect(posts()).toHaveLength(2);
        expect(
            posts().map(
                ([, options]) => JSON.parse(options!.body as string).appearance.performanceMode,
            ),
        ).toEqual(['high', 'low']);
        expect(current().savedAppearance).toMatchObject({
            disableMotion: true,
            performanceMode: 'low',
        });
    });

    it('rejects a missing session before any explicit save read, cache mutation, or POST', async () => {
        const value = await ready();
        values.delete('nowluma_token');
        vi.mocked(setItem).mockClear();
        requests.mockClear();
        await expect(value.saveAppearance({ disableMotion: true })).rejects.toThrow('登录已失效');
        expect(requests).not.toHaveBeenCalled();
        expect(setItem).not.toHaveBeenCalled();
    });

    it('loads authenticated CSS after login without silently saving server defaults over manual choices', async () => {
        server = { ...server, disableMotion: true, performanceMode: 'low' };
        const value = await ready();
        server = {
            ...server,
            disableMotion: false,
            performanceMode: 'high',
            customCss: '.fixture { color: #123456; }',
        };
        await value.reloadAppearance();
        expect(current().savedAppearance).toMatchObject({
            disableMotion: true,
            performanceMode: 'low',
            customCss: server.customCss,
        });
        await vi.advanceTimersByTimeAsync(800);
        expect(posts()).toHaveLength(0);
    });
});
