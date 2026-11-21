import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import type { UiAppearance } from '@nowluma/common/webui-appearance';
import {
    DisplayEffectsControls,
    DisplayEffectsOnboardingStep,
} from '../src/components/display-effects';
import { Segmented } from '../src/components/settings/settings-controls';
import { Button } from '../src/components/ui/button';
import { ToggleSwitch } from '../src/components/ui/toggle-switch';
import { elements, hookHost } from './helpers/hook-host';
import type { PerformanceMode } from '../src/lib/performance-mode';
import { defaultTranslate, LocaleProvider, translator, useT } from '../src/i18n';
import type * as I18n from '../src/i18n';

type EffectsPatch = Partial<Pick<UiAppearance, 'disableMotion' | 'performanceMode'>>;
const mocks = vi.hoisted(() => ({
    theme: {
        ready: true,
        appearance: {} as UiAppearance,
        performance: { mode: 'high' as PerformanceMode, low: false },
        saveAppearance: vi.fn<(patch: EffectsPatch) => Promise<void>>(),
        setAppearancePreview: vi.fn<(patch: EffectsPatch) => void>(),
    },
    next: vi.fn(),
    runAction: vi.fn(async (_options: unknown, action: () => Promise<unknown>) => action()),
}));
vi.mock('react', async (load) => ({ ...(await load<Record<string, unknown>>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    // Direct invocations in hook-host tests do not have a React dispatcher.
    return { ...locale, useT: vi.fn(locale.useT) };
});
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => mocks.theme }));
vi.mock('@/contexts/ActionFeedbackContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useActionFeedback: () => ({ runAction: mocks.runAction }),
}));
vi.mock('@/components/interior/wizard-steps', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useWizardNavigation: () => ({ next: mocks.next }),
}));

let host = hookHost();
let token: string | null;
let language: I18n.Language;
const localWrites = vi.fn();
const localReads = vi.fn<(key: string) => string | null>();

const step = (replay = false) => {
    vi.mocked(useT).mockReturnValueOnce(translator(language));
    return host.render(() => DisplayEffectsOnboardingStep({ replay }));
};

const controls = (replay = false) =>
    elements(step(replay)).find((element) => element.type === DisplayEffectsControls)!;
const advance = (replay = false) =>
    elements(step(replay)).find((element) => element.type === Button)!;

function choose(patch: EffectsPatch, replay = false) {
    (controls(replay).props.onChange as (patch: EffectsPatch) => void)(patch);
    step(replay);
}

