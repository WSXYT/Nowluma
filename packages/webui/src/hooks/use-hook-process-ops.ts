import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useApi, type ProcessActionResult } from '@/lib/api';
import { useT, type Translate } from '@/i18n';

export type HookProcessOpKind = 'load' | 'unload' | 'refresh';

export interface HookProcessOps {
    /** Returns the in-flight op kind for a pid, or null if idle. */
    statusOf(pid: number): HookProcessOpKind | null;
    /** True only for a read/choice wait that unload can replace without interrupting a write. */
    canCancelAttach?(pid: number): boolean;
    /** Latest user-facing status; auto-clears a few seconds after the last update. */
    banner: string;
    load(pid: number): Promise<void>;
    unload(pid: number): Promise<void>;
    refresh(pid: number): Promise<void>;
}

export interface UnloadFailedAlert {
    pid: number;
    error: string;
}

export interface UseHookProcessOpsResult {
    ops: HookProcessOps;
    unloadFailedAlert: UnloadFailedAlert | null;
    dismissUnloadFailedAlert: () => void;
    cancelPending: () => void;
}

interface KindMessages {
    start(pid: number, t: Translate): string;
    ok(pid: number, t: Translate): string;
    errorTitle(t: Translate): string;
}

const KIND_MESSAGES: Record<HookProcessOpKind, KindMessages> = {
    load: {
        start: (pid, t) =>
            t(`正在向进程 ${pid} 加载 Nowluma…`, `Loading Nowluma into process ${pid}…`),
        ok: (pid, t) =>
            t(
                `已向进程 ${pid} 注入 Nowluma，等待管道连接…`,
                `Nowluma loaded into process ${pid}. Waiting for the pipe to connect…`,
            ),
        errorTitle: (t) => t('加载失败', 'Load failed'),
    },
    unload: {
        start: (pid, t) => t(`正在从进程 ${pid} 卸载…`, `Unloading from process ${pid}…`),
        ok: (pid, t) => t(`已从进程 ${pid} 卸载`, `Unloaded from process ${pid}`),
        errorTitle: (t) => t('卸载失败', 'Unload failed'),
    },
    refresh: {
        start: (pid, t) =>
            t(`正在刷新进程 ${pid} 的管道状态…`, `Refreshing pipe status for process ${pid}…`),
        ok: (pid, t) =>
            t(`已刷新进程 ${pid} 的管道状态`, `Refreshed pipe status for process ${pid}`),
        errorTitle: (t) => t('刷新失败', 'Refresh failed'),
    },
};

type ProcessBanner =
    | { state: 'start' | 'ok'; pid: number; kind: HookProcessOpKind }
    | { state: 'failed'; kind: HookProcessOpKind; detail?: string }
    | { state: 'unloadFailed'; pid: number };

function formatBanner(banner: ProcessBanner | null, t: Translate): string {
    if (!banner) {
        return '';
    }

    switch (banner.state) {
        case 'start':
        case 'ok':
            return KIND_MESSAGES[banner.kind][banner.state](banner.pid, t);

        case 'failed': {
            const title = KIND_MESSAGES[banner.kind].errorTitle(t);
            const detail = banner.detail ?? t('未知错误', 'Unknown error');
            return t(`${title}：${detail}`, `${title}: ${detail}`);
        }

        case 'unloadFailed':
            return t(`进程 ${banner.pid} 卸载失败`, `Unload failed for process ${banner.pid}`);
    }
}

interface ProcessRun {
    controller: AbortController;
    phase: 'authorization' | 'policy' | 'native';
    unloadRequested: boolean;
    queuedUnload?: Promise<void>;
    settled: Promise<void>;
}

const BANNER_CLEAR_MS = 4000;

// Cancellation must settle the gate even if a read's underlying response arrives late.
async function waitForAuthorization(authorization: Promise<boolean>, signal: AbortSignal) {
    let cancel!: () => void;
    const canceled = new Promise<boolean>((resolve) => {
        cancel = () => resolve(false);
        signal.addEventListener('abort', cancel, { once: true });

        if (signal.aborted) {
            cancel();
        }
    });

    try {
        return await Promise.race([authorization, canceled]);
    } finally {
        signal.removeEventListener('abort', cancel);
    }
}

