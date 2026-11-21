import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, KeyRound } from 'lucide-react';
import { OtpInput, type OtpInputHandle } from '@/components/interior/otp-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordVisibilityIcon } from '@/components/ui/password-visibility-icon';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemeToggle } from '@/components/theme-toggle';
import { LineField } from '@/components/ui/line-field';
import { PaperBackdrop } from '@/components/layout/paper-backdrop';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { BRAND_LOGO_URL } from '@/brand';
import { APP_NAME, APP_VERSION } from '@/types';
import { parseSecondFactor } from '@/lib/totp-second-factor';
import { useT, type Translate } from '@/i18n';
import '@/styles/workspace.css';

interface LoginPageProps {
    onLogin: (
        password: string,
        secondFactor?: { totp?: string; recoveryCode?: string },
    ) => Promise<{ success: boolean; error?: string; needsTotp?: boolean }>;
    initialPassword?: string;
    initialNeedsTotp?: boolean;
    initialUseRecovery?: boolean;
}

export function loginErrorMessage(message: string, recovery: boolean, t: Translate): string {
    switch (message) {
        case '登录失败':
            return t(message, 'Sign-in failed');
        case '密码错误':
            return t(message, 'Incorrect password');
        case '验证码不正确':
            return t(message, recovery ? 'Incorrect recovery code' : 'Incorrect verification code');
        case '恢复码不正确，改错的那一位即可。':
            return t(
                message,
                'Incorrect recovery code. You can correct just the mistyped character.',
            );
        case '验证码不正确，改错的那一位即可。':
            return t(
                message,
                'Incorrect verification code. You can correct just the mistyped digit.',
            );
        case '请求格式错误':
            return t(message, 'Invalid request format');
        case '令牌错误':
            return t(message, 'Invalid session token');
        case '网络错误':
            return t(message, 'Network error');

        default: {
            const wait = /^登录尝试过多，请 (\d+) 秒后重试$/.exec(message);
            return wait
                ? t(message, `Too many sign-in attempts. Try again in ${wait[1]} seconds.`)
                : message;
        }
    }
}