beforeEach(() => {
    vi.clearAllMocks();
    host = hookHost();
    token = 'fixture-session';
    language = 'zh';
    mocks.theme.ready = true;
    mocks.theme.appearance = structuredClone(DEFAULT_APPEARANCE);
    mocks.theme.performance = { mode: 'high', low: false };
    mocks.theme.saveAppearance.mockResolvedValue(undefined);
    localReads.mockImplementation((key) => (key === 'nowluma_token' ? token : null));
    vi.stubGlobal('localStorage', { getItem: localReads, setItem: localWrites });
    vi.stubGlobal(
        'window',
        Object.assign(new EventTarget(), { matchMedia: () => ({ matches: false }) }),
    );
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('display effects locale and tutorial controls', () => {
    it('marks the Settings switch and shared preview figure in the rendered DOM', () => {
        const view = (requireExplicit: boolean) =>
            renderToStaticMarkup(
                <LocaleProvider fixed="en">
                    <DisplayEffectsControls
                        value={{ disableMotion: true, performanceMode: 'low' }}
                        onChange={vi.fn()}
                        requireExplicit={requireExplicit}
                    />
                </LocaleProvider>,
            );
        const settings = view(false);
        expect(settings).toMatch(
            /<button(?=[^>]*role="switch")(?=[^>]*aria-label="Motion")(?=[^>]*data-tutorial-control="motion-setting")[^>]*>/,
        );
        expect(settings).toMatch(
            /<figure(?=[^>]*aria-label="Display effects preview")(?=[^>]*data-tutorial-control="effect-preview")[^>]*>/,
        );
        expect(settings).toContain('Frosted glass');
        expect(view(true)).not.toContain('motion-setting');
    });
});
describe('shared manual display controls', () => {
    it('maps the positive motion switch to disableMotion without coupling it to glass quality', () => {
        const onChange = vi.fn();
        vi.mocked(useT).mockReturnValueOnce(defaultTranslate);
        const tree = DisplayEffectsControls({
            value: { disableMotion: true, performanceMode: 'low' },
            onChange,
        });
        const toggle = elements(tree).find((element) => element.type === ToggleSwitch)!;
        expect(toggle.props.ariaLabel).toBe('动效');
        expect(toggle.props.value).toBe(false);
        (toggle.props.onChange as (enabled: boolean) => void)(true);
        expect(onChange).toHaveBeenLastCalledWith({ disableMotion: false });
        const quality = elements(tree).find((element) => element.type === Segmented)!;
        expect(quality.props.options).toEqual([
            { value: 'high', label: '完整玻璃' },
            { value: 'low', label: '磨砂玻璃' },
        ]);
        (quality.props.onChange as (quality: PerformanceMode) => void)('high');
        expect(onChange).toHaveBeenLastCalledWith({ performanceMode: 'high' });
    });

    it('leaves both OOBE choices visibly and accessibly unselected until the user chooses', () => {
        const html = renderToStaticMarkup(
            <DisplayEffectsControls
                value={{ disableMotion: null, performanceMode: null }}
                onChange={vi.fn()}
                requireExplicit
            />,
        );
        expect(html).not.toMatch(/role="radio"[^>]*aria-checked="true"/);
        expect(html).toMatch(/role="radio"[^>]*aria-checked="false"[^>]*tabindex="0"/);
    });
});

describe('Display effects onboarding save/replay boundary', () => {
    it('requires both explicit choices and never writes or forces high quality merely by mounting', () => {
        expect(advance().props.disabled).toBe(true);
        expect(controls().props.value).toEqual({ disableMotion: null, performanceMode: null });
        expect(mocks.theme.setAppearancePreview).not.toHaveBeenCalled();
        expect(mocks.theme.saveAppearance).not.toHaveBeenCalled();
        choose({ disableMotion: true });
        expect(advance().props.disabled).toBe(true);
        choose({ performanceMode: 'low' });
        expect(advance().props.disabled).toBe(false);
        expect(mocks.theme.setAppearancePreview).toHaveBeenLastCalledWith({
            performanceMode: 'low',
        });
        expect(mocks.theme.saveAppearance).not.toHaveBeenCalled();
        expect(localWrites).not.toHaveBeenCalled();
    });

    it('advances exactly once only after the explicit authenticated save has settled', async () => {
        const pending = Promise.withResolvers<void>();
        mocks.theme.saveAppearance.mockReturnValueOnce(pending.promise);
        choose({ disableMotion: true, performanceMode: 'low' });
        language = 'en';
        expect(controls().props.value).toEqual({ disableMotion: true, performanceMode: 'low' });
        expect(String(advance().props.children)).toContain('Save and continue');
        const click = advance().props.onClick as () => void;
        click();
        click();
        expect(mocks.theme.saveAppearance).toHaveBeenCalledOnce();
        expect(mocks.theme.saveAppearance).toHaveBeenCalledWith({
            disableMotion: true,
            performanceMode: 'low',
        });
        expect(mocks.runAction).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Saving display effects',
                successTitle: 'Display effects saved',
            }),
            expect.any(Function),
        );
        expect(mocks.next).not.toHaveBeenCalled();
        expect(advance().props.disabled).toBe(true);
        pending.resolve();
        await mocks.runAction.mock.results[0].value;
        expect(mocks.next).toHaveBeenCalledOnce();
    });

    it('keeps a failed save visible in the step and never releases the kernel stage', async () => {
        mocks.theme.saveAppearance.mockRejectedValueOnce(new Error('磁盘写入失败'));
        choose({ disableMotion: false, performanceMode: 'low' });
        (advance().props.onClick as () => void)();
        await vi.waitFor(() => {
            const alert = elements(step()).find((element) => element.props.role === 'alert');
            expect(alert?.props.children).toBe('磁盘写入失败');
        });
        expect(mocks.next).not.toHaveBeenCalled();
        expect(advance().props.disabled).toBe(false);
    });

    it('does not silently treat a missing session as a local-only completed save', () => {
        token = null;
        choose({ disableMotion: true, performanceMode: 'low' });
        (advance().props.onClick as () => void)();
        expect(mocks.theme.saveAppearance).not.toHaveBeenCalled();
        expect(mocks.next).not.toHaveBeenCalled();
        const alert = elements(step()).find((element) => element.props.role === 'alert');
        expect(alert?.props.children).toContain('登录已失效');
    });

    it('does not release the step when the session changes during saving', async () => {
        const pending = Promise.withResolvers<void>();
        mocks.theme.saveAppearance.mockReturnValueOnce(pending.promise);
        choose({ disableMotion: true, performanceMode: 'low' });
        (advance().props.onClick as () => void)();
        token = 'fixture-new-session';
        pending.resolve();
        await mocks.runAction.mock.results[0].value;
        expect(mocks.next).not.toHaveBeenCalled();
        const alert = elements(step()).find((element) => element.props.role === 'alert');
        expect(alert?.props.children).toContain('登录状态已变化');
    });

    it('does not advance an unmounted step when the initiated save later settles', async () => {
        const pending = Promise.withResolvers<void>();
        mocks.theme.saveAppearance.mockReturnValueOnce(pending.promise);
        choose({ disableMotion: true, performanceMode: 'low' });
        (advance().props.onClick as () => void)();
        host.unmount();
        host = hookHost();
        pending.resolve();
        await mocks.runAction.mock.results[0].value;
        expect(mocks.next).not.toHaveBeenCalled();
    });

    it('replays the same choices locally without reading tokens, saving preferences, or claiming they were saved', () => {
        choose({ disableMotion: false, performanceMode: 'low' }, true);
        const button = advance(true);
        expect(String(button.props.children)).toContain('应用预览并继续');
        (button.props.onClick as () => void)();
        expect(mocks.next).toHaveBeenCalledOnce();
        expect(mocks.theme.setAppearancePreview).toHaveBeenCalledWith({
            disableMotion: false,
            performanceMode: 'low',
        });
        expect(mocks.theme.saveAppearance).not.toHaveBeenCalled();
        expect(mocks.runAction).not.toHaveBeenCalled();
        expect(localReads).not.toHaveBeenCalled();
        expect(localWrites).not.toHaveBeenCalled();
    });
});
