import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InlineValidation } from '@/components/interior/inline-validation';
import {
    localizeRuleLabel,
    PasswordStrength,
    type PasswordRule as InteriorPasswordRule,
} from '@/components/interior/password-strength';
import { PasswordVisibilityIcon } from '@/components/ui/password-visibility-icon';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { defaultTranslate, translator, useLocale, useT, type Translate } from '@/i18n';

export interface PasswordRule {
    id: string;
    label: string;
    ok: boolean;
}

const EMPTY_RULES: readonly PasswordRule[] = [
    { id: 'length', label: '长度不少于 10 位', ok: false },
    { id: 'lower', label: '包含小写字母', ok: false },
    { id: 'upper', label: '包含大写字母', ok: false },
    { id: 'special', label: '包含特殊符号 (!@#$%…)', ok: false },
    { id: 'no-space', label: '不包含空格', ok: false },
];
const STRENGTH_LABELS = ['未输入', '很弱', '较弱', '一般', '良好', '强'] as const;

function passwordErrorMessage(message: string, t: Translate): string {
    switch (message) {
        case '当前密码不正确':
            return t(message, 'Incorrect current password');
        case '新密码不符合强度要求':
            return t(message, 'The new password does not meet the strength requirements');
        case '新密码不得与旧密码相同':
            return t(message, 'The new password must differ from the current password');
        case '请求格式错误':
            return t(message, 'Invalid request format');
        case '服务器未返回密码强度规则':
            return t(message, 'The server did not return password strength rules');
        case '密码强度接口返回了无效响应':
            return t(message, 'The password strength endpoint returned an invalid response');
        case '修改失败':
        case '密码修改失败':
            return t(message, 'Could not change the password');
        case '网络错误':
            return t(message, 'Network error');
        case '未知错误':
            return t(message, 'Unknown error');
        default:
            return message;
    }
}

/** Shown under the new-password field only while the animated rule list is hidden. */
export function passwordRequirementHint(
    options: {
        focused: boolean;
        value: string;
        checked: boolean;
        valid: boolean;
        rules: readonly PasswordRule[];
        checkError: string;
    },
    t: Translate = defaultTranslate,
): string | null {
    if (options.focused || options.value.length === 0) {
        return null;
    }

    if (options.checkError) {
        const detail = passwordErrorMessage(options.checkError, t);
        return t(`密码强度校验失败：${detail}`, `Could not check password strength: ${detail}`);
    }

    if (!options.checked || options.valid) {
        return null;
    }

    const unmet = options.rules.filter((rule) => !rule.ok);

    if (unmet.length === 0) {
        return t('密码尚未满足全部要求', 'The password does not yet meet all requirements');
    }

    const labels = unmet.map((rule) => localizeRuleLabel(rule, t)).join(t('、', ', '));
    return t(`仍需满足：${labels}`, `Still required: ${labels}`);
}

export interface ChangePasswordFormProps {
    /** Selects whether the form changes credentials or only rehearses validation. */
    mode?: 'change' | 'rehearsal';
    /**
     * When provided, the "current password" field is omitted entirely and this
     * value is used as the old password.
     *
     * Used by the forced first-time flow: the old password is *exactly* what
     * the user just logged in with, so we fill it ourselves. Rendering the
     * field at all let Edge/Chrome password-managers autofill it on upgrade —
     * users saw it pre-filled, assumed it was correct, and could never save
     * (the autofilled value was stale / not the temp password). Dropping the
     * field removes the trap entirely.
     */
    knownOldPassword?: string;
    /** Sends `{ password }`; returns the rule list + valid flag. */
    checkStrength: (password: string) => Promise<{ rules: PasswordRule[]; valid: boolean }>;
    /** Sends `{ oldPassword, newPassword }`. Returns success or error message. */
    submit: (
        oldPassword: string,
        newPassword: string,
    ) => Promise<{ success: boolean; message?: string }>;
    /** Called after a successful submit. */
    onSuccess: () => void;
    /** When provided, a cancel button is shown (used by the settings dialog). */
    onCancel?: () => void;
    /** Disambiguates input ids if two instances ever mount at once. */
    idPrefix?: string;
    submitLabel?: string;
    className?: string;
    renderActions?: (state: {
        canSubmit: boolean;
        /** Fields are filled enough to try saving; strength may still be unmet. */
        canAttempt: boolean;
        submitting: boolean;
        submitLabel: string;
    }) => ReactNode;
}

