import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PasswordStrength,
    defaultPasswordRules,
    type PasswordRule,
} from '../src/components/interior/password-strength';
import { DEMO_NEW_PASSWORD } from '../src/demo/constants';
import { ChangePasswordForm } from '../src/components/pages/change-password-form';
import { InlineValidation } from '../src/components/interior/inline-validation';
import type * as I18n from '../src/i18n';
import { elements, hookHost } from './helpers/hook-host';

const language = vi.hoisted(() => ({ current: 'zh' as I18n.Language }));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return {
        ...locale,
        useT: () => locale.translator(language.current),
        useLocale: () => ({
            language: language.current,
            locale: language.current === 'en' ? 'en' : 'zh-CN',
            locked: false,
            setLanguage: vi.fn(),
        }),
    };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));

vi.mock('@/contexts/ActionFeedbackContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/ActionFeedbackContext')>()),
    useActionFeedback: () => ({ runAction: vi.fn() }),
}));
vi.mock('@/contexts/ThemeContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/ThemeContext')>()),
    useTheme: () => ({ appearance: { reduceMotion: true, disableMotion: false } }),
}));

const LABELS = ['未输入', '很弱', '较弱', '一般', '良好', '强'];
const DEMO_RULE: PasswordRule = {
    id: 'demo-only',
    label: '仅输入示例',
    test: (value) => value === DEMO_NEW_PASSWORD,
};
const rulesWithResults = (...results: boolean[]): PasswordRule[] =>
    results.map((met, index) => ({
        id: `rule-${index}`,
        label: `要求 ${index + 1}`,
        test: () => met,
    }));
let host: ReturnType<typeof hookHost>;
let formHost: ReturnType<typeof hookHost>;
const render = (props: ComponentProps<typeof PasswordStrength>) =>
    host.render(() => PasswordStrength(props));
const meter = (tree: ReactNode) => elements(tree).find((item) => item.props.role === 'meter')!;
const fills = (tree: ReactNode) =>
    elements(meter(tree)).filter((item) =>
        String(item.props.className).includes('absolute inset-0 origin-left'),
    );
const activeLabel = (tree: ReactNode) =>
    elements(tree).find(
        (item) =>
            String(item.props.className).includes('col-start-1 row-start-1') &&
            (item.props.animate as { opacity?: number }).opacity === 1,
    )!;

const expectAssessment = (
    tree: ReactNode,
    score: number,
    max: number,
    label: string,
    tone: string,
) => {
    expect(meter(tree).props).toMatchObject({
        'aria-valuemin': 0,
        'aria-valuenow': score,
        'aria-valuemax': max,
        'aria-valuetext': label,
    });
    expect(activeLabel(tree).props.children).toBe(label);
    expect(activeLabel(tree).props.className).toContain(`text-${tone}`);
    expect(fills(tree)).toHaveLength(max);
    fills(tree).forEach((fill, index) => {
        expect(fill.props.animate).toEqual({ scaleX: index < score ? 1 : 0 });
        expect(fill.props.className).toContain(`bg-${tone}`);
    });
};

