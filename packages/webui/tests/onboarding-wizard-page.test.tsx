import { renderToStaticMarkup } from 'react-dom/server';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingWizardPage } from '../src/components/pages/onboarding-wizard-page';
import { LocaleProvider, translator, useT } from '../src/i18n';
import type * as I18n from '../src/i18n';
import { WizardSteps, type WizardStep } from '../src/components/interior/wizard-steps';
import { SegmentedControl } from '../src/components/interior/segmented-control';
import { elements, hookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof React>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: vi.fn(locale.useT) };
});
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            palette: 'default',
            background: { type: 'none' },
            reduceMotion: true,
            disableMotion: true,
        },
        mode: 'system',
        setMode: vi.fn(),
    }),
    paletteResolved: () => false,
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: vi.fn() }),
    actionErrorMessage: (error: unknown) => String(error),
}));
afterEach(() => vi.restoreAllMocks());

const callbacks = {
    agreementVersion: 'fixture-agreements-version',
    onAccept: vi.fn(async () => ({ success: true })),
    onConsentComplete: vi.fn(),
    onDecline: vi.fn(),
    checkStrength: vi.fn(async () => ({ rules: [], valid: false })),
    submitPassword: vi.fn(async () => ({ success: true })),
    onPasswordComplete: vi.fn(),
    onComplete: vi.fn(),
};
const documents = [
    {
        id: 'eula' as const,
        title: '使用说明',
        declaredVersion: '1.0',
        effectiveDate: '2026-06-19',
        text: '# 阅读使用说明\n\n说明正文保持为主要阅读内容。',
    },
    {
        id: 'privacy' as const,
        title: '隐私说明',
        declaredVersion: '1.0',
        effectiveDate: '2026-06-19',
        text: '# 阅读隐私说明',
    },
];