export function ChangePasswordForm({
    mode = 'change',
    knownOldPassword,
    checkStrength,
    submit,
    onSuccess,
    onCancel,
    idPrefix = 'cpw',
    submitLabel: customSubmitLabel,
    className,
    renderActions,
}: ChangePasswordFormProps) {
    const { language } = useLocale();
    const t = translator(language);
    const submitLabel = customSubmitLabel ?? t('保存新密码', 'Save new password');
    const rehearsing = mode === 'rehearsal';
    const carriesOld = rehearsing || knownOldPassword !== undefined;
    const { runAction } = useActionFeedback();
    const { appearance } = useTheme();
    const reduceMotion = appearance.reduceMotion || appearance.disableMotion;

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [newPasswordFocused, setNewPasswordFocused] = useState(false);
    const [strengthResult, setStrengthResult] = useState<{
        password: string;
        rules: PasswordRule[];
        valid: boolean;
    }>({ password: '', rules: [], valid: false });
    const [strengthFailure, setStrengthFailure] = useState<{
        password: string;
        message: string;
    } | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const effectiveOld = rehearsing ? '' : carriesOld ? (knownOldPassword as string) : oldPassword;
    const checkedCurrentPassword = strengthResult.password === newPassword;
    const valid = checkedCurrentPassword && strengthResult.valid;
    const strengthError = strengthFailure?.password === newPassword ? strengthFailure.message : '';
    const checkingStrength =
        newPassword.length > 0 && !checkedCurrentPassword && strengthError.length === 0;
    const displayedRules =
        checkedCurrentPassword && strengthResult.rules.length > 0
            ? strengthResult.rules
            : EMPTY_RULES;
    const strengthRules = useMemo<readonly InteriorPasswordRule[]>(
        () =>
            displayedRules.map((rule) => ({
                id: rule.id,
                label: rule.label,
                test: () => rule.ok,
            })),
        [displayedRules],
    );
    const confirmMatches = newPassword.length > 0 && newPassword === confirmPassword;
    const canAttempt =
        !submitting &&
        (rehearsing || effectiveOld.length > 0) &&
        confirmMatches &&
        (rehearsing || effectiveOld !== newPassword);
    const canSubmit = canAttempt && valid;
    const requirementHint = passwordRequirementHint(
        {
            focused: newPasswordFocused,
            value: newPassword,
            checked: checkedCurrentPassword,
            valid,
            rules: displayedRules,
            checkError: strengthError,
        },
        t,
    );
    const strengthErrorDetail = passwordErrorMessage(strengthError, t);

    // Debounce the strength check so we don't slam the API on every keystroke.
    useEffect(() => {
        if (newPassword.length === 0) {
            setStrengthFailure(null);
            return;
        }

        let cancelled = false;
        const handle = window.setTimeout(async () => {
            try {
                const res = await checkStrength(newPassword);

                if (cancelled) {
                    return;
                }

                if (res.rules.length === 0) {
                    throw new Error('服务器未返回密码强度规则');
                }

                setStrengthResult({ password: newPassword, rules: res.rules, valid: res.valid });
                setStrengthFailure(null);
            } catch (caught) {
                if (cancelled) {
                    return;
                }

                const message = actionErrorMessage(caught);
                console.error('check password strength failed', caught);
                setStrengthFailure({ password: newPassword, message });
            }
        }, 180);

        return () => {
            cancelled = true;
            window.clearTimeout(handle);
        };
    }, [newPassword, checkStrength]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!canAttempt) {
            return;
        }

        if (!valid) {
            setNewPasswordFocused(true);
            document.getElementById(`${idPrefix}-new`)?.focus();
            return;
        }

        setSubmitting(true);
        setError('');

        try {
            const res = await runAction(
                {
                    title: rehearsing
                        ? t('正在验证密码设置步骤', 'Checking password setup')
                        : t('正在更新访问密码', 'Updating access password'),
                    detail: rehearsing
                        ? t('演练内容不会保存', 'Rehearsal input will not be saved')
                        : t(
                              '正在保存新密码并使其他会话失效',
                              'Saving the new password and invalidating other sessions',
                          ),
                    successTitle: rehearsing
                        ? t('密码设置演练已完成', 'Password setup rehearsal complete')
                        : t('访问密码已更新', 'Access password updated'),
                    successDetail: rehearsing
                        ? t('未修改真实访问密码', 'The actual access password was not changed')
                        : t('其他会话已失效', 'Other sessions were invalidated'),
                    errorTitle: rehearsing
                        ? t('密码设置演练失败', 'Password setup rehearsal failed')
                        : t('访问密码更新失败', 'Could not update the access password'),
                    errorDetail: (error) => passwordErrorMessage(actionErrorMessage(error), t),
                    resultError: (result) =>
                        result.success
                            ? null
                            : passwordErrorMessage(result.message || '修改失败', t),
                },
                () => submit(effectiveOld, newPassword),
            );

            if (res.success) {
                onSuccess();
            } else {
                setError(res.message || '修改失败');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : '网络错误');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className={cn('flex flex-col gap-3', className)}>
            {!carriesOld && (
                <InlineValidation
                    id={`${idPrefix}-old`}
                    label={t('当前密码', 'Current password')}
                    type={showOld ? 'text' : 'password'}
                    autoComplete="current-password"
                    spellCheck={false}
                    required
                    value={oldPassword}
                    onChange={setOldPassword}
                    validationKey={language}
                    validate={(value) =>
                        value.length > 0 ? null : t('请输入当前密码', 'Enter your current password')
                    }
                    hint={t(
                        '用于确认当前管理员身份',
                        'Verifies the current administrator’s identity',
                    )}
                    showValidIcon={false}
                    endAdornment={
                        <PasswordVisibilityButton
                            visible={showOld}
                            reduceMotion={reduceMotion}
                            onToggle={() => setShowOld((current) => !current)}
                        />
                    }
                />
            )}

            <div>
                <InlineValidation
                    id={`${idPrefix}-new`}
                    label={t('新密码', 'New password')}
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    required
                    value={newPassword}
                    onChange={setNewPassword}
                    onFocus={() => setNewPasswordFocused(true)}
                    onBlur={() => setNewPasswordFocused(false)}
                    validationKey={`${effectiveOld}\0${newPasswordFocused}\0${valid}\0${strengthError}\0${requirementHint ?? ''}\0${language}`}
                    reserveLines={2}
                    validate={(value) => {
                        if (value.length === 0) {
                            return t('请输入新密码', 'Enter a new password');
                        }

                        if (!rehearsing && value === effectiveOld) {
                            return t(
                                '新密码不能与当前密码相同',
                                'The new password must differ from the current password',
                            );
                        }

                        return requirementHint;
                    }}
                    showValidIcon={false}
                    endAdornment={
                        <PasswordVisibilityButton
                            visible={showNew}
                            reduceMotion={reduceMotion}
                            onToggle={() => setShowNew((current) => !current)}
                        />
                    }
                />

                <div aria-busy={checkingStrength || undefined}>
                    <PasswordStrength
                        value={newPassword}
                        rules={strengthRules}
                        labels={STRENGTH_LABELS}
                        visible={newPasswordFocused}
                        className="mt-1"
                        status={
                            checkingStrength ? (
                                <span className="text-muted-foreground">
                                    {t('正在校验密码强度…', 'Checking password strength…')}
                                </span>
                            ) : strengthError ? (
                                <span role="alert" className="text-destructive">
                                    {t(
                                        `密码强度校验失败：${strengthErrorDetail}`,
                                        `Could not check password strength: ${strengthErrorDetail}`,
                                    )}
                                </span>
                            ) : null
                        }
                    />
                </div>
            </div>

            <InlineValidation
                id={`${idPrefix}-confirm`}
                label={t('确认新密码', 'Confirm new password')}
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                spellCheck={false}
                required
                value={confirmPassword}
                onChange={setConfirmPassword}
                validationKey={`${newPassword}\0${language}`}
                validate={(value) => {
                    if (value.length === 0) {
                        return t('请再次输入新密码', 'Enter the new password again');
                    }

                    if (value !== newPassword) {
                        return t('两次输入的密码不一致', 'The two passwords do not match');
                    }

                    return null;
                }}
                hint={t('需要与新密码完全一致', 'Must match the new password exactly')}
                endAdornment={
                    <PasswordVisibilityButton
                        visible={showNew}
                        reduceMotion={reduceMotion}
                        onToggle={() => setShowNew((current) => !current)}
                    />
                }
            />

            <AnimatePresence>
                {error && (
                    <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
                    >
                        {passwordErrorMessage(error, t)}
                    </motion.p>
                )}
            </AnimatePresence>

            {renderActions ? (
                renderActions({ canSubmit, canAttempt, submitting, submitLabel })
            ) : (
                <div className="flex items-center gap-2 pt-1">
                    {onCancel && (
                        <Button type="button" variant="ghost" onClick={onCancel} className="h-10">
                            {t('取消', 'Cancel')}
                        </Button>
                    )}
                    <Button type="submit" disabled={!canAttempt} className="ml-auto h-10">
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
        </form>
    );
}

function PasswordVisibilityButton({
    visible,
    reduceMotion,
    onToggle,
}: {
    visible: boolean;
    reduceMotion: boolean;
    onToggle: () => void;
}) {
    const t = useT();
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-label={visible ? t('隐藏密码', 'Hide password') : t('显示密码', 'Show password')}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary sm:size-7"
        >
            <PasswordVisibilityIcon visible={visible} reduceMotion={reduceMotion} />
        </button>
    );
}