beforeEach(() => {
    language.current = 'zh';
    vi.useFakeTimers();
    host = hookHost();
    formHost = hookHost();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
    host.unmount();
    formHost.unmount();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('PasswordStrength normalized assessment', () => {
    it('aligns a passed single demo rule with six labels in the rendered meter and announcement', () => {
        const props = { value: DEMO_NEW_PASSWORD, rules: [DEMO_RULE], labels: LABELS };
        const tree = render(props);
        expectAssessment(tree, 5, 5, '强', 'success');
        expect(elements(tree).some((item) => item.props.children === DEMO_RULE.label)).toBe(true);
        expect(elements(tree).some((item) => item.props.children === '已满足')).toBe(true);
        expect(elements(tree).find((item) => item.props['aria-live'])?.props.children).toBe('');
        vi.advanceTimersByTime(700);
        expect(
            elements(render(props)).find((item) => item.props['aria-live'])?.props.children,
        ).toBe('密码强度强。 已满足全部要求。');
    });

    it.each([
        { rules: defaultPasswordRules, labels: undefined, max: 4 },
        { rules: rulesWithResults(true, true, true, true, true), labels: LABELS, max: 5 },
        { rules: rulesWithResults(true, true), labels: LABELS, max: 5 },
    ])(
        'maps all met default/production/custom rules to the last display step ($max)',
        (options) => {
            expectAssessment(
                render({ value: 'N7!xL9@vT2#z', ...options }),
                options.max,
                options.max,
                '强',
                'success',
            );
        },
    );

    it('floors partial progress and preserves every rule result', () => {
        const tree = render({
            value: 'N7!xL9@vT2#z',
            rules: rulesWithResults(true, true, true, false),
            labels: LABELS,
        });
        expectAssessment(tree, 3, 5, '一般', 'warning');
        expect(elements(tree).filter((item) => item.props.children === '已满足')).toHaveLength(3);
        expect(elements(tree).filter((item) => item.props.children === '未满足')).toHaveLength(1);
    });

    it.each(['password!2026', 'zzzzN7!xL9', 'AbcdN7!xL9'])(
        'caps a guessable single passed rule (%s) without changing its result',
        (value) => {
            const props = { value, rules: rulesWithResults(true), labels: LABELS };
            expectAssessment(render(props), 1, 5, '很弱', 'destructive');
            vi.advanceTimersByTime(700);
            const tree = render(props);
            expect(elements(tree).some((item) => item.props.children === '已满足')).toBe(true);
            expect(
                elements(tree).find((item) => item.props.children === '容易被猜中')?.props.animate,
            ).toEqual({ opacity: 1 });
            expect(elements(tree).find((item) => item.props['aria-live'])?.props.children).toBe(
                '密码强度很弱。 这是容易被猜中的常见模式。 已满足全部要求。',
            );
        },
    );

    it.each([
        { rules: [] },
        { rules: rulesWithResults(false) },
        { rules: rulesWithResults(false, false, false, false, false) },
    ])('does not fill an unknown or unmet assessment ($rules.length rules)', ({ rules }) => {
        const props = { value: 'N7!xL9@vT2#z', rules, labels: LABELS };
        expectAssessment(render(props), 1, 5, '很弱', 'destructive');
        vi.advanceTimersByTime(700);
        const announcement = elements(render(props)).find((item) => item.props['aria-live'])?.props
            .children;
        expect(announcement).not.toContain('已满足全部要求');

        if (rules.length === 0) {
            expect(announcement).toBe('密码强度很弱。 尚未获取密码要求。');
        }
    });

    it('keeps an empty password neutral even if a custom rule passes', () => {
        const tree = render({ value: '', rules: rulesWithResults(true), labels: LABELS });
        expectAssessment(tree, 0, 5, '未输入', 'muted-foreground');
        vi.advanceTimersByTime(700);
        expect(
            elements(render({ value: '', rules: [], labels: LABELS })).find(
                (item) => item.props['aria-live'],
            )?.props.children,
        ).toBe('');
    });

    it.each([{ labels: [] }, { labels: ['自定义'] }, { labels: ['未输入', '强'] }])(
        'uses the default scale for insufficient labels ($labels.length labels)',
        ({ labels }) => {
            const props = { value: 'N7!xL9@vT2#z', rules: rulesWithResults(true), labels };
            expectAssessment(render(props), 4, 4, '强', 'success');
            expectAssessment(
                render({ ...props, value: 'password!2026' }),
                1,
                4,
                '弱',
                'destructive',
            );
            expectAssessment(render({ ...props, rules: [] }), 1, 4, '弱', 'destructive');
        },
    );

    it('keeps a three-label weak step below full and outside the success tone', () => {
        expectAssessment(
            render({
                value: 'password!2026',
                rules: rulesWithResults(true),
                labels: ['未输入', '弱', '强'],
            }),
            1,
            2,
            '弱',
            'warning',
        );
    });

    it('cancels the previous announcement and clears it when the password is emptied', () => {
        render({ value: DEMO_NEW_PASSWORD, rules: [DEMO_RULE], labels: LABELS });
        vi.advanceTimersByTime(600);
        render({ value: 'short', rules: [DEMO_RULE], labels: LABELS });
        vi.advanceTimersByTime(100);
        expect(
            elements(render({ value: 'short', rules: [DEMO_RULE], labels: LABELS })).find(
                (item) => item.props['aria-live'],
            )?.props.children,
        ).toBe('');
        vi.advanceTimersByTime(600);
        expect(
            elements(render({ value: 'short', rules: [DEMO_RULE], labels: LABELS })).find(
                (item) => item.props['aria-live'],
            )?.props.children,
        ).toBe('密码强度很弱。 仍需满足：仅输入示例。');
        render({ value: '', rules: [DEMO_RULE], labels: LABELS });
        expect(
            elements(render({ value: '', rules: [DEMO_RULE], labels: LABELS })).find(
                (item) => item.props['aria-live'],
            )?.props.children,
        ).toBe('');
    });
});

function formHarness(checkStrength: ComponentProps<typeof ChangePasswordForm>['checkStrength']) {
    const renderActions = vi.fn<
        NonNullable<ComponentProps<typeof ChangePasswordForm>['renderActions']>
    >(() => null);
    const props = {
        knownOldPassword: 'fixture-old',
        checkStrength,
        submit: vi.fn(),
        onSuccess: vi.fn(),
        renderActions,
    };
    const form = () => formHost.render(() => ChangePasswordForm(props));
    const field = (id: string) =>
        elements(form()).find((item) => item.type === InlineValidation && item.props.id === id)!;

    const input = (value: string) => {
        (field('cpw-new').props.onChange as (value: string) => void)(value);
        (field('cpw-confirm').props.onChange as (value: string) => void)(value);
        (field('cpw-new').props.onFocus as () => void)();
        form();
    };

    return {
        form,
        input,
        field,
        assessment: () => {
            const strength = elements(form()).find((item) => item.type === PasswordStrength)!;
            return render(strength.props as ComponentProps<typeof PasswordStrength>);
        },
        actions: () => {
            form();
            return renderActions.mock.lastCall?.[0];
        },
    };
}

describe('ChangePasswordForm server validation and normalized display', () => {
    it('keeps the entered password and strength result when switching languages', async () => {
        const checkStrength = vi.fn(async () => ({
            rules: [{ id: 'length', label: '长度不少于 10 位', ok: true }],
            valid: true,
        }));
        const form = formHarness(checkStrength);
        form.input(DEMO_NEW_PASSWORD);
        await vi.advanceTimersByTimeAsync(180);
        expect(form.actions()).toMatchObject({ canSubmit: true, submitLabel: '保存新密码' });

        language.current = 'en';
        expect(form.field('cpw-new').props).toMatchObject({
            label: 'New password',
            value: DEMO_NEW_PASSWORD,
        });
        expect(form.field('cpw-confirm').props).toMatchObject({
            label: 'Confirm new password',
            value: DEMO_NEW_PASSWORD,
        });
        expect(form.actions()).toMatchObject({ canSubmit: true, submitLabel: 'Save new password' });
        expect(
            elements(form.assessment()).some(
                (item) => item.props.children === 'At least 10 characters',
            ),
        ).toBe(true);
        await vi.advanceTimersByTimeAsync(180);
        expect(checkStrength).toHaveBeenCalledExactlyOnceWith(DEMO_NEW_PASSWORD);
    });

    it('keeps server validity distinct from heuristic strength and preserves the 180 ms debounce', async () => {
        const rules = [{ id: 'server-rule', label: '服务器要求', ok: true }];
        const checkStrength = vi
            .fn<ComponentProps<typeof ChangePasswordForm>['checkStrength']>()
            .mockResolvedValueOnce({ rules, valid: false })
            .mockResolvedValueOnce({ rules, valid: true });
        const form = formHarness(checkStrength);
        form.input(DEMO_NEW_PASSWORD);
        expectAssessment(form.assessment(), 1, 5, '很弱', 'destructive');
        expect(form.actions()).toMatchObject({ canAttempt: true, canSubmit: false });
        await vi.advanceTimersByTimeAsync(179);
        expect(checkStrength).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(checkStrength).toHaveBeenCalledExactlyOnceWith(DEMO_NEW_PASSWORD);
        expectAssessment(form.assessment(), 5, 5, '强', 'success');
        expect(form.actions()).toMatchObject({ canAttempt: true, canSubmit: false });

        form.input('password!2026');
        expect(form.actions()).toMatchObject({ canSubmit: false });
        await vi.advanceTimersByTimeAsync(180);
        expectAssessment(form.assessment(), 1, 5, '很弱', 'destructive');
        expect(form.actions()).toMatchObject({ canSubmit: true });
    });

    it('does not let a late passed rule replace the current password assessment', async () => {
        const previous = Promise.withResolvers<{
            rules: { id: string; label: string; ok: boolean }[];
            valid: boolean;
        }>();
        const current = Promise.withResolvers<{
            rules: { id: string; label: string; ok: boolean }[];
            valid: boolean;
        }>();
        const checkStrength = vi
            .fn<ComponentProps<typeof ChangePasswordForm>['checkStrength']>()
            .mockReturnValueOnce(previous.promise)
            .mockReturnValueOnce(current.promise);
        const form = formHarness(checkStrength);
        form.input(DEMO_NEW_PASSWORD);
        await vi.advanceTimersByTimeAsync(180);
        form.input('N7!xL9@vT2#z');
        previous.resolve({ rules: [{ id: 'old', label: '旧要求', ok: true }], valid: true });
        await vi.advanceTimersByTimeAsync(180);
        expect(checkStrength).toHaveBeenNthCalledWith(2, 'N7!xL9@vT2#z');
        expectAssessment(form.assessment(), 1, 5, '很弱', 'destructive');
        expect(form.actions()).toMatchObject({ canSubmit: false });
        expect(elements(form.form()).some((item) => item.props['aria-busy'] === true)).toBe(true);
        current.resolve({ rules: [{ id: 'current', label: '当前要求', ok: false }], valid: false });
        await vi.advanceTimersByTimeAsync(0);
        expectAssessment(form.assessment(), 1, 5, '很弱', 'destructive');
        expect(elements(form.assessment()).some((item) => item.props.children === '当前要求')).toBe(
            true,
        );
        expect(form.actions()).toMatchObject({ canSubmit: false });
    });

    it.each(['request failure', 'empty rules'])(
        'keeps %s visible and unaccepted',
        async (failure) => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            const checkStrength =
                vi.fn<ComponentProps<typeof ChangePasswordForm>['checkStrength']>();

            if (failure === 'request failure') {
                checkStrength.mockRejectedValue(new Error('网络错误'));
            } else {
                checkStrength.mockResolvedValue({ rules: [], valid: true });
            }

            const form = formHarness(checkStrength);
            form.input(DEMO_NEW_PASSWORD);
            await vi.advanceTimersByTimeAsync(180);
            const tree = form.assessment();
            expectAssessment(tree, 1, 5, '很弱', 'destructive');
            expect(elements(tree).find((item) => item.props.role === 'alert')?.props.children).toBe(
                `密码强度校验失败：${failure === 'request failure' ? '网络错误' : '服务器未返回密码强度规则'}`,
            );
            expect(form.actions()).toMatchObject({ canAttempt: true, canSubmit: false });
            expect(elements(form.form()).some((item) => item.props['aria-busy'] === true)).toBe(
                false,
            );
        },
    );
});
