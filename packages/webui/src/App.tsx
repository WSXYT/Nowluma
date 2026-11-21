import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { SessionProvider } from '@/contexts/SessionContext';
import { LoginPage, loginErrorMessage } from '@/components/pages/login-page';
import {
    agreementErrorMessage,
    OnboardingWizardPage,
    type AdditionalOnboardingStep,
} from '@/components/pages/onboarding-wizard-page';
import { SkeletonSwap, useSkeletonSwap } from '@/components/interior/skeleton-swap';
import { ApiProvider, createApiClient, useApi, type ApiClient } from '@/lib/api';
import { DebugTaskProvider } from '@/contexts/DebugTaskContext';
import { TaskBadge } from '@/components/debug/task-badge';
import { AdaptivePointer } from '@/components/ui/adaptive-pointer';
import { useFinePointer } from '@/hooks/use-media-query';
import { GlobalContextMenu } from '@/components/ui/global-context-menu';
import { InsecureRemoteAccessBanner } from '@/components/insecure-remote-access-banner';
import {
    actionErrorMessage,
    ActionFeedbackProvider,
    ActionFeedbackViewport,
    useActionFeedback,
} from '@/contexts/ActionFeedbackContext';
import type { AgreementsPayload } from '@/lib/api/types';
import { appRouter } from '@/router';
import {
    browserPath,
    DEVELOPER_ONBOARDING_RETURN_KEY,
    DEVELOPER_ONBOARDING_URL,
    DEVELOPER_SETTINGS_URL,
    developerOnboardingReturnPath,
    isDeveloperOnboardingLocation,
} from '@/lib/onboarding-navigation';
import { onboardingExecution } from '@/lib/onboarding-actions';
import { KernelOnboardingStep } from '@/components/kernel-onboarding-step';
import { DisplayEffectsOnboardingStep } from '@/components/display-effects';
import { LanguageToggle } from '@/components/language-toggle';
import { useT } from '@/i18n';

interface AppProps {
    onboardingSteps?: AdditionalOnboardingStep[];
    client?: ApiClient;
}

export default function App({ onboardingSteps = [], client }: AppProps) {
    return (
        <ActionFeedbackProvider>
            <ThemeProvider>
                <InsecureRemoteAccessBanner />
                <ActionFeedbackViewport />
                <AdaptivePointer />
                <GlobalContextMenu />
                <AuthBoundary onboardingSteps={onboardingSteps} client={client} />
            </ThemeProvider>
        </ActionFeedbackProvider>
    );
}

// #194: read a one-shot `?token=<password>` login param and immediately strip
// it from the URL (replaceState) so the credential doesn't linger in the
// address bar / browser history / Referer header. Named `token` to match the
// requested query key; the value is the WebUI login password.
function consumeUrlToken(): string | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const url = new URL(window.location.href);
        const value = url.searchParams.get('token');

        if (!value) {
            return null;
        }

        url.searchParams.delete('token');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        return value;
    } catch {
        return null;
    }
}

function authLocation() {
    return import.meta.env.MODE === 'demo' ? appRouter.history.location : window.location;
}

