'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { defaultTranslate, useT, type Translate } from '@/i18n';

const CELL = { type: 'spring', stiffness: 520, damping: 34, mass: 0.45 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const INSTANT = { duration: 0 } as const;

const COMMON =
    /^(?:password|passw0rd|qwerty|letmein|welcome|admin|iloveyou|monkey|dragon|abc123|111111|123123|123456)/i;
const RUN = /(.)\1{3,}/;
const RUN_UP = /(?:0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|wert|erty|asdf)/i;
const SYMBOL = /[!-/:-@[-`{-~]/;

export type PasswordRule = {
    id: string;
    label: string;
    test: (value: string) => boolean;
};

export type EvaluatedRule = PasswordRule & { met: boolean };

export type UsePasswordStrengthOptions = {
    rules?: readonly PasswordRule[];
    labels?: readonly string[];
    announceDelay?: number;
};

export type PasswordStrengthState = {
    /** Display steps, independent of the number of password rules. */
    score: number;
    max: number;
    label: string;
    labels: readonly string[];
    rules: EvaluatedRule[];
    guessable: boolean;
    announcement: string;
};

export const defaultPasswordRules: readonly PasswordRule[] = [
    { id: 'length', label: '至少 12 个字符', test: (v) => v.length >= 12 },
    {
        id: 'case',
        label: '同时包含大写和小写字母',
        test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
    },
    { id: 'digit', label: '包含数字', test: (v) => /\d/.test(v) },
    { id: 'symbol', label: '包含特殊符号', test: (v) => SYMBOL.test(v) },
];

const defaultLabels = ['未输入', '弱', '一般', '良好', '强'] as const;

/** Official scale labels; custom labels stay verbatim. */
const STRENGTH_LABEL_EN: Record<string, string> = {
    未输入: 'Not entered',
    弱: 'Weak',
    很弱: 'Very weak',
    较弱: 'Fairly weak',
    一般: 'Fair',
    良好: 'Good',
    强: 'Strong',
};

/** Official rule ids/labels from the server and the local defaults. */
const RULE_LABEL_EN: Record<string, Record<string, string>> = {
    length: {
        '至少 12 个字符': 'At least 12 characters',
        '长度不少于 10 位': 'At least 10 characters',
    },
    case: { 同时包含大写和小写字母: 'Include uppercase and lowercase letters' },
    digit: { 包含数字: 'Include a number' },
    symbol: { 包含特殊符号: 'Include a symbol' },
    lower: { 包含小写字母: 'Include a lowercase letter' },
    upper: { 包含大写字母: 'Include an uppercase letter' },
    special: { '包含特殊符号 (!@#$%…)': 'Include a symbol (!@#$%…)' },
    'no-space': { 不包含空格: 'No spaces' },
};

export function localizeRuleLabel(
    rule: Pick<PasswordRule, 'id' | 'label'>,
    t: Translate = defaultTranslate,
): string {
    const english = RULE_LABEL_EN[rule.id]?.[rule.label];

    return english ? t(rule.label, english) : rule.label;
}

export function usePasswordStrength(
    value: string,
    {
        rules = defaultPasswordRules,
        labels = defaultLabels,
        announceDelay = 700,
    }: UsePasswordStrengthOptions = {},
): PasswordStrengthState {
    const t = useT();
    const state = useMemo(() => {
        const evaluated = rules.map((rule) => ({
            ...rule,
            label: localizeRuleLabel(rule, t),
            met: rule.test(value),
        }));
        const passed = evaluated.reduce((n, r) => n + (r.met ? 1 : 0), 0);
        const guessable =
            value.length > 0 && (COMMON.test(value) || RUN.test(value) || RUN_UP.test(value));

        // A weak step must remain below full, including for custom label lists.
        const sourceLabels = labels.length >= 3 ? labels : defaultLabels;
        const strengthLabels = sourceLabels.map((label) => {
            const english = STRENGTH_LABEL_EN[label];

            return english ? t(label, english) : label;
        });
        const max = strengthLabels.length - 1;
        const score =
            value.length === 0
                ? 0
                : guessable || rules.length === 0
                  ? 1
                  : Math.max(1, Math.floor((passed / rules.length) * max));

        const label = strengthLabels[score];
        const unmet = evaluated.filter((r) => !r.met);

        const announcement =
            value.length === 0
                ? ''
                : [
                      t(`密码强度${label}。`, `Password strength: ${label}.`),
                      guessable
                          ? t('这是容易被猜中的常见模式。', 'This is a commonly guessed pattern.')
                          : '',
                      evaluated.length === 0
                          ? t('尚未获取密码要求。', 'Password requirements are not available yet.')
                          : unmet.length === 0
                            ? t('已满足全部要求。', 'All requirements are met.')
                            : t(
                                  `仍需满足：${unmet.map((r) => r.label).join('、')}。`,
                                  `Still required: ${unmet.map((r) => r.label).join(', ')}.`,
                              ),
                  ]
                      .filter(Boolean)
                      .join(' ');

        return {
            score,
            max,
            label,
            labels: strengthLabels,
            rules: evaluated,
            guessable,
            announcement,
        };
    }, [value, rules, labels, t]);

    const [settled, setSettled] = useState('');

    useEffect(() => {
        if (state.announcement === '') {
            setSettled('');
            return;
        }

        const id = setTimeout(() => setSettled(state.announcement), announceDelay);
        return () => clearTimeout(id);
    }, [state.announcement, announceDelay]);

    return { ...state, announcement: settled };
}

export type PasswordStrengthProps = {
    value: string;
    rules?: readonly PasswordRule[];
    labels?: readonly string[];
    announceDelay?: number;
    showRules?: boolean;
    visible?: boolean;
    status?: React.ReactNode;
    className?: string;
};

const TONES = {
    none: { bar: 'bg-muted-foreground/30', text: 'text-muted-foreground' },
    danger: { bar: 'bg-destructive', text: 'text-destructive' },
    caution: { bar: 'bg-warning', text: 'text-warning' },
    safe: { bar: 'bg-success', text: 'text-success' },
} as const;

function toneFor(score: number, max: number) {
    if (score === 0) {
        return TONES.none;
    }

    const ratio = score / max;

    if (ratio <= 0.34) {
        return TONES.danger;
    }

    if (ratio <= 0.67) {
        return TONES.caution;
    }

    return TONES.safe;
}

export function PasswordStrength({
    value,
    rules = defaultPasswordRules,
    labels = defaultLabels,
    announceDelay = 700,
    showRules = true,
    visible = true,
    status,
    className = '',
}: PasswordStrengthProps) {
    const {
        score,
        max,
        label,
        labels: strengthLabels,
        rules: evaluated,
        guessable,
        announcement,
    } = usePasswordStrength(value, { rules, labels, announceDelay });
    const reduced = useReducedMotionConfig();
    const tone = toneFor(score, max);
    const t = useT();

    return (
        <AnimatePresence initial={false}>
            {visible ? (
                <motion.div
                    key="password-strength"
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={reduced ? INSTANT : CROSSFADE}
                    style={{ overflow: 'hidden' }}
                    className={`w-full ${className}`}
                >
                    <div
                        role="meter"
                        aria-label={t('密码强度', 'Password strength')}
                        aria-valuemin={0}
                        aria-valuemax={max}
                        aria-valuenow={score}
                        aria-valuetext={label}
                        className="grid gap-1.5"
                        style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}
                    >
                        {Array.from({ length: max }, (_, i) => (
                            <div
                                key={i}
                                className="relative h-1.5 overflow-hidden rounded-[2px] bg-muted"
                            >
                                <motion.span
                                    className={`absolute inset-0 origin-left rounded-[2px] transition-colors duration-200 ${tone.bar}`}
                                    initial={false}
                                    animate={{ scaleX: i < score ? 1 : 0 }}
                                    transition={
                                        reduced
                                            ? INSTANT
                                            : { ...CELL, delay: i < score ? i * 0.03 : 0 }
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    <div className="mt-2 flex h-5 items-center justify-between gap-3">
                        <span className="inline-grid text-[12.5px] font-medium leading-5">
                            {strengthLabels.map((text, i) => (
                                <motion.span
                                    key={text}
                                    aria-hidden
                                    className={`col-start-1 row-start-1 whitespace-nowrap transition-colors duration-200 ${tone.text}`}
                                    initial={false}
                                    animate={{
                                        opacity: i === score ? 1 : 0,
                                    }}
                                    transition={reduced ? INSTANT : CROSSFADE}
                                >
                                    {text}
                                </motion.span>
                            ))}
                        </span>

                        <motion.span
                            aria-hidden
                            className="whitespace-nowrap text-[11.5px] leading-5 text-warning"
                            initial={false}
                            animate={{ opacity: guessable ? 1 : 0 }}
                            transition={reduced ? INSTANT : CROSSFADE}
                        >
                            {t('容易被猜中', 'Easily guessed')}
                        </motion.span>
                    </div>

                    {showRules && (
                        <ul className="mt-3 grid gap-1.5">
                            {evaluated.map((rule) => (
                                <li key={rule.id} className="flex items-center gap-2">
                                    <span className="relative grid size-[14px] shrink-0 place-items-center rounded-[4px] border border-border text-primary-foreground">
                                        <motion.span
                                            className="absolute inset-0 rounded-[3px] bg-success"
                                            initial={false}
                                            animate={{ opacity: rule.met ? 1 : 0 }}
                                            transition={reduced ? INSTANT : CROSSFADE}
                                        />
                                        <motion.svg
                                            viewBox="0 0 12 12"
                                            fill="none"
                                            aria-hidden
                                            className="relative size-[9px]"
                                            initial={false}
                                            animate={{
                                                opacity: rule.met ? 1 : 0,
                                                scale: rule.met ? 1 : 0.6,
                                            }}
                                            transition={reduced ? INSTANT : CELL}
                                        >
                                            <path
                                                d="M2 6.2 4.7 8.9 10 3.3"
                                                stroke="currentColor"
                                                strokeWidth={1.9}
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </motion.svg>
                                    </span>
                                    <span
                                        className={`text-[12.5px] leading-5 transition-colors duration-200 ${
                                            rule.met ? 'text-foreground' : 'text-muted-foreground'
                                        }`}
                                    >
                                        {rule.label}
                                    </span>
                                    <span className="sr-only">
                                        {rule.met ? t('已满足', 'Met') : t('未满足', 'Not met')}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {status ? <div className="mt-2 text-[11.5px] leading-4">{status}</div> : null}

                    <p aria-live="polite" className="sr-only">
                        {announcement}
                    </p>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}
