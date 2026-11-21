import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as React from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import type * as I18nModule from '../src/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveActivity, type Activity } from '../src/components/interior/live-activity';
import { CollapsibleBanner } from '../src/components/interior/collapsible-banner';
import {
    ActionFeedbackProvider,
    ActionFeedbackViewport,
    useActionFeedback,
} from '../src/contexts/ActionFeedbackContext';
import { elements, hookHost } from './helpers/hook-host';

const preferences = vi.hoisted(() => ({ reduced: false, present: true }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.defaultTranslate };
});
vi.mock('react', async (original) => {
    const react = await original<typeof import('react')>();
    return {
        ...react,
        useEffect: vi.fn(react.useEffect),
        useLayoutEffect: vi.fn(react.useLayoutEffect),
    };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotion: () => false,
    useReducedMotionConfig: () => preferences.reduced,
    useIsPresent: () => preferences.present,
}));

let host: ReturnType<typeof hookHost>;
let noticeHost: ReturnType<typeof hookHost>;
let viewportHooks: ReturnType<typeof hookHost>;
let resize: (() => void)[];

beforeEach(() => {
    host = hookHost();
    noticeHost = hookHost();
    viewportHooks = hookHost();
    resize = [];
    preferences.reduced = false;
    preferences.present = true;
    vi.useFakeTimers();
    vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: vi.fn() });
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(callback: () => void) {
                resize.push(callback);
            }
            observe() {}
            disconnect() {}
        },
    );
});
afterEach(() => {
    host.unmount();
    noticeHost.unmount();
    viewportHooks.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function measure(tree: ReactNode, values: { w: number; h: number }[]) {
    elements(tree)
        .filter((item) => item.props.ref)
        .forEach((item, index) => {
            (item.props.ref as RefObject<unknown>).current = {
                offsetWidth: values[index].w,
                offsetHeight: values[index].h,
            };
        });
    resize.at(-1)?.();
}

function geometry(tree: ReactNode) {
    return elements(tree).filter(
        (item) => (item.props.animate as { height?: unknown } | undefined)?.height !== undefined,
    );
}

const activity = (patch: Partial<Activity> = {}): Activity => ({
    id: 'first',
    title: '正在加载',
    detail: 'PID 100',
    phase: 'running',
    ...patch,
});
const expandedFace = (tree: ReactNode) =>
    elements(tree).find((item) => String(item.props.className).includes('px-3.5 py-3'))!;

describe('LiveActivity geometry and presence', () => {
    it('starts in its expanded peek without a compact first frame', () => {
        const tree = host.render(() => LiveActivity({ activity: activity() }));
        expect(expandedFace(tree).props['aria-hidden']).toBe(false);
        const pod = elements(tree).find((item) => item.props.exit)!;
        expect(
            elements(tree).find((item) => item.props.role === 'region')!.props['aria-busy'],
        ).toBe(true);
        expect(pod.props.role).toBe('group');
        expect(pod.props['aria-label']).toBe('正在加载：PID 100');
        expect(pod.props.tabIndex).toBe(0);
        expect(pod.props.exit).toMatchObject({ height: 0 });
    });

    it('keeps the compact target on progress updates after the peek finishes', () => {
        let current = activity();
        const render = () => host.render(() => LiveActivity({ activity: current }));
        render();
        measure(render(), [
            { w: 116, h: 32 },
            { w: 300, h: 72 },
        ]);
        vi.advanceTimersByTime(2_600);
        render();
        expect(expandedFace(render()).props['aria-hidden']).toBe(true);
        current = { ...current, progress: 0.5 };
        render();
        expect(expandedFace(render()).props['aria-hidden']).toBe(true);
    });

    it('retains valid geometry when a replacement measurement is hidden or zero-sized', () => {
        let current = activity();
        const render = () => host.render(() => LiveActivity({ activity: current }));
        render();
        measure(render(), [
            { w: 116, h: 32 },
            { w: 300, h: 72 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ width: 300, height: 72 });
        vi.advanceTimersByTime(2_600);
        render();
        expect(geometry(render())[0].props.animate).toMatchObject({ width: 116, height: 32 });
        current = activity({ id: 'second', detail: '新的操作' });
        measure(render(), [
            { w: 90, h: 32 },
            { w: 0, h: 0 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ width: 300, height: 72 });
        measure(render(), [
            { w: 90, h: 32 },
            { w: 300, h: 96 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ width: 300, height: 96 });
    });

    it.each([false, true])(
        'schedules running rotation on mount only when motion is enabled (reduced=%s)',
        async (reduced) => {
            preferences.reduced = reduced;
            const require = createRequire(import.meta.url);
            const motionDom = createRequire(require.resolve('motion')).resolve('motion-dom');
            const { createAnimationState } = await import(
                /* @vite-ignore */ pathToFileURL(
                    resolve(dirname(motionDom), '../es/render/utils/animation-state.mjs'),
                ).href
            );

            const spinnerProps = (progress: number) => {
                const tree = host.render(() => LiveActivity({ activity: activity({ progress }) }));
                const glyph = elements(tree).find(
                    (item) => typeof item.type === 'function' && item.type.name === 'PhaseGlyph',
                )!;
                const glyphTree = (glyph.type as (props: Record<string, unknown>) => ReactElement)(
                    glyph.props,
                );
                return elements(glyphTree).find((item) => item.props.viewBox === '0 0 12 12')!
                    .props;
            };

            const visualElement = {
                props: spinnerProps(0),
                getProps: () => visualElement.props,
                getValue: () => undefined,
            };
            const scheduled = vi.fn(() => Promise.resolve());
            const state = createAnimationState(visualElement);
            state.setAnimateFunction(() => scheduled);
            await state.animateChanges();
            expect(scheduled).toHaveBeenCalledTimes(reduced ? 0 : 1);

            if (reduced) {
                expect(visualElement.props.animate).toBeUndefined();
                expect(visualElement.props.transition).toEqual({ duration: 0 });
            } else {
                expect(scheduled).toHaveBeenCalledWith([
                    { animation: { rotate: 360 }, options: { type: 'animate' } },
                ]);
                expect(visualElement.props.transition).toEqual({
                    duration: 0.85,
                    ease: 'linear',
                    repeat: Infinity,
                });
            }

            visualElement.props = spinnerProps(0.5);
            await state.animateChanges();
            expect(scheduled).toHaveBeenCalledTimes(reduced ? 0 : 1);
        },
    );

    it.each(['success', 'error'] as const)('renders no running spinner for %s', (phase) => {
        const tree = host.render(() => LiveActivity({ activity: activity({ phase }) }));
        const glyph = elements(tree).find(
            (item) => typeof item.type === 'function' && item.type.name === 'PhaseGlyph',
        )!;
        const glyphTree = (glyph.type as (props: Record<string, unknown>) => ReactElement)(
            glyph.props,
        );
        expect(
            elements(glyphTree).some(
                (item) => (item.props.animate as { rotate?: number } | undefined)?.rotate === 360,
            ),
        ).toBe(false);
    });

    it('clears pending semantics and the spinner while the old pod is exiting', () => {
        let current: Activity | null = activity();
        const render = () => host.render(() => LiveActivity({ activity: current }));
        const running = render();
        preferences.present = false;
        const glyph = elements(running).find(
            (item) => typeof item.type === 'function' && item.type.name === 'PhaseGlyph',
        )!;
        expect(
            (glyph.type as (props: Record<string, unknown>) => ReactNode)(glyph.props),
        ).toBeNull();
        current = null;
        const region = elements(render()).find((item) => item.props.role === 'region')!;
        expect(region.props['aria-busy']).toBe(false);
        expect(region.props['aria-hidden']).toBe(true);
        expect(region.props.inert).toBe(true);
    });

    it('keeps hover and keyboard focus expanded and cancels a pending pointer leave', () => {
        const current = activity();
        const render = () => host.render(() => LiveActivity({ activity: current }));
        render();
        vi.advanceTimersByTime(2_600);
        let tree = render();
        const pod = () => elements(tree).find((item) => item.props.exit)!;
        (pod().props.onFocusCapture as () => void)();
        tree = render();
        expect(expandedFace(tree).props['aria-hidden']).toBe(false);
        (pod().props.onBlurCapture as (event: unknown) => void)({
            currentTarget: { contains: () => false },
            relatedTarget: null,
        });
        tree = render();
        expect(expandedFace(tree).props['aria-hidden']).toBe(true);
        (pod().props.onPointerEnter as () => void)();
        tree = render();
        (pod().props.onPointerLeave as () => void)();
        vi.advanceTimersByTime(159);
        (pod().props.onPointerEnter as () => void)();
        vi.advanceTimersByTime(1);
        tree = render();
        expect(expandedFace(tree).props['aria-hidden']).toBe(false);
    });

    it('disables all geometry and presence motion through MotionConfig', () => {
        preferences.reduced = true;
        const tree = host.render(() => LiveActivity({ activity: activity() }));
        const pod = elements(tree).find((item) => item.props.exit)!;
        expect(pod.props.initial).toBe(false);
        expect(pod.props.transition).toEqual({ duration: 0 });
        expect(pod.props.exit).toMatchObject({ transition: { duration: 0 } });
    });
});

describe('CollapsibleBanner geometry and dismissal', () => {
    it('uses one measured height target for entry, folding and content updates', () => {
        let state: 'open' | 'folded' = 'open';
        const render = () =>
            host.render(() =>
                CollapsibleBanner({
                    state,
                    title: '加载完成',
                    description: 'PID 100',
                }),
            );
        let tree = render();
        expect(geometry(tree)).toHaveLength(1);
        measure(tree, [
            { w: 340, h: 88 },
            { w: 338, h: 40 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ height: 88 });
        state = 'folded';
        expect(geometry(render())[0].props.animate).toMatchObject({ height: 48 });
        state = 'open';
        tree = render();
        measure(tree, [
            { w: 340, h: 120 },
            { w: 338, h: 72 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ height: 120 });
        measure(render(), [
            { w: 0, h: 0 },
            { w: 0, h: 0 },
        ]);
        expect(geometry(render())[0].props.animate).toMatchObject({ height: 120 });
    });

    it('removes an immediately dismissed reduced-motion notice without waiting for animation', () => {
        preferences.reduced = true;
        const removed = vi.fn();
        let state: 'open' | 'dismissed' = 'open';
        const render = () =>
            host.render(() =>
                CollapsibleBanner({
                    state,
                    title: '已完成',
                    onDismissed: removed,
                }),
            );
        render();
        state = 'dismissed';
        render();
        expect(removed).toHaveBeenCalledOnce();
        const shell = geometry(render())[0];
        (shell.props.onAnimationComplete as () => void)();
        expect(removed).toHaveBeenCalledOnce();
    });

    it('keeps dismissed controls inert and waits for the current exit before removal', () => {
        const removed = vi.fn();
        let state: 'open' | 'dismissed' = 'open';
        const render = () =>
            host.render(() =>
                CollapsibleBanner({
                    state,
                    title: '完成',
                    description: '详情',
                    onDismissed: removed,
                }),
            );
        render();
        state = 'dismissed';
        let tree = render();
        const region = elements(tree).find((item) => item.props.role === 'region')!;
        expect(region.props.inert).toBe(true);
        expect(removed).not.toHaveBeenCalled();
        state = 'open';
        tree = render();
        (geometry(tree)[0].props.onAnimationComplete as () => void)();
        expect(removed).not.toHaveBeenCalled();
        state = 'dismissed';
        tree = render();
        (geometry(tree)[0].props.onAnimationComplete as () => void)();
        expect(removed).toHaveBeenCalledOnce();
    });
});

function feedback(): ReturnType<typeof useActionFeedback> {
    return host.render(() => ActionFeedbackProvider({ children: null })).props.value;
}

function viewport(value: ReturnType<typeof feedback>) {
    vi.spyOn(React, 'useContext').mockReturnValue(value);
    return viewportHooks.render(() => ActionFeedbackViewport());
}

function noticeRenderer(value: ReturnType<typeof feedback>) {
    const notice = elements(viewport(value)).find(
        (item) => typeof item.type === 'function' && item.type.name === 'ActionNoticeBanner',
    )!;
    return () =>
        noticeHost.render(() =>
            (notice.type as (props: Record<string, unknown>) => ReactElement)(notice.props),
        );
}

const banner = (tree: ReactNode) => elements(tree).find((item) => item.type === CollapsibleBanner)!;

describe('ActionFeedbackProvider running-to-result lifecycle', () => {
    it('hands running feedback to an already-open terminal notice and removes it after exit', () => {
        const handle = feedback().startAction({ title: '正在加载', detail: 'PID 100' });
        let value = feedback();
        expect(
            elements(viewport(value)).find((item) => item.type === LiveActivity)!.props.activity,
        ).toMatchObject({ phase: 'running', title: '正在加载' });
        handle.succeed({ title: '已加载', detail: '等待管道连接' });
        value = feedback();
        expect(
            elements(viewport(value)).find((item) => item.type === LiveActivity)!.props.activity,
        ).toBeNull();
        const render = noticeRenderer(value);
        let tree = render();
        expect(banner(tree).props).toMatchObject({
            state: 'open',
            title: '已加载',
            description: '等待管道连接',
        });
        expect(elements(tree).some((item) => item.props.role === 'status')).toBe(true);
        expect(
            elements(tree).some((item) => item.props['data-action-feedback-countdown'] === ''),
        ).toBe(true);
        vi.advanceTimersByTime(4_999);
        expect(banner(render()).props.state).toBe('open');
        vi.advanceTimersByTime(1);
        tree = render();
        expect(banner(tree).props.state).toBe('dismissed');
        expect(feedback().notices).toHaveLength(1);
        (banner(tree).props.onDismissed as () => void)();
        expect(feedback().notices).toHaveLength(0);
    });

    it('isolates late completion and progress from a newer running operation', () => {
        const earlier = feedback().startAction({ title: '较早的加载' });
        const current = feedback().startAction({ title: '正在卸载' });
        earlier.update({ title: '过期进度', progress: 0.5 });
        earlier.fail('加载被拒绝');
        let value = feedback();
        expect(value.activity).toMatchObject({ phase: 'running', title: '正在卸载' });
        expect(value.notices).toMatchObject([{ tone: 'error', detail: '加载被拒绝' }]);
        const render = noticeRenderer(value);
        expect(elements(render()).some((item) => item.props.role === 'alert')).toBe(true);
        current.succeed({ title: '卸载完成' });
        value = feedback();
        expect(value.notices).toMatchObject([
            { tone: 'error' },
            { tone: 'success', title: '卸载完成' },
        ]);
    });

    it('preserves transport rejections and resolved domain errors as failed notices', async () => {
        const result = { ok: false, error: '管道关闭超时' };
        await expect(
            feedback().runAction(
                {
                    title: '卸载',
                    resultError: (value: typeof result) => (value.ok ? null : value.error),
                },
                () => result,
            ),
        ).resolves.toBe(result);
        expect(feedback().notices).toMatchObject([{ tone: 'error', detail: '管道关闭超时' }]);
        const rejection = new Error('权限不足');
        await expect(
            feedback().runAction({ title: '加载' }, () => Promise.reject(rejection)),
        ).rejects.toBe(rejection);
        expect(feedback().notices).toMatchObject([
            { tone: 'error' },
            { tone: 'error', detail: '权限不足' },
        ]);
    });

    it('retains a failed result when setup feedback hosts are replaced and removed', async () => {
        const failure = new Error('TLS 证书读取失败');
        await expect(
            feedback().runAction({ title: '保存设置', errorTitle: '保存失败' }, () =>
                Promise.reject(failure),
            ),
        ).rejects.toBe(failure);
        const leaveFirst = feedback().registerViewportHost({} as HTMLElement);
        const leaveCurrent = feedback().registerViewportHost({} as HTMLElement);
        leaveFirst();
        const render = noticeRenderer(feedback());

        const expectFailure = () => {
            const tree = render();
            expect(elements(tree).some((item) => item.props.role === 'alert')).toBe(true);
            expect(banner(tree).props).toMatchObject({
                state: 'open',
                title: '保存失败',
                description: 'TLS 证书读取失败',
            });
        };

        expectFailure();
        leaveCurrent();
        expectFailure();
    });

    it('uses discrete countdown text with no motion and preserves the original dismissal deadline', () => {
        feedback().startAction({ title: '已完成' }).succeed();
        const render = noticeRenderer(feedback());
        render();
        vi.advanceTimersByTime(2_000);
        preferences.reduced = true;
        render();
        let tree = render();
        const countdown = () =>
            elements(tree).find((item) => item.props['data-action-feedback-countdown'] === '')!;
        expect(countdown().props.animate).toBeUndefined();
        expect(countdown().props.children).toEqual([3, ' 秒后关闭']);
        vi.advanceTimersByTime(1_000);
        tree = render();
        expect(countdown().props.children).toEqual([2, ' 秒后关闭']);
        vi.advanceTimersByTime(500);
        preferences.reduced = false;
        render();
        tree = render();
        expect(countdown().props.initial).toEqual({ scaleX: 0.3 });
        expect(countdown().props.transition).toEqual({ duration: 1.5, ease: 'linear' });
        vi.advanceTimersByTime(1_499);
        expect(banner(render()).props.state).toBe('open');
        vi.advanceTimersByTime(1);
        expect(banner(render()).props.state).toBe('dismissed');
    });

    it.each(['dismissed', 'unmounted'])('cancels countdown work when a notice is %s', (ending) => {
        preferences.reduced = true;
        feedback().startAction({ title: '完成' }).succeed();
        const render = noticeRenderer(feedback());
        let tree = render();
        expect(vi.getTimerCount()).toBeGreaterThan(0);

        if (ending === 'dismissed') {
            (banner(tree).props.onStateChange as (state: string) => void)('dismissed');
            tree = render();
            expect(banner(tree).props.state).toBe('dismissed');
        } else {
            noticeHost.unmount();
        }

        // Only the provider's existing terminal linger remains.
        expect(vi.getTimerCount()).toBe(1);
        noticeHost.unmount();
        host.unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