export function LoginPage({
    onLogin,
    initialPassword = '',
    initialNeedsTotp = false,
    initialUseRecovery = false,
}: LoginPageProps) {
    const t = useT();
    const { appearance, performance } = useTheme();
    const customBg = appearance.background.type !== 'none';
    const reduce = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;

    // The login page must never carry operator custom CSS. applyAppearance gates
    // it on a token, but an in-session logout / 401 expiry won't re-run it, so
    // clear any lingering custom-CSS <style> whenever the login page shows.
    useEffect(() => {
        document.getElementById('nowluma-custom-css')?.remove();
    }, []);

    const [password, setPassword] = useState(initialPassword);
    const [useRecovery, setUseRecovery] = useState(initialUseRecovery);
    const [needsTotp, setNeedsTotp] = useState(initialNeedsTotp);
    const [otpStatus, setOtpStatus] = useState<'idle' | 'checking' | 'rejected'>('idle');
    const otpRef = useRef<OtpInputHandle>(null);
    const [showPwd, setShowPwd] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [shake, setShake] = useState(0);
    useEffect(() => {
        if (otpStatus !== 'rejected') {
            return;
        }

        const id = window.setTimeout(() => {
            otpRef.current?.clear();
            setOtpStatus('idle');
            setError('');
        }, 1600);
        return () => window.clearTimeout(id);
    }, [otpStatus]);

    const goBackToPassword = () => {
        setNeedsTotp(false);
        setUseRecovery(false);
        setOtpStatus('idle');
        setError('');
    };

    const handlePasswordSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        const result = await onLogin(password);
        setLoading(false);

        if (result.needsTotp) {
            setNeedsTotp(true);
            setUseRecovery(false);
            setOtpStatus('idle');
            setError('');
            return;
        }

        if (!result.success) {
            setError(result.error || '登录失败');
            setShake((k) => k + 1);
        }
    };

    const submitTotp = async (code: string) => {
        setOtpStatus('checking');
        const result = await onLogin(password, parseSecondFactor(code));

        if (result.success) {
            return;
        }

        if (result.needsTotp) {
            setOtpStatus('idle');
            return;
        }

        setError(
            result.error ||
                (useRecovery
                    ? '恢复码不正确，改错的那一位即可。'
                    : '验证码不正确，改错的那一位即可。'),
        );
        setOtpStatus('rejected');
    };

    const handleTotpSubmit = (e: FormEvent) => {
        e.preventDefault();
    };

    return (
        <LoginShell customBg={customBg} reduce={reduce} wide={useRecovery}>
            {needsTotp ? (
                <>
                    <LoginBrand
                        title={
                            useRecovery
                                ? t('使用恢复码', 'Use a recovery code')
                                : t('验证身份', 'Verify your identity')
                        }
                        subtitle={
                            useRecovery
                                ? t(
                                      '输入保存的一次性恢复码',
                                      'Enter one of your saved one-time recovery codes',
                                  )
                                : t(
                                      '输入 Authenticator 中的 6 位验证码',
                                      'Enter the 6-digit code from your authenticator app',
                                  )
                        }
                    />
                    <form onSubmit={handleTotpSubmit} className="mt-8 flex flex-col gap-3.5">
                        <OtpInput
                            key={useRecovery ? 'recovery' : 'totp'}
                            ref={otpRef}
                            autoFocus
                            className={cn('w-full', useRecovery && 'workspace-recovery-code')}
                            length={useRecovery ? 8 : 6}
                            mode={useRecovery ? 'alphanumeric' : 'numeric'}
                            groupEvery={useRecovery ? 4 : 3}
                            groupSeparator={useRecovery}
                            label={
                                useRecovery
                                    ? t('恢复码', 'Recovery code')
                                    : t('验证码', 'Verification code')
                            }
                            disabled={otpStatus === 'checking'}
                            error={otpStatus === 'rejected'}
                            errorMessage={loginErrorMessage(error, useRecovery, t)}
                            hint={
                                useRecovery
                                    ? t(
                                          '可以把完整恢复码粘贴到任意一格，连字符会自动忽略。',
                                          'Paste the full recovery code into any cell. Hyphens are ignored.',
                                      )
                                    : t(
                                          '可以把完整验证码粘贴到任意一格。',
                                          'You can paste the full verification code into any cell.',
                                      )
                            }
                            onChange={() => setOtpStatus((s) => (s === 'rejected' ? 'idle' : s))}
                            onComplete={(code) => {
                                void submitTotp(code);
                            }}
                        />
                        {!useRecovery && (
                            <input
                                type="text"
                                name="one-time-code"
                                autoComplete="one-time-code"
                                inputMode="numeric"
                                className="sr-only"
                                tabIndex={-1}
                                aria-hidden="true"
                                onChange={(e) => {
                                    const digits = e.currentTarget.value
                                        .replace(/\D/g, '')
                                        .slice(0, 6);

                                    if (digits.length === 6) {
                                        void submitTotp(digits);
                                    }
                                }}
                            />
                        )}

                        <div className="flex items-center justify-between text-[12px]">
                            <button
                                type="button"
                                onClick={goBackToPassword}
                                className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                            >
                                {t('返回', 'Back')}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setUseRecovery((v) => !v);
                                    setOtpStatus('idle');
                                    setError('');
                                }}
                                className="text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                            >
                                {useRecovery
                                    ? t('改用验证码', 'Use a verification code instead')
                                    : t('使用恢复码', 'Use a recovery code')}
                            </button>
                        </div>
                    </form>
                </>
            ) : (
                <>
                    <LoginBrand
                        title={t('进入工作台', 'Sign in to the workspace')}
                        subtitle={t(
                            '管理 QQ 会话与机器人连接。',
                            'Manage QQ sessions and bot connections.',
                        )}
                    />
                    <form onSubmit={handlePasswordSubmit} className="mt-8 flex flex-col gap-3.5">
                        <label htmlFor="login-password" className="text-sm font-medium">
                            {t('访问密码', 'Access password')}
                        </label>
                        <motion.div
                            key={shake}
                            animate={!reduce && shake > 0 ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : {}}
                            transition={{ duration: reduce ? 0 : performance?.low ? 0.18 : 0.4 }}
                            className="relative"
                        >
                            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="login-password"
                                name="password"
                                type={showPwd ? 'text' : 'password'}
                                placeholder={t('输入访问密码', 'Enter your access password')}
                                aria-label={t('访问密码', 'Access password')}
                                aria-invalid={!!error}
                                aria-describedby={error ? 'login-error' : undefined}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoFocus
                                autoComplete="current-password"
                                className="h-12 bg-background pl-10 pr-12 text-base"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPwd((v) => !v)}
                                className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label={
                                    showPwd
                                        ? t('隐藏密码', 'Hide password')
                                        : t('显示密码', 'Show password')
                                }
                            >
                                <PasswordVisibilityIcon visible={showPwd} reduceMotion={reduce} />
                            </button>
                        </motion.div>

                        {error && (
                            <motion.p
                                id="login-error"
                                role="alert"
                                initial={reduce ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
                            >
                                {loginErrorMessage(error, useRecovery, t)}
                            </motion.p>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || !password}
                            variant="glass"
                            className="h-12 text-[15px]"
                        >
                            {loading ? (
                                t('验证中…', 'Verifying…')
                            ) : (
                                <>
                                    {t('打开工作台', 'Open workspace')}{' '}
                                    <ArrowRight className="optical-forward size-4" />
                                </>
                            )}
                        </Button>
                    </form>
                </>
            )}
        </LoginShell>
    );
}

