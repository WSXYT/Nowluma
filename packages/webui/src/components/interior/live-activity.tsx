'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useIsPresent, useReducedMotionConfig } from 'motion/react';
import { useT } from '@/i18n';

const SURFACE = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } as const;
const CROSSFADE = { type: 'spring', stiffness: 260, damping: 34, mass: 0.8 } as const;
const FILL = { type: 'spring', stiffness: 210, damping: 34, mass: 0.9 } as const;
const EASE = [0.23, 1, 0.32, 1] as const;
const LEAVE = [0.4, 0, 1, 1] as const;
const DRAW = { duration: 0.3, ease: EASE } as const;
const INSTANT = { duration: 0 } as const;
const SPIN = { duration: 0.85, ease: 'linear', repeat: Infinity } as const;

const PEEK_FOR = 2600;
const LEAVE_DELAY = 160;

const face = (on: boolean) => (on ? '' : 'pointer-events-none');

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export type ActivityPhase = 'running' | 'success' | 'error';

export type Activity = {
    id: string;
    title: string;
    detail?: string;
    progress?: number | null;
    phase: ActivityPhase;
    action?: { label: string; onClick: () => void };
};

export type ActivityInput = {
    title: string;
    detail?: string;
    progress?: number | null;
};

export type UseLiveActivityOptions = {
    linger?: number;
};

export function useLiveActivity({ linger = 2000 }: UseLiveActivityOptions = {}) {
    const [activity, setActivity] = useState<Activity | null>(null);
    const seq = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clear = useCallback(() => {
        if (timer.current) {
            clearTimeout(timer.current);
        }

        timer.current = null;
    }, []);

    const start = useCallback(
        (input: ActivityInput) => {
            clear();
            seq.current += 1;
            const id = `activity-${seq.current}`;
            setActivity({ progress: null, ...input, id, phase: 'running' });
            return id;
        },
        [clear],
    );

    const update = useCallback((patch: Partial<ActivityInput>) => {
        setActivity((prev) => (prev ? { ...prev, ...patch } : prev));
    }, []);

    const dismiss = useCallback(() => {
        clear();
        setActivity(null);
    }, [clear]);

    const succeed = useCallback(
        (patch?: Partial<ActivityInput>) => {
            setActivity((prev) =>
                prev ? { ...prev, ...patch, phase: 'success', progress: 1 } : prev,
            );
            clear();
            timer.current = setTimeout(() => {
                timer.current = null;
                setActivity(null);
            }, linger);
        },
        [clear, linger],
    );

    const fail = useCallback(
        (patch?: Partial<ActivityInput>, action?: Activity['action']) => {
            clear();
            setActivity((prev) => (prev ? { ...prev, ...patch, phase: 'error', action } : prev));
        },
        [clear],
    );

    useEffect(() => clear, [clear]);

    return { activity, start, update, succeed, fail, dismiss };
}

export type UseLiveActivityReturn = ReturnType<typeof useLiveActivity>;

export type LiveActivityProps = {
    activity: Activity | null;
    onDismiss?: () => void;
    width?: number;
    dismissLabel?: string;
    label?: string;
    className?: string;
};