/**
 * Drives load/unload/refresh actions on Hook-target processes. Owns the
 * per-pid inflight dedup, the per-kind status indicator, the banner message
 * lifecycle, and the "unload silently failed" alert that surfaces when the
 * backend reports the named pipe is still alive after an unload attempt.
 */
export function useHookProcessOps(
    opts: {
        onAfterOp?: () => Promise<void> | void;
        beforeAttach?: (
            pid: number,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ) => Promise<boolean>;
    } = {},
): UseHookProcessOpsResult {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const t = useT();
    const tRef = useRef(t);
    useLayoutEffect(() => {
        tRef.current = t;
    }, [t]);
    const [byPid, setByPid] = useState<Map<number, HookProcessOpKind>>(() => new Map());
    const [banner, setBanner] = useState<ProcessBanner | null>(null);
    const [unloadFailedAlert, setUnloadFailedAlert] = useState<UnloadFailedAlert | null>(null);

    // Synchronous inflight guard — protects against rapid double-clicks that
    // would race the byPid setter (state updates are batched, refs are not).
    const activeRuns = useRef(new Map<number, ProcessRun>());
    const bannerTimerRef = useRef<number | null>(null);
    const onAfterOpRef = useRef(opts.onAfterOp);
    onAfterOpRef.current = opts.onAfterOp;
    const beforeAttachRef = useRef(opts.beforeAttach);
    beforeAttachRef.current = opts.beforeAttach;
    const mounted = useRef(false);

    const cancelPending = useCallback(() => {
        for (const current of activeRuns.current.values()) {
            current.unloadRequested = false;
            current.controller.abort();
        }
    }, []);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            cancelPending();

            if (bannerTimerRef.current != null) {
                window.clearTimeout(bannerTimerRef.current);
            }
        };
    }, [cancelPending]);

    const scheduleBannerClear = useCallback(() => {
        if (bannerTimerRef.current != null) {
            window.clearTimeout(bannerTimerRef.current);
        }

        bannerTimerRef.current = window.setTimeout(() => {
            setBanner(null);
            bannerTimerRef.current = null;
        }, BANNER_CLEAR_MS);
    }, []);

    const setKind = useCallback((pid: number, kind: HookProcessOpKind | null) => {
        setByPid((prev) => {
            const next = new Map(prev);

            if (kind == null) {
                next.delete(pid);
            } else {
                next.set(pid, kind);
            }

            return next;
        });
    }, []);

    const run = useCallback(
        async (
            pid: number,
            kind: HookProcessOpKind,
            action: (signal: AbortSignal) => Promise<ProcessActionResult>,
        ): Promise<void> => {
            if (!mounted.current) {
                return;
            }

            const previous = activeRuns.current.get(pid);

            if (previous) {
                if (kind !== 'unload' || previous.phase === 'native') {
                    return;
                }

                if (previous.unloadRequested && previous.queuedUnload) {
                    return previous.queuedUnload;
                }

                previous.unloadRequested = true;

                if (previous.phase === 'policy') {
                    setKind(pid, 'unload');
                    previous.queuedUnload = previous.settled.then(() => {
                        if (
                            !mounted.current ||
                            !previous.unloadRequested ||
                            activeRuns.current.get(pid) !== previous
                        ) {
                            return;
                        }

                        activeRuns.current.delete(pid);
                        return run(pid, 'unload', action);
                    });
                    return previous.queuedUnload;
                }

                previous.controller.abort();
            }

            let complete!: () => void;
            const current: ProcessRun = {
                controller: new AbortController(),
                phase: 'authorization',
                unloadRequested: false,
                settled: new Promise<void>((resolve) => {
                    complete = resolve;
                }),
            };
            const { signal } = current.controller;
            activeRuns.current.set(pid, current);
            setKind(pid, kind);
            const messages = KIND_MESSAGES[kind];

            const getFeedback = () => {
                const translate = tRef.current;
                return {
                    title: messages.start(pid, translate),
                    detail: `PID ${pid}`,
                    successTitle: messages.ok(pid, translate),
                    successDetail: `PID ${pid}`,
                    errorTitle: messages.errorTitle(translate),
                    resultError: (outcome: ProcessActionResult) =>
                        kind === 'unload' &&
                        outcome.process?.status === 'connecting' &&
                        outcome.process.error
                            ? outcome.process.error
                            : null,
                };
            };

            let actionStarted = false;

            try {
                if (kind !== 'unload' && beforeAttachRef.current) {
                    const allowed = await waitForAuthorization(
                        beforeAttachRef.current(pid, signal, (writing) => {
                            if (activeRuns.current.get(pid) !== current || !mounted.current) {
                                return;
                            }

                            current.phase = writing ? 'policy' : 'authorization';

                            if (!writing && current.unloadRequested) {
                                current.controller.abort();
                            } else {
                                setKind(pid, kind);
                            }
                        }),
                        signal,
                    );

                    if (!allowed) {
                        return;
                    }
                }

                if (signal.aborted || !mounted.current || activeRuns.current.get(pid) !== current) {
                    return;
                }

                current.phase = 'native';
                setKind(pid, kind);
                setBanner({ state: 'start', pid, kind });
                actionStarted = true;
                const result = await runAction(getFeedback(), async () => {
                    const outcome = await action(signal);
                    signal.throwIfAborted();

                    if (typeof outcome.success !== 'boolean' || outcome.process?.pid !== pid) {
                        throw new Error(
                            tRef.current(
                                '未能确认操作结果，请检查当前 QQ 状态',
                                'Could not confirm the result. Check the current QQ status.',
                            ),
                        );
                    }

                    if (!outcome.success || outcome.process.status === 'error') {
                        throw new Error(
                            outcome.process.error ||
                                outcome.message ||
                                tRef.current('操作失败', 'Operation failed'),
                        );
                    }

                    return outcome;
                });

                if (signal.aborted || !mounted.current) {
                    return;
                }

                if (
                    kind === 'unload' &&
                    result.process?.status === 'connecting' &&
                    result.process.error
                ) {
                    setUnloadFailedAlert({ pid, error: result.process.error });
                    setBanner({ state: 'unloadFailed', pid });
                } else {
                    setBanner({ state: 'ok', pid, kind });
                }

                await onAfterOpRef.current?.();
            } catch (e) {
                if (signal.aborted || !mounted.current || activeRuns.current.get(pid) !== current) {
                    return;
                }

                if (!actionStarted) {
                    await runAction(getFeedback(), async () => {
                        throw e;
                    }).catch(() => undefined);
                }

                if (!signal.aborted && mounted.current && activeRuns.current.get(pid) === current) {
                    setBanner({
                        state: 'failed',
                        kind,
                        detail: e instanceof Error ? e.message : undefined,
                    });
                }
            } finally {
                if (activeRuns.current.get(pid) === current && !current.unloadRequested) {
                    activeRuns.current.delete(pid);

                    if (mounted.current) {
                        setKind(pid, null);
                        scheduleBannerClear();
                    }
                }

                complete();
            }
        },
        [setKind, scheduleBannerClear, runAction],
    );

    const load = useCallback(
        (pid: number) => run(pid, 'load', (signal) => api.processes.load(pid, signal)),
        [api, run],
    );
    const unload = useCallback(
        (pid: number) => run(pid, 'unload', (signal) => api.processes.unload(pid, signal)),
        [api, run],
    );
    const refresh = useCallback(
        (pid: number) => run(pid, 'refresh', (signal) => api.processes.refresh(pid, signal)),
        [api, run],
    );

    const statusOf = useCallback(
        (pid: number): HookProcessOpKind | null => byPid.get(pid) ?? null,
        [byPid],
    );

    const canCancelAttach = useCallback((pid: number): boolean => {
        const current = activeRuns.current.get(pid);
        return current?.phase === 'authorization' && !current.unloadRequested;
    }, []);

    const dismissUnloadFailedAlert = useCallback(() => setUnloadFailedAlert(null), []);

    const bannerText = formatBanner(banner, t);

    const ops = useMemo<HookProcessOps>(
        () => ({ statusOf, canCancelAttach, banner: bannerText, load, unload, refresh }),
        [statusOf, canCancelAttach, bannerText, load, unload, refresh],
    );

    return { ops, unloadFailedAlert, dismissUnloadFailedAlert, cancelPending };
}
