import type * as React from 'react';
import type * as Motion from 'motion/react';
import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';
import { elements, hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';
import type * as I18n from '../src/i18n';

const state = vi.hoisted(() => ({
    language: 'zh' as I18n.Language,
    low: false,
    reduceMotion: false,
    disableMotion: false,
    setAppearance: vi.fn(),
    removeCustomCss: vi.fn(),
}));

vi.mock('react', async (original) => ({ ...(await original<typeof React>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(state.language) };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof Motion>()),
    useReducedMotionConfig: () => false,
}));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: 'none' },
            palette: 'default',
            reduceMotion: state.reduceMotion,
            disableMotion: state.disableMotion,
        },
        performance: { low: state.low, mode: 'high' },
        managedBy: null,
        setAppearance: state.setAppearance,
    }),
}));

let hosts: HookHost[];
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { language: 'zh', low: false, reduceMotion: false, disableMotion: false });
    hosts = [];
    vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), {
            matchMedia: () => ({ matches: false }),
        }),
    );
    vi.stubGlobal(
        'document',
        Object.assign(new EventTarget(), {
            getElementById: (id: string) =>
                id === 'nowluma-custom-css' ? { remove: state.removeCustomCss } : null,
        }),
    );
});
afterEach(() => {
    hosts.forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function host() {
    const next = hookHost();
    hosts.push(next);
    return next;
}

function find(
    node: ReactNode,
    predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) {
    const found = elements(node).find(predicate);

    if (!found) {
        throw new Error('Expected production login control');
    }

    return found;
}

function named(node: ReactNode, name: string) {
    return find(
        node,
        (element) => typeof element.type === 'function' && element.type.name === name,
    );
}

function mountedPage(onLogin = vi.fn(async () => ({ success: false }))) {
    const pageHost = host();
    const render = () => pageHost.render(() => LoginPage({ onLogin }));
    return { render, onLogin };
}

describe('LoginPage authentication and preference ownership', () => {
    it('leaves asynchronous authentication and the separate second-factor focus path with the auth owner', async () => {
        const { promise, resolve } = Promise.withResolvers<{
            success: boolean;
            needsTotp: boolean;
        }>();
        const onLogin = vi.fn(() => promise);
        const page = mountedPage(onLogin);
        const input = find(page.render(), (element) => element.props.id === 'login-password');
        (input.props.onChange as (event: unknown) => void)({
            target: { value: 'not-a-real-password' },
        });
        const form = find(page.render(), (element) => element.type === 'form');
        const pending = (form.props.onSubmit as (event: unknown) => Promise<void>)({
            preventDefault: vi.fn(),
        });
        const checking = find(page.render(), (element) => element.props.type === 'submit');
        expect(checking.props.disabled).toBe(true);
        expect(checking.props.children).toBe('验证中…');
        expect(
            find(page.render(), (element) => element.props.id === 'login-password').props.value,
        ).toBe('not-a-real-password');
        state.language = 'en';
        expect(
            find(page.render(), (element) => element.props.type === 'submit').props.children,
        ).toBe('Verifying…');
        expect(
            find(page.render(), (element) => element.props.id === 'login-password').props.value,
        ).toBe('not-a-real-password');
        resolve({ success: false, needsTotp: true });
        await pending;
        expect(onLogin).toHaveBeenCalledExactlyOnceWith('not-a-real-password');
        expect(named(page.render(), 'OtpInput').props.autoFocus).toBe(true);
        expect(named(page.render(), 'OtpInput').props.label).toBe('Verification code');
        expect(
            elements(page.render()).some((element) => element.props.id === 'login-password'),
        ).toBe(false);
        expect(state.removeCustomCss).toHaveBeenCalledOnce();
    });
});
