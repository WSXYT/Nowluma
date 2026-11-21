import type { MouseEvent, PointerEvent, ReactNode } from 'react';
import type * as ReactModule from 'react';
import type * as MotionModule from 'motion/react';
import type * as I18nModule from '../src/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Picker } from '../src/components/ui/picker';
import { elements, hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof ReactModule>()) }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.defaultTranslate };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof MotionModule>()),
    useReducedMotionConfig: () => true,
}));

let host: HookHost;
beforeEach(() => {
    host = hookHost();
    vi.stubGlobal('document', new EventTarget());
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function trigger(tree: ReactNode) {
    return elements(tree).find((element) => element.props['aria-label'] === '选择目标')!;
}

function pointerClick(tree: ReactNode) {
    const button = trigger(tree);
    (button.props.onPointerDown as ((event: PointerEvent) => void) | undefined)?.({
        pointerType: 'mouse',
    } as PointerEvent);
    (button.props.onClick as (event: MouseEvent) => void)({ detail: 1 } as MouseEvent);
}

function renderPicker(onChange: (value: string) => void) {
    return host.render(() =>
        Picker({
            ariaLabel: '选择目标',
            value: '10001',
            options: [
                { value: '10001', label: '当前目标' },
                { value: '10002', label: '另一个目标' },
            ],
            onChange,
        }),
    );
}

function selectSecond(tree: ReactNode) {
    const option = elements(tree).filter((element) => element.props.role === 'option')[1];
    (option.props.onPointerDown as (event: PointerEvent) => void)({
        pointerType: 'mouse',
    } as PointerEvent);
}

describe('Picker pending-operation boundary', () => {
    it('rejects selection from an open menu when disabled and allows a fresh choice after settlement', () => {
        let disabled = false;
        const onChange = vi.fn();
        const render = () =>
            host.render(() =>
                Picker({
                    ariaLabel: '选择目标',
                    value: '10001',
                    options: [
                        { value: '10001', label: '当前目标' },
                        { value: '10002', label: '另一个目标' },
                    ],
                    onChange,
                    disabled,
                }),
            );
        (trigger(render()).props.onClick as (event: MouseEvent) => void)({} as MouseEvent);
        expect(trigger(render()).props['aria-expanded']).toBe(true);

        disabled = true;
        selectSecond(render());
        expect(onChange).not.toHaveBeenCalled();
        expect(trigger(render()).props['aria-expanded']).toBe(false);

        disabled = false;
        (trigger(render()).props.onClick as (event: MouseEvent) => void)({} as MouseEvent);
        selectSecond(render());
        expect(onChange).toHaveBeenCalledExactlyOnceWith('10002');
    });

    it('suppresses the selecting gesture only, not the next real pointer click', () => {
        const onChange = vi.fn();
        const render = () => renderPicker(onChange);
        pointerClick(render());
        selectSecond(render());
        (trigger(render()).props.onClick as (event: MouseEvent) => void)({
            detail: 1,
        } as MouseEvent);
        expect(trigger(render()).props['aria-expanded']).toBe(false);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('10002');

        pointerClick(render());
        expect(trigger(render()).props['aria-expanded']).toBe(true);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('10002');
    });

    it('opens a closed picker with Enter without submitting an unseen option', () => {
        const onChange = vi.fn();
        const render = () => renderPicker(onChange);
        const event = { key: 'Enter', preventDefault: vi.fn(), stopPropagation: vi.fn() };
        (render().props.onKeyDown as (event: unknown) => void)(event);
        expect(trigger(render()).props['aria-expanded']).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
        (render().props.onKeyDown as (event: unknown) => void)(event);
        expect(onChange).toHaveBeenCalledExactlyOnceWith('10001');
    });
});