function AuthBoundary({
    onboardingSteps,
    client: injectedClient,
}: {
    onboardingSteps: AdditionalOnboardingStep[];
    client?: ApiClient;
}) {
    const t = useT();
    const finePointer = useFinePointer();
    const [authChecked, setAuthChecked] = useState(false);
    const [authed, setAuthed] = useState(false);
    const [mustChange, setMustChange] = useState(false);
    const [status, setStatus] = useState('未连接');
    // Agreement consent gate, shown after login but BEFORE the forced password
    // change. `agreements === null` while the post-auth fetch is in flight.
    const [agreements, setAgreements] = useState<AgreementsPayload | null>(null);
    const [agreementsError, setAgreementsError] = useState<string | null>(null);
    const [needsConsent, setNeedsConsent] = useState(false);
    const [onboardingFinished, setOnboardingFinished] = useState(false);
    const [onboardingActive, setOnboardingActive] = useState(false);
    const [replayingOnboarding, setReplayingOnboarding] = useState(
        () => typeof window !== 'undefined' && isDeveloperOnboardingLocation(authLocation()),
    );
    const onboardingReturnPath = useRef<string | null>(null);
    // The password from *this* session's login, carried into the forced
    // change-password gate so it doesn't have to render an old-password field
    // (which browsers autofill, misleading users on upgrade). Stays undefined
    // for a returning session that's already authed but still must change.
    const [loginPassword, setLoginPassword] = useState<string | undefined>(undefined);
    const [urlLoginPassword, setUrlLoginPassword] = useState<string | undefined>(undefined);
    const [urlNeedsTotp, setUrlNeedsTotp] = useState(false);
    const authLoading = !authChecked || (authed && agreements === null && agreementsError === null);
    const { showSkeleton: showAuthSkeleton } = useSkeletonSwap({ ready: !authLoading });

    const client = useMemo<ApiClient>(
        () =>
            injectedClient ??
            createApiClient({
                onUnauthorized: () => {
                    setAuthed(false);
                    setStatus('未授权');
                },
            }),
        [injectedClient],
    );

    const refreshAgreements = useCallback(async () => {
        setAgreements(null);
        setAgreementsError(null);

        try {
            const payload = await client.agreements.get();
            setAgreements(payload);
            setNeedsConsent(payload.consentRequired);

            if (payload.consentRequired) {
                setOnboardingActive(true);
            }
        } catch (error) {
            console.error('agreement status load failed', error);
            setAgreementsError(actionErrorMessage(error));
        }
    }, [client]);

    useEffect(() => {
        (async () => {
            let ok = await client.status();
            // #194: `?token=<password>` in the URL logs in without typing the
            // password. Only attempted when no stored token already authed us; the
            // value is the WebUI login password (verified by /api/login server-side,
            // so a wrong one just falls through to the login page). The param is
            // consumed once and stripped from the URL first — a password in the
            // address bar leaks via browser history / access logs / the Referer.
            let urlPassword: string | undefined;

            if (!ok) {
                const pw = consumeUrlToken();

                if (pw) {
                    const result = await client.login(pw);

                    if (result.ok) {
                        ok = true;
                        urlPassword = pw;
                    } else if ('needsTotp' in result && result.needsTotp) {
                        setUrlLoginPassword(pw);
                        setUrlNeedsTotp(true);
                    }
                }
            }

            if (ok) {
                setAuthed(true);
                setStatus('已连接');
                const [nextMustChange] = await Promise.all([
                    client.mustChangePassword(),
                    refreshAgreements(),
                ]);
                setMustChange(nextMustChange);

                if (nextMustChange) {
                    setOnboardingActive(true);
                }

                // Carry the URL password into the forced change-password gate so it
                // needn't re-prompt for the old password (matches the login flow).
                if (urlPassword) {
                    setLoginPassword(urlPassword);
                }
            }

            setAuthChecked(true);
        })();
    }, [client, refreshAgreements]);

    const handleLoggedOut = useCallback(() => {
        // Reset the URL so the next login lands on the overview page, matching
        // the pre-router behaviour, and clear every post-auth gate.
        if (import.meta.env.MODE === 'demo') {
            appRouter.history.replace('/');
        } else {
            window.history.replaceState({}, '', '/');
        }

        setAuthed(false);
        setStatus('未连接');
        setMustChange(false);
        setAgreements(null);
        setAgreementsError(null);
        setNeedsConsent(false);
        setOnboardingFinished(false);
        setOnboardingActive(false);
        setReplayingOnboarding(false);
        onboardingReturnPath.current = null;
        setLoginPassword(undefined);
        setUrlLoginPassword(undefined);
        setUrlNeedsTotp(false);
    }, []);

    const handleDecline = useCallback(async () => {
        await client.logout();
        handleLoggedOut();
    }, [client, handleLoggedOut]);

    const restartOnboarding = useCallback(() => {
        const currentPath = browserPath(authLocation());
        const returnPath = isDeveloperOnboardingLocation(authLocation())
            ? DEVELOPER_SETTINGS_URL
            : currentPath;
        onboardingReturnPath.current = returnPath;
        const currentState =
            typeof window.history.state === 'object' && window.history.state !== null
                ? (window.history.state as Record<string, unknown>)
                : {};
        setReplayingOnboarding(true);
        appRouter.history.push(DEVELOPER_ONBOARDING_URL, {
            ...currentState,
            [DEVELOPER_ONBOARDING_RETURN_KEY]: returnPath,
        });
    }, []);

    const exitOnboardingReplay = useCallback(() => {
        const returnPath =
            onboardingReturnPath.current ?? developerOnboardingReturnPath(window.history.state);
        onboardingReturnPath.current = null;

        if (returnPath && isDeveloperOnboardingLocation(authLocation())) {
            // The developer page pushed the replay entry, so browser Back is the
            // authoritative way to restore both the URL and its router history.
            appRouter.history.back();
            return;
        }

        appRouter.history.replace(returnPath ?? DEVELOPER_SETTINGS_URL);
        setReplayingOnboarding(false);
    }, []);

    useEffect(() => {
        const syncReplayToLocation = () => {
            const replaying = isDeveloperOnboardingLocation(appRouter.history.location);

            if (!replaying) {
                onboardingReturnPath.current = null;
            }

            setReplayingOnboarding(replaying);
        };

        return appRouter.history.subscribe(syncReplayToLocation);
    }, []);

    let view: React.ReactNode;

    if (authLoading || showAuthSkeleton) {
        view = (
            <Splash>{authChecked ? t('加载中…', 'Loading…') : t('初始化中…', 'Starting…')}</Splash>
        );
    } else if (!authed) {
        view = (
            <LoginGate
                initialPassword={urlLoginPassword}
                initialNeedsTotp={urlNeedsTotp}
                onAuthed={(needsChange, password) => {
                    setAuthed(true);
                    setStatus('已连接');
                    setMustChange(needsChange);
                    setLoginPassword(password);
                    setUrlLoginPassword(undefined);
                    setUrlNeedsTotp(false);
                    setOnboardingFinished(false);
                    setOnboardingActive(needsChange);
                    void refreshAgreements();
                }}
            />
        );
    } else if (agreementsError) {
        view = (
            <AgreementLoadFailure
                detail={agreementsError}
                onRetry={() => {
                    void refreshAgreements();
                }}
                onLogout={() => {
                    void handleDecline();
                }}
            />
        );
    } else if (
        agreements &&
        (replayingOnboarding ||
            (!onboardingFinished &&
                (onboardingActive || needsConsent || mustChange || onboardingSteps.length > 0)))
    ) {
        view = (
            <OnboardingGate
                key={replayingOnboarding ? 'replay' : 'setup'}
                payload={agreements}
                needsConsent={replayingOnboarding || needsConsent}
                mustChangePassword={replayingOnboarding || mustChange}
                replay={replayingOnboarding}
                additionalSteps={onboardingSteps}
                knownOldPassword={loginPassword}
                onConsentComplete={() => setNeedsConsent(false)}
                onPasswordComplete={() => {
                    setMustChange(false);
                    setLoginPassword(undefined);
                }}
                onComplete={() => {
                    if (replayingOnboarding) {
                        exitOnboardingReplay();
                        return;
                    }

                    setOnboardingFinished(true);
                    setOnboardingActive(false);
                }}
                onStale={refreshAgreements}
                onDecline={replayingOnboarding ? exitOnboardingReplay : handleDecline}
            />
        );
    } else {
        view = (
            <SessionProvider
                value={{
                    status,
                    onLogoutComplete: handleLoggedOut,
                    restartOnboarding,
                }}
            >
                <RouterProvider router={appRouter} />
            </SessionProvider>
        );
    }

    return (
        <ApiProvider client={client}>
            <DebugTaskProvider>
                <TooltipProvider delayDuration={finePointer ? 150 : Infinity}>
                    {view}
                </TooltipProvider>
                <TaskBadge />
            </DebugTaskProvider>
        </ApiProvider>
    );
}