export function LiveActivity({
    activity,
    onDismiss,
    width = 300,
    dismissLabel,
    label,
    className = '',
}: LiveActivityProps) {
    const reduced = useReducedMotionConfig() === true;
    const t = useT();

    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [peekedKey, setPeekedKey] = useState<string | null>(null);
    const [spoken, setSpoken] = useState('');

    const compactRef = useRef<HTMLDivElement>(null);
    const expandedRef = useRef<HTMLDivElement>(null);
    const sizes = useRef({ c: { w: 0, h: 0 }, e: { w: 0, h: 0 } });
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const said = useRef<Set<string>>(new Set());

    const phase = activity?.phase ?? 'running';
    const activityKey = activity ? `${activity.id}:${activity.phase}` : null;
    const peeking = activityKey !== null && activityKey !== peekedKey;
    const expanded = activity !== null && (hovered || focused || peeking || phase === 'error');

    const apply = useCallback((open: boolean) => {
        const target = open ? sizes.current.e : sizes.current.c;

        if (target.w === 0 || target.h === 0) {
            return;
        }

        setDims((prev) =>
            prev && Math.abs(prev.w - target.w) < 0.5 && Math.abs(prev.h - target.h) < 0.5
                ? prev
                : { w: target.w, h: target.h },
        );
    }, []);

    useIsoLayoutEffect(() => {
        if (!activity) {
            return;
        }

        const read = () => {
            const c = compactRef.current;
            const e = expandedRef.current;

            if (c && c.offsetWidth > 0 && c.offsetHeight > 0) {
                sizes.current.c = { w: c.offsetWidth, h: c.offsetHeight };
            }

            if (e && e.offsetWidth > 0 && e.offsetHeight > 0) {
                sizes.current.e = { w: e.offsetWidth, h: e.offsetHeight };
            }

            apply(expanded);
        };

        read();

        if (typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(read);

        if (compactRef.current) {
            observer.observe(compactRef.current);
        }

        if (expandedRef.current) {
            observer.observe(expandedRef.current);
        }

        return () => observer.disconnect();
    }, [activity, expanded, apply]);

    useEffect(() => {
        if (!activityKey) {
            setHovered(false);
            setFocused(false);
            return;
        }

        // A new phase peeks immediately; progress updates keep the current geometry.
        peekTimer.current = setTimeout(() => {
            peekTimer.current = null;
            setPeekedKey(activityKey);
        }, PEEK_FOR);

        return () => {
            if (peekTimer.current) {
                clearTimeout(peekTimer.current);
                peekTimer.current = null;
            }
        };
    }, [activityKey]);

    useEffect(
        () => () => {
            if (leaveTimer.current) {
                clearTimeout(leaveTimer.current);
            }

            if (peekTimer.current) {
                clearTimeout(peekTimer.current);
            }
        },
        [],
    );

    useEffect(() => {
        if (!activity) {
            return;
        }

        const key = `${activity.id}:${activity.phase}`;

        if (said.current.has(key)) {
            return;
        }

        if (said.current.size > 64) {
            said.current.clear();
        }

        said.current.add(key);
        setSpoken(
            activity.phase === 'running'
                ? t(`${activity.title} 已开始。`, `${activity.title} started.`)
                : activity.phase === 'success'
                  ? t(`${activity.title} 已完成。`, `${activity.title} finished.`)
                  : t(`${activity.title} 失败。`, `${activity.title} failed.`),
        );
    }, [activity, t]);

    const enter = () => {
        if (leaveTimer.current) {
            clearTimeout(leaveTimer.current);
        }

        leaveTimer.current = null;
        setHovered(true);
    };

    const leave = () => {
        if (leaveTimer.current) {
            clearTimeout(leaveTimer.current);
        }

        leaveTimer.current = setTimeout(() => {
            leaveTimer.current = null;
            setHovered(false);
        }, LEAVE_DELAY);
    };

    const percent =
        activity?.progress === null || activity?.progress === undefined
            ? null
            : Math.round(Math.min(1, Math.max(0, activity.progress)) * 100);

    return (
        <div
            role="region"
            aria-label={label ?? t('活动', 'Activity')}
            aria-busy={activity?.phase === 'running'}
            aria-hidden={!activity}
            inert={!activity}
            className={`pointer-events-none flex justify-end ${className}`}
        >
            <AnimatePresence initial={false}>
                {activity ? (
                    <motion.div
                        key="pod"
                        initial={reduced ? false : { opacity: 0, y: 8 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            width: dims?.w,
                            height: dims?.h,
                        }}
                        exit={
                            reduced
                                ? { opacity: 0, height: 0, transition: INSTANT }
                                : {
                                      opacity: 0,
                                      height: 0,
                                      y: 6,
                                      transition: { duration: 0.16, ease: LEAVE },
                                  }
                        }
                        transition={
                            reduced
                                ? INSTANT
                                : {
                                      ...SURFACE,
                                      opacity: { duration: 0.2, ease: EASE },
                                  }
                        }
                        role="group"
                        aria-label={
                            activity.detail
                                ? `${activity.title}${t('：', ': ')}${activity.detail}`
                                : activity.title
                        }
                        tabIndex={0}
                        style={{ transformOrigin: '100% 100%' }}
                        onPointerEnter={enter}
                        onPointerLeave={leave}
                        onFocusCapture={() => setFocused(true)}
                        onBlurCapture={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                                setFocused(false);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key !== 'Escape') {
                                return;
                            }

                            e.preventDefault();

                            if (phase === 'running') {
                                setHovered(false);
                            } else {
                                onDismiss?.();
                            }
                        }}
                        className="action-feedback-surface pointer-events-auto relative overflow-hidden rounded-[14px] border border-border/80 bg-popover/95 text-popover-foreground shadow-[0_1px_2px_rgb(0_0_0/0.07),0_16px_36px_-18px_rgb(0_0_0/0.5)] backdrop-blur-xl"
                    >
                        <motion.div
                            ref={compactRef}
                            aria-hidden={expanded}
                            inert={expanded}
                            initial={false}
                            animate={{ opacity: expanded ? 0 : 1 }}
                            transition={reduced ? INSTANT : CROSSFADE}
                            className={`absolute left-0 top-0 flex h-11 w-max items-center gap-1.5 px-2.5 ${face(!expanded)}`}
                        >
                            <PhaseGlyph phase={phase} reduced={reduced} />
                            {percent !== null && phase === 'running' ? (
                                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                                    {percent}%
                                </span>
                            ) : (
                                <span className="max-w-[120px] truncate text-[12px] font-medium text-foreground">
                                    {activity.title}
                                </span>
                            )}
                        </motion.div>

                        <motion.div
                            ref={expandedRef}
                            aria-hidden={!expanded}
                            inert={!expanded}
                            initial={false}
                            animate={{ opacity: expanded ? 1 : 0 }}
                            transition={reduced ? INSTANT : CROSSFADE}
                            style={{ width, maxWidth: 'calc(100vw - 2rem)' }}
                            className={`absolute left-0 top-0 px-3.5 py-3 ${face(expanded)}`}
                        >
                            <div className="flex items-center gap-2">
                                <PhaseGlyph phase={phase} reduced={reduced} />
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                                    {activity.title}
                                </span>
                                {activity.action ? (
                                    <button
                                        type="button"
                                        tabIndex={expanded ? 0 : -1}
                                        onClick={activity.action.onClick}
                                        className="inline-flex min-h-11 shrink-0 select-none items-center whitespace-nowrap rounded-[6px] border border-border bg-background px-2 text-[11px] font-medium text-foreground shadow-sm outline-none transition-[background-color,border-color,box-shadow] duration-150 hover:bg-muted focus-visible:border-primary active:translate-y-px"
                                    >
                                        {activity.action.label}
                                    </button>
                                ) : null}
                                {onDismiss && phase !== 'running' ? (
                                    <button
                                        type="button"
                                        tabIndex={expanded ? 0 : -1}
                                        aria-label={
                                            dismissLabel ?? t('关闭活动', 'Dismiss activity')
                                        }
                                        onClick={onDismiss}
                                        className="grid size-11 shrink-0 place-items-center rounded-[6px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:bg-primary/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                                    >
                                        <svg
                                            width="10"
                                            height="10"
                                            viewBox="0 0 12 12"
                                            fill="none"
                                            aria-hidden
                                        >
                                            <path
                                                d="M2.8 2.8l6.4 6.4M9.2 2.8l-6.4 6.4"
                                                stroke="currentColor"
                                                strokeWidth="1.6"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    </button>
                                ) : null}
                            </div>

                            {activity.detail ? (
                                <p className="mt-1 truncate pl-[26px] text-[11.5px] text-muted-foreground">
                                    {activity.detail}
                                </p>
                            ) : null}

                            {percent !== null && phase !== 'error' ? (
                                <div className="mt-2.5 flex items-center gap-2 pl-[26px]">
                                    <div className="min-w-0 flex-1 rounded-[4px] bg-muted p-[2px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.12)]">
                                        <div className="relative h-[4px] overflow-hidden rounded-[2px]">
                                            <motion.span
                                                aria-hidden
                                                className="absolute inset-0 block origin-left rounded-[2px] bg-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.28)]"
                                                initial={false}
                                                animate={{ scaleX: (percent ?? 0) / 100 }}
                                                transition={reduced ? INSTANT : FILL}
                                            />
                                        </div>
                                    </div>
                                    <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                                        {percent}%
                                    </span>
                                </div>
                            ) : null}
                        </motion.div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
            <span role="status" aria-live="polite" className="sr-only">
                {spoken}
            </span>
        </div>
    );
}

function PhaseGlyph({ phase, reduced }: { phase: ActivityPhase; reduced: boolean }) {
    const present = useIsPresent();

    if (phase === 'running' && !present) {
        return null;
    }

    return (
        <span aria-hidden="true" className="grid size-[18px] shrink-0 place-items-center">
            {phase === 'running' ? (
                <motion.svg
                    width="13"
                    height="13"
                    viewBox="0 0 12 12"
                    style={{ transformOrigin: '50% 50%' }}
                    animate={reduced ? undefined : { rotate: 360 }}
                    transition={reduced ? INSTANT : SPIN}
                    className="text-primary"
                >
                    <circle
                        cx="6"
                        cy="6"
                        r="4.4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        fill="none"
                        opacity="0.25"
                    />
                    <path
                        d="M6 1.6a4.4 4.4 0 0 1 4.4 4.4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        fill="none"
                    />
                </motion.svg>
            ) : phase === 'success' ? (
                <svg
                    width="13"
                    height="13"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-success"
                >
                    <motion.path
                        d="M2.4 6.4 4.8 8.8 9.6 3.4"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={false}
                        animate={{ pathLength: 1 }}
                        transition={reduced ? INSTANT : DRAW}
                    />
                </svg>
            ) : (
                <svg
                    width="13"
                    height="13"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="text-destructive"
                >
                    <path
                        d="M6 2.6v3.6"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                    />
                    <rect x="5.2" y="8.2" width="1.6" height="1.6" rx="0.4" fill="currentColor" />
                </svg>
            )}
        </span>
    );
}