function LoginBrand({ title, subtitle }: { title: string; subtitle: string }) {
    const t = useT();
    return (
        <div className="workspace-auth-heading">
            <p className="workspace-eyebrow">{t('安全访问', 'Secure access')}</p>
            <h1>{title}</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
        </div>
    );
}

function LoginShell({
    customBg,
    reduce,
    wide = false,
    children,
}: {
    customBg: boolean;
    reduce: boolean;
    wide?: boolean;
    children: ReactNode;
}) {
    const t = useT();
    const { managedBy, performance } = useTheme();
    const lowCost = performance?.low ?? false;
    return (
        <div className={cn('workspace-auth-shell', customBg ? 'bg-transparent' : 'bg-background')}>
            {!customBg && <PaperBackdrop />}
            <header className="workspace-auth-masthead">
                <div className="workspace-auth-wordmark">
                    <img src={BRAND_LOGO_URL} alt="" className="size-7 rounded-md" />
                    <span>{APP_NAME}</span>
                    <span className="workspace-auth-version">v{APP_VERSION}</span>
                </div>
                <div className="workspace-toolbar-scene">
                    <LanguageToggle />
                    <ThemeToggle />
                </div>
            </header>
            <div className={cn('workspace-auth-content', wide && 'workspace-auth-content-wide')}>
                <aside
                    className="workspace-auth-identity"
                    aria-label={`${APP_NAME} ${t('QQ 连接控制台', 'QQ connection console')}`}
                >
                    <div className="workspace-auth-artwork">
                        <LineField animated={!reduce && !lowCost && !managedBy} />
                        <div className="workspace-auth-artwork-caption">
                            <span>{t('01 — 连接，从这里开始', '01 — Connect from here')}</span>
                            <span aria-hidden="true" className="workspace-line-key">
                                <i />
                                <i />
                                <i />
                                <i />
                            </span>
                        </div>
                    </div>
                    <div className="workspace-auth-introduction">
                        <p className="workspace-eyebrow">
                            {t('QQ 连接控制台', 'QQ connection console')}
                        </p>
                        <p className="workspace-auth-statement">
                            {t('连接有序，', 'Keep connections organized.')}
                            <br />
                            {t('结果清晰。', 'See results clearly.')}
                        </p>
                    </div>
                </aside>
                <motion.div
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={
                        reduce
                            ? { duration: 0 }
                            : lowCost
                              ? { duration: 0.18 }
                              : { type: 'spring', duration: 0.42, bounce: 0.1 }
                    }
                    className={cn('workspace-auth-document', wide ? 'max-w-2xl' : 'max-w-md')}
                >
                    <section className="workspace-auth-form" aria-label={t('登录', 'Sign in')}>
                        {children}
                    </section>
                </motion.div>
            </div>
            <footer className="workspace-auth-footer">
                {APP_NAME} · {t('QQ 连接控制台', 'QQ connection console')}
            </footer>
        </div>
    );
}