function AgreementLoadFailure({
    detail,
    onRetry,
    onLogout,
}: {
    detail: string;
    onRetry: () => void;
    onLogout: () => void;
}) {
    const t = useT();
    return (
        <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
            <Card className="w-full max-w-lg border-destructive/30">
                <CardContent className="p-7 sm:p-9">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                            <AlertTriangle className="size-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base font-semibold">
                                {t('协议状态加载失败', 'Could not load agreement status')}
                            </h1>
                            <p
                                role="alert"
                                className="mt-1.5 text-sm leading-relaxed text-muted-foreground"
                            >
                                {t(
                                    '无法确认当前用户协议与隐私政策状态。为避免绕过必要确认，控制台暂不放行。',
                                    'The console cannot verify the current use and privacy notices. Access stays blocked until the required confirmation can be checked.',
                                )}
                            </p>
                            <p className="mt-2 break-words text-xs text-destructive">{detail}</p>
                        </div>
                    </div>
                    <div className="mt-6 flex flex-wrap justify-end gap-2">
                        <LanguageToggle />
                        <Button type="button" variant="ghost" onClick={onLogout}>
                            <LogOut className="size-4" />
                            {t('退出登录', 'Sign out')}
                        </Button>
                        <Button type="button" onClick={onRetry}>
                            <RefreshCw className="size-4" />
                            {t('重新加载', 'Reload')}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Splash({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
            <SkeletonSwap
                ready={false}
                lines={3}
                lineHeight={24}
                reserve={72}
                label={typeof children === 'string' ? children : 'WebUI'}
                className="w-64 max-w-[70vw]"
            >
                {null}
            </SkeletonSwap>
        </div>
    );
}

function LoginGate({
    onAuthed,
    initialPassword,
    initialNeedsTotp,
}: {
    onAuthed: (mustChange: boolean, password: string) => void;
    initialPassword?: string;
    initialNeedsTotp?: boolean;
}) {
    const t = useT();
    const api = useApi();
    const { startAction, dismiss } = useActionFeedback();
    const handleLogin = useCallback(
        async (password: string, secondFactor?: { totp?: string; recoveryCode?: string }) => {
            const handle = startAction({
                title: t('正在登录', 'Signing in'),
                detail: secondFactor
                    ? t('正在验证一次性密码', 'Verifying the one-time code')
                    : t('正在验证 WebUI 访问密码', 'Verifying the console password'),
            });
            const result = await api.login(password, secondFactor);

            if (result.ok) {
                handle.succeed({
                    title: t('登录成功', 'Signed in'),
                    detail: t('正在进入控制台', 'Opening the console'),
                });
                onAuthed(result.mustChangePassword, password);
                return { success: true };
            }

            if ('message' in result) {
                handle.fail(
                    loginErrorMessage(result.message, Boolean(secondFactor?.recoveryCode), t),
                    {
                        title: t('登录失败', 'Sign-in failed'),
                    },
                );
                return { success: false, error: result.message };
            }

            dismiss();
            return { success: false, needsTotp: true };
        },
        [api, dismiss, onAuthed, startAction, t],
    );
    return (
        <LoginPage
            onLogin={handleLogin}
            initialPassword={initialPassword}
            initialNeedsTotp={initialNeedsTotp}
        />
    );
}

function OnboardingGate({
    payload,
    needsConsent,
    mustChangePassword,
    replay,
    knownOldPassword,
    onConsentComplete,
    onPasswordComplete,
    onComplete,
    additionalSteps,
    onStale,
    onDecline,
}: {
    payload: AgreementsPayload;
    needsConsent: boolean;
    mustChangePassword: boolean;
    replay: boolean;
    knownOldPassword?: string;
    onConsentComplete: () => void;
    onPasswordComplete: () => void;
    onComplete: () => void;
    additionalSteps: AdditionalOnboardingStep[];
    onStale: () => void;
    onDecline: () => void;
}) {
    const t = useT();
    const api = useApi();
    const checkStrength = useCallback(
        (password: string) => api.checkPasswordStrength(password),
        [api],
    );
    const { runAction, registerViewportHost } = useActionFeedback();
    const { setAppearancePreview } = useTheme();
    const feedbackHostRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const host = feedbackHostRef.current;

        if (host) {
            return registerViewportHost(host);
        }
    }, [registerViewportHost]);
    // Replayed theme controls and display choices share a reversible presentation;
    // no setters in the wizard write real preferences until an explicit setup save.
    useLayoutEffect(() => {
        setAppearancePreview({});
        return () => setAppearancePreview(null);
    }, [setAppearancePreview]);

    // Snapshot only when a setup/replay gate actually mounts, not on every authenticated tab.
    const [activeAdditionalSteps] = useState<AdditionalOnboardingStep[]>(() => [
        {
            id: 'display-effects',
            label: '显示效果',
            content: <DisplayEffectsOnboardingStep replay={replay} />,
            canSkip: false,
            hideAdvance: true,
        },
        {
            id: 'kernel-choice',
            label: '选择接入内核',
            content: <KernelOnboardingStep replay={replay} />,
            canSkip: false,
            hideAdvance: true,
        },
        ...additionalSteps,
    ]);
    const execution = onboardingExecution(replay, {
        changePassword: (oldPassword, newPassword) => api.changePassword(oldPassword, newPassword),
        acceptAgreements: async () => {
            const result = await runAction(
                {
                    title: t('正在记录协议确认', 'Recording your acknowledgement'),
                    detail: t(
                        `协议版本 ${payload.version.slice(0, 8)}`,
                        `Version ${payload.version.slice(0, 8)}`,
                    ),
                    successTitle: t('协议确认已记录', 'Acknowledgement recorded'),
                    errorTitle: t('协议确认失败', 'Could not record acknowledgement'),
                    resultError: (consent) =>
                        consent.success || !consent.message
                            ? null
                            : agreementErrorMessage(consent.message, t),
                },
                () => api.agreements.recordConsent(payload.version),
            );

            if (result.success) {
                return { success: true };
            }

            if (result.currentVersion && result.currentVersion !== payload.version) {
                onStale();
                return {
                    success: false,
                    message: '协议已更新，已为你载入最新版本，请重新阅读后确认。',
                };
            }

            return { success: false, message: result.message ?? '提交失败，请重试' };
        },
    });
    return (
        <OnboardingWizardPage
            documents={payload.documents}
            agreementVersion={payload.version}
            needsConsent={needsConsent}
            mustChangePassword={mustChangePassword}
            knownOldPassword={knownOldPassword}
            passwordMode={execution.passwordMode}
            onDecline={onDecline}
            onConsentComplete={replay ? () => undefined : onConsentComplete}
            onPasswordComplete={replay ? () => undefined : onPasswordComplete}
            onComplete={onComplete}
            additionalSteps={activeAdditionalSteps}
            feedbackHostRef={feedbackHostRef}
            checkStrength={checkStrength}
            submitPassword={execution.actions.changePassword}
            onAccept={execution.actions.acceptAgreements}
        />
    );
}