describe('OnboardingWizardPage document workspace', () => {
    it('starts with readable instructions and keeps acknowledgment before passwords', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent
                mustChangePassword
            />,
        );
        expect(html).toContain('workspace-onboarding-document');
        expect(html).toContain('workspace-auth-artwork');
        expect(html).toContain('完成首次使用设置');
        expect(html).toContain('aria-label="首次使用设置步骤"');
        expect(html).toContain('aria-current="step"');
        expect(html).toContain('阅读使用说明');
        expect(html).toContain('说明正文保持为主要阅读内容。');
        expect(html).toContain('aria-label="使用说明正文"');
        expect(html).toContain('aria-label="说明文档"');
        expect(html).toContain('隐私说明');
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('aria-pressed="false"');
        expect(html).toMatch(
            /<button(?=[^>]*data-tutorial-control="agreement-ack")(?=[^>]*aria-pressed="false")[^>]*>/,
        );
        expect(html).toContain('我已阅读《使用说明》和《隐私说明》');
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?确认并继续/);
        expect(html).toContain('退出');
        expect(html).not.toContain('同意并继续');
        expect(html).not.toContain('不同意并退出');
        expect(html).not.toContain('跳过');
        expect(html).not.toContain('id="onboarding-cpw-new"');
    });

    it('shows English setup controls without changing the canonical notice text, version, or gate', () => {
        const html = renderToStaticMarkup(
            <LocaleProvider initial="en">
                <OnboardingWizardPage
                    {...callbacks}
                    documents={documents}
                    needsConsent
                    mustChangePassword
                />
            </LocaleProvider>,
        );
        expect(html).toContain('切换到简体中文');
        expect(html).toContain('Complete first-time setup');
        expect(html).toContain('I have read the Usage Notice and Privacy Notice');
        expect(html).toContain('说明正文保持为主要阅读内容。');
        expect(html).toContain('Version 1.0 · Effective 2026-06-19');
        expect(html).toContain('Notices version fixture-');
        expect(html).toMatch(
            /<button(?=[^>]*data-tutorial-control="agreement-ack")(?=[^>]*aria-pressed="false")[^>]*>/,
        );
        expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?Confirm and continue/);
        expect(html).not.toContain('id="onboarding-cpw-new"');
    });

    it('keeps the selected notice and active acknowledgment on a language switch', async () => {
        const onAccept = vi.fn(async () => ({ success: true }));
        const onConsentComplete = vi.fn();
        vi.mocked(useT).mockReturnValueOnce(translator('zh'));
        const wizard = hookHost().render(() =>
            OnboardingWizardPage({
                ...callbacks,
                onAccept,
                onConsentComplete,
                documents,
                needsConsent: true,
                mustChangePassword: true,
            }),
        );
        const steps = elements(wizard).find((element) => element.type === WizardSteps)!.props
            .steps as WizardStep[];
        const agreement = steps[0].content as React.ReactElement;
        const Agreement = agreement.type as React.FunctionComponent;
        const host = hookHost();
        let language: I18n.Language = 'zh';

        const render = () => {
            vi.mocked(useT).mockReturnValueOnce(translator(language));
            return elements(host.render(() => Agreement(agreement.props as object)));
        };

        const acknowledgment = () =>
            render().find((element) => element.props['data-tutorial-control'] === 'agreement-ack')!;
        const confirm = () =>
            render().find(
                (element) =>
                    Array.isArray(element.props.children) &&
                    element.props.children.some(
                        (value) =>
                            value === '确认并继续' ||
                            value === 'Confirm and continue' ||
                            value === 'Submitting…',
                    ),
            )!;

        expect(confirm().props.disabled).toBe(true);
        (confirm().props.onClick as () => void)();
        expect(onAccept).not.toHaveBeenCalled();
        const noticePicker = render().find((element) => element.type === SegmentedControl)!;
        (noticePicker.props.onValueChange as (id: string) => void)('privacy');
        (acknowledgment().props.onClick as () => void)();
        language = 'en';
        expect(acknowledgment().props['aria-pressed']).toBe(true);
        expect(render().find((element) => element.type === SegmentedControl)?.props.value).toBe(
            'privacy',
        );
        expect(confirm().props.disabled).toBe(false);
        (confirm().props.onClick as () => void)();
        expect(onAccept).toHaveBeenCalledOnce();
        await vi.waitFor(() => expect(onConsentComplete).toHaveBeenCalledOnce());
    });

    it('uses instruction labels with the existing eula and privacy identifiers', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents.map((document) => ({
                    ...document,
                    title: document.id === 'eula' ? '用户协议 / EULA' : '隐私政策 / Privacy',
                }))}
                needsConsent
                mustChangePassword={false}
            />,
        );
        expect(html).toContain('aria-label="说明文档"');
        expect(html).toContain('aria-label="使用说明正文"');
        expect(html).toContain('我已阅读《使用说明》和《隐私说明》');
        expect(html).not.toContain('用户协议');
        expect(html).not.toContain('隐私政策');
    });

    it('keeps password fields, validation owner and the responsive action footer after consent', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent={false}
                mustChangePassword
                knownOldPassword="Fixture-Password-1!"
            />,
        );
        expect(html).toContain('id="onboarding-cpw-new"');
        expect(html).toContain('id="onboarding-cpw-confirm"');
        expect(html).not.toContain('id="onboarding-cpw-old"');
        expect(html).not.toContain('Fixture-Password-1!');
        expect(html).toContain('autoComplete="new-password"');
        expect(html).toContain('workspace-onboarding-actions');
        expect(html).toContain('保存并完成');
        expect(html).not.toContain('跳过');
        expect(html).not.toContain('说明正文保持为主要阅读内容。');
    });

    it('keeps the private kernel step unmounted until the password step completes', () => {
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent={false}
                mustChangePassword
                additionalSteps={[
                    {
                        id: 'kernel-choice',
                        label: '选择接入内核',
                        content: <p>Kernel private step mounted</p>,
                        canSkip: false,
                        hideAdvance: true,
                    },
                ]}
            />,
        );
        expect(html).toContain('id="onboarding-cpw-new"');
        expect(html).toContain('保存并继续');
        expect(html).not.toContain('Kernel private step mounted');
        expect(html).not.toContain('跳过');
    });

    it('does not create a shell for completed onboarding and retains optional extension steps', () => {
        expect(
            renderToStaticMarkup(
                <OnboardingWizardPage
                    {...callbacks}
                    documents={documents}
                    needsConsent={false}
                    mustChangePassword={false}
                />,
            ),
        ).toBe('');
        const html = renderToStaticMarkup(
            <OnboardingWizardPage
                {...callbacks}
                documents={documents}
                needsConsent={false}
                mustChangePassword={false}
                additionalSteps={[
                    {
                        id: 'optional',
                        label: '可选步骤',
                        content: <p>已有扩展步骤</p>,
                        canSkip: true,
                    },
                ]}
            />,
        );
        expect(html).toContain('已有扩展步骤');
        expect(html).toContain('跳过');
    });
});
