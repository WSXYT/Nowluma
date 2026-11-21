import { useState, type ReactNode, type RefObject } from 'react';
import { useReducedMotionConfig } from 'motion/react';
import { Check, Loader2, ScrollText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import { LineField } from '@/components/ui/line-field';
import { PaperBackdrop } from '@/components/layout/paper-backdrop';
import { SegmentedControl } from '@/components/interior/segmented-control';
import {
    useWizardNavigation,
    WizardSteps,
    type WizardStep,
} from '@/components/interior/wizard-steps';
import { ChangePasswordForm, type PasswordRule } from '@/components/pages/change-password-form';
import {
    advanceOnboardingStep,
    buildRequiredOnboardingStepIds,
} from '@/components/pages/onboarding-steps';
import { Markdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import type { AgreementDoc } from '@/lib/api/types';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME } from '@/types';
import { useTheme } from '@/contexts/ThemeContext';
import { useT, type Translate } from '@/i18n';
import '@/styles/workspace.css';

export interface AdditionalOnboardingStep {
    id: string;
    label: string;
    content: ReactNode;
    canSkip: boolean;
    onSkip?: () => void;
    hideAdvance?: boolean;
}

interface OnboardingWizardPageProps {
    documents: AgreementDoc[];
    agreementVersion: string;
    needsConsent: boolean;
    mustChangePassword: boolean;
    knownOldPassword?: string;
    passwordMode?: 'change' | 'rehearsal';
    onAccept: () => Promise<{ success: boolean; message?: string }>;
    onConsentComplete: () => void;
    onDecline: () => void;
    checkStrength: (password: string) => Promise<{ rules: PasswordRule[]; valid: boolean }>;
    submitPassword: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<{ success: boolean; message?: string }>;
    onPasswordComplete: () => void;
    onComplete: () => void;
    additionalSteps?: AdditionalOnboardingStep[];
    feedbackHostRef?: RefObject<HTMLDivElement | null>;
}

export function agreementErrorMessage(message: string, t: Translate): string {
    switch (message) {
        case '提交失败，请重试':
            return t(message, 'Could not submit. Please try again.');
        case '网络错误，请重试':
            return t(message, 'Network error. Please try again.');
        case '请求格式错误':
            return t(message, 'Invalid request format.');
        case '协议版本已更新，请刷新后重新确认':
            return t(message, 'The notices were updated. Refresh and confirm again.');
        case '协议已更新，已为你载入最新版本，请重新阅读后确认。':
            return t(
                message,
                'The latest notices have been loaded. Review them before confirming again.',
            );
        case '保存失败，请检查服务器日志':
            return t(message, 'Could not save. Check the server logs.');
        default:
            return message;
    }
}

export function OnboardingWizardPage({
    documents,
    agreementVersion,
    needsConsent,
    mustChangePassword,
    knownOldPassword,
    passwordMode = 'change',
    onAccept,
    onConsentComplete,
    onDecline,
    checkStrength,
    submitPassword,
    onPasswordComplete,
    onComplete,
    additionalSteps = [],
    feedbackHostRef,
}: OnboardingWizardPageProps) {
    const t = useT();
    const { appearance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const [requiredStepIds] = useState(() =>
        buildRequiredOnboardingStepIds({
            needsConsent,
            mustChangePassword,
        }),
    );
    const [index, setIndex] = useState(0);

    const total = requiredStepIds.length + additionalSteps.length;

    const advanceFrom = (stepId: string) => {
        const order = [...requiredStepIds, ...additionalSteps.map((step) => step.id)];
        const advance = advanceOnboardingStep(order, stepId);

        if (advance.complete) {
            onComplete();
            return;
        }

        setIndex(advance.nextIndex);
    };

    const required: WizardStep[] = requiredStepIds.map((stepId) => {
        if (stepId === 'agreements') {
            return {
                id: stepId,
                label: t('阅读使用说明', 'Read the usage notices'),
                canSkip: false,
                hideAdvance: true,
                hideBack: true,
                scrollMode: 'content',
                content: (
                    <AgreementStep
                        documents={documents}
                        version={agreementVersion}
                        onAccept={onAccept}
                        onDecline={onDecline}
                        onComplete={() => {
                            onConsentComplete();
                            advanceFrom(stepId);
                        }}
                    />
                ),
            };
        }

        return {
            id: stepId,
            label: t('设置访问密码', 'Set an access password'),
            canSkip: false,
            hideAdvance: true,
            hideBack: true,
            content: (
                <PasswordStep
                    knownOldPassword={knownOldPassword}
                    mode={passwordMode}
                    checkStrength={checkStrength}
                    submit={submitPassword}
                    onComplete={() => {
                        onPasswordComplete();
                        advanceFrom(stepId);
                    }}
                />
            ),
        };
    });

    const steps: WizardStep[] = [
        ...required,
        ...additionalSteps.map((step) => ({
            id: step.id,
            label:
                step.id === 'display-effects' && step.label === '显示效果'
                    ? t(step.label, 'Display effects')
                    : step.id === 'kernel-choice' && step.label === '选择接入内核'
                      ? t(step.label, 'Choose a connection kernel')
                      : step.label,
            content: step.content,
            canSkip: step.canSkip,
            onSkip: step.onSkip,
            hideAdvance: step.hideAdvance,
        })),
    ];

    if (total === 0) {
        return null;
    }

    return (
        <div
            className={cn(
                'workspace-onboarding-shell antialiased',
                appearance.background.type === 'none' && 'bg-background',
            )}
        >
            {appearance.background.type === 'none' && <PaperBackdrop />}
            <header className="workspace-auth-masthead">
                <div className="workspace-auth-wordmark">
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                </div>
                <div className="workspace-toolbar-scene">
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </header>
            <div className="workspace-onboarding-layout">
                <aside
                    className="workspace-onboarding-identity"
                    aria-label={t('首次使用设置', 'First-time setup')}
                >
                    <div className="workspace-auth-artwork">
                        <LineField animated={!reduced} />
                        <div className="workspace-auth-artwork-caption">
                            <span>{APP_NAME}</span>
                            <span>{t('开始连接', 'Start connecting')}</span>
                        </div>
                    </div>
                    <p className="workspace-eyebrow mt-6">{t('从这里开始', 'Start here')}</p>
                    <p className="workspace-auth-statement">
                        {t('连接之前，', 'Before you connect,')}
                        <br />
                        {t('准备就绪。', 'get set up.')}
                    </p>
                </aside>
                <main className="workspace-onboarding-document">
                    <header className="workspace-onboarding-heading">
                        <p className="workspace-eyebrow">
                            {t(`欢迎使用 ${APP_NAME}`, `Welcome to ${APP_NAME}`)}
                        </p>
                        <h1>{t('完成首次使用设置', 'Complete first-time setup')}</h1>
                    </header>
                    <div ref={feedbackHostRef} className="workspace-onboarding-feedback" />
                    <WizardSteps
                        steps={steps}
                        index={index}
                        onIndexChange={setIndex}
                        onComplete={onComplete}
                        label={t('首次使用设置步骤', 'First-time setup steps')}
                        backLabel={t('上一步', 'Back')}
                        nextLabel={t('下一步', 'Next')}
                        finishLabel={t('完成', 'Finish')}
                        skipLabel={t('跳过', 'Skip')}
                        spacious
                        fill
                    />
                </main>
            </div>
        </div>
    );
}

function AgreementStep({
    documents,
    version,
    onAccept,
    onDecline,
    onComplete,
}: {
    documents: AgreementDoc[];
    version: string;
    onAccept: () => Promise<{ success: boolean; message?: string }>;
    onDecline: () => void;
    onComplete: () => void;
}) {
    const t = useT();
    const documentLabels: Record<AgreementDoc['id'], string> = {
        eula: t('使用说明', 'Usage notice'),
        privacy: t('隐私说明', 'Privacy notice'),
    };
    const [activeId, setActiveId] = useState(documents[0]?.id ?? 'eula');
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const active = documents.find((document) => document.id === activeId) ?? documents[0];

    const accept = async () => {
        if (!agreed || submitting) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const result = await onAccept();

            if (result.success) {
                onComplete();
                return;
            }

            setError(result.message ?? '提交失败，请重试');
        } catch (caught) {
            console.error('record onboarding consent failed', caught);
            setError(caught instanceof Error ? caught.message : '网络错误，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
                    <ScrollText className="size-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                        {t('阅读使用说明', 'Read the usage notices')}
                    </h2>
                    <p className="mt-0.5 max-w-2xl text-pretty text-xs leading-relaxed text-muted-foreground sm:mt-1 sm:text-sm">
                        {t(
                            '阅读后确认，即可继续设置。',
                            'Read and acknowledge the notices to continue setup.',
                        )}
                    </p>
                </div>
            </div>

            {documents.length > 1 ? (
                <div className="mt-3 max-w-full overflow-x-auto pb-1 sm:mt-4">
                    <SegmentedControl
                        label={t('说明文档', 'Notices')}
                        value={activeId}
                        onValueChange={(next) => setActiveId(next as AgreementDoc['id'])}
                        options={documents.map((document) => ({
                            value: document.id,
                            label: documentLabels[document.id],
                        }))}
                    />
                </div>
            ) : null}

            {active && (active.declaredVersion || active.effectiveDate) ? (
                <p className="mt-1.5 px-0.5 text-meta leading-relaxed text-muted-foreground">
                    {active.declaredVersion
                        ? `${t('版本', 'Version')} ${active.declaredVersion}`
                        : ''}
                    {active.declaredVersion && active.effectiveDate ? ' · ' : ''}
                    {active.effectiveDate
                        ? `${t('生效', 'Effective')} ${active.effectiveDate}`
                        : ''}
                </p>
            ) : null}

            <div
                className="workspace-agreement-reading mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[4px] border border-border bg-card p-3 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                tabIndex={0}
                aria-label={
                    active
                        ? t(`${documentLabels[active.id]}正文`, `${documentLabels[active.id]} text`)
                        : t('说明正文', 'Notice text')
                }
            >
                <div className="mx-auto max-w-[44.25rem]">
                    {active ? (
                        <Markdown content={active.text} />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            {t(
                                '未能加载说明文本，请刷新页面重试。',
                                'Could not load the notices. Refresh the page to try again.',
                            )}
                        </p>
                    )}
                </div>
            </div>

            <button
                type="button"
                data-tutorial-control="agreement-ack"
                onClick={() => setAgreed((current) => !current)}
                aria-pressed={agreed}
                className={cn(
                    'mt-3 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start outline-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:min-h-12 sm:px-4 sm:py-3',
                    agreed
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-accent/40',
                )}
            >
                <span
                    className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
                        agreed
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/50 bg-background',
                    )}
                >
                    {agreed ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="text-sm font-medium leading-relaxed">
                    {t(
                        '我已阅读《使用说明》和《隐私说明》',
                        'I have read the Usage Notice and Privacy Notice',
                    )}
                </span>
            </button>

            {error ? (
                <p role="alert" className="mt-2 text-xs text-destructive">
                    {agreementErrorMessage(error, t)}
                </p>
            ) : null}

            <div className="mt-3 flex items-center gap-3 sm:justify-between">
                <span className="hidden text-micro text-muted-foreground/70 sm:inline">
                    {t('说明版本', 'Notices version')} {version.slice(0, 8)}
                </span>
                <div className="workspace-onboarding-actions grid w-full grid-cols-2 gap-3 sm:ml-auto sm:flex sm:w-auto sm:items-center">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onDecline}
                        disabled={submitting}
                        className="h-11 w-full sm:w-auto"
                    >
                        {t('退出', 'Exit')}
                    </Button>
                    <Button
                        type="button"
                        onClick={() => {
                            void accept();
                        }}
                        disabled={!agreed || submitting}
                        className="h-auto w-full whitespace-normal text-balance sm:min-w-36 sm:w-auto"
                    >
                        <ShieldCheck className="size-4" />
                        {submitting
                            ? t('提交中…', 'Submitting…')
                            : t('确认并继续', 'Confirm and continue')}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function PasswordStep({
    knownOldPassword,
    mode,
    checkStrength,
    submit,
    onComplete,
}: {
    knownOldPassword?: string;
    mode: 'change' | 'rehearsal';
    checkStrength: (password: string) => Promise<{ rules: PasswordRule[]; valid: boolean }>;
    submit: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<{ success: boolean; message?: string }>;
    onComplete: () => void;
}) {
    const t = useT();
    const { back, isLast } = useWizardNavigation();

    return (
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-start py-2 sm:py-5">
            <div className="mb-6 flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center text-muted-foreground">
                    <ShieldAlert className="size-5" />
                </div>
                <div className="min-w-0">
                    <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                        {t('设置新的访问密码', 'Set a new access password')}
                    </h2>
                    <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                        {mode === 'rehearsal'
                            ? t(
                                  '演练密码设置，不保存输入内容。',
                                  'Practice setting a password. Nothing you enter is saved.',
                              )
                            : t(
                                  '设置用于打开控制台的密码。',
                                  'Set the password you will use to open the console.',
                              )}
                    </p>
                </div>
            </div>
            <ChangePasswordForm
                knownOldPassword={knownOldPassword}
                mode={mode}
                checkStrength={checkStrength}
                submit={submit}
                onSuccess={onComplete}
                idPrefix="onboarding-cpw"
                submitLabel={
                    mode === 'rehearsal'
                        ? t('完成演练', 'Finish rehearsal')
                        : isLast
                          ? t('保存并完成', 'Save and finish')
                          : t('保存并继续', 'Save and continue')
                }
                className="gap-4"
                renderActions={({ canAttempt, submitting, submitLabel }) => (
                    <div className="workspace-onboarding-actions grid grid-cols-2 gap-3 pt-2 sm:flex sm:items-center">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={back}
                            disabled={submitting}
                            className="h-11 w-full sm:w-auto"
                        >
                            {t('上一步', 'Back')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={!canAttempt}
                            className="h-auto w-full whitespace-normal text-balance sm:ml-auto sm:min-w-36 sm:w-auto"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />{' '}
                                    {t('提交中…', 'Submitting…')}
                                </>
                            ) : (
                                submitLabel
                            )}
                        </Button>
                    </div>
                )}
            />
        </div>
    );
}
