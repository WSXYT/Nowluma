import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { REWRITE_KERNEL_UNAVAILABLE_REASON } from '@nowluma/common/kernel-display';
import { isRealUin } from '@nowluma/common/uin';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useT, type Translate } from '@/i18n';
import { ApiError, useApi, type KernelCatalog, type KernelChoiceInput } from '@/lib/api';
import { readSaveKernelChoiceResult } from '@/lib/api/kernel';

export interface KernelChoiceTarget {
    pid: number;
    path: string;
    uin: string;
    nickname: string;
    injected: boolean;
}

export interface PendingKernelChoice {
    target: KernelChoiceTarget;
    catalog: KernelCatalog;
    confirm(choice: KernelChoiceInput): Promise<void>;
    cancel(): void;
}

const ACCOUNT_REQUIRED = '尚未识别当前 QQ 账号，请先在 QQ 登录后再选择接入内核';
const ACCOUNT_CHANGED = 'QQ 账号或进程已变化，请为当前账号重新选择接入内核';
const CHOICE_PENDING = '请先完成或取消当前账号的内核选择';
const DISCLOSURE_REQUIRED = '请主动确认当前版本的兼容内核风险';
const CHOICE_NOT_APPLIED = '当前账号的内核选择未生效，请重新确认';

export function kernelErrorMessage(message: string, t: Translate): string {
    switch (message) {
        case ACCOUNT_REQUIRED:
            return t(
                message,
                'No QQ account detected. Sign in to QQ before choosing a connection kernel.',
            );
        case ACCOUNT_CHANGED:
            return t(
                message,
                'The QQ account or process changed. Choose a connection kernel again for the current account.',
            );
        case CHOICE_PENDING:
            return t(message, 'Finish or cancel this account’s pending kernel choice first.');
        case DISCLOSURE_REQUIRED:
            return t(
                message,
                'Explicitly acknowledge the current compatibility kernel disclosure.',
            );
        case CHOICE_NOT_APPLIED:
            return t(
                message,
                'The kernel choice did not take effect for this account. Confirm it again.',
            );
        case '请先选择当前 QQ 账号':
            return t(message, 'Select the current QQ account first.');
        case 'QQ 账号已变化，请重新选择当前账号':
            return t(message, 'The QQ account changed. Select the current account again.');
        case '内核选择已取消':
            return t(message, 'Kernel choice canceled');
        case REWRITE_KERNEL_UNAVAILABLE_REASON:
            return t(
                message,
                'The rewritten kernel has not been verified on this platform and is unavailable.',
            );
        case '必须主动确认兼容内核风险':
            return t(
                message,
                'You must explicitly acknowledge the risks of the compatibility kernel.',
            );
        case '风险说明版本已更新，请重新阅读并确认':
            return t(
                message,
                'The risk disclosure has been updated. Read it and acknowledge it again.',
            );
        case '内核选择请求格式无效':
            return t(message, 'Invalid kernel choice request.');
        case '服务端返回了无效的内核策略响应':
            return t(message, 'The server returned an invalid kernel policy response.');
        case '未知错误':
            return t(message, 'Unknown error');
        default:
            return message;
    }
}

export function kernelSaveFeedback(uin: string, t: Translate) {
    return {
        title: t('正在保存内核选择', 'Saving kernel choice'),
        detail: `QQ ${uin}`,
        successTitle: t('内核选择已保存', 'Kernel choice saved'),
        successDetail: t(`仅对 QQ ${uin} 生效`, `Applies only to QQ ${uin}`),
        errorTitle: t('内核选择保存失败', 'Could not save the kernel choice'),
        errorDetail: (error: unknown) => kernelErrorMessage(actionErrorMessage(error), t),
    };
}

export function useKernelChoice() {
    const api = useApi();
    const { runAction } = useActionFeedback();
    const t = useT();
    const currentTranslate = useRef(t);
    const [pending, setPending] = useState<PendingKernelChoice | null>(null);
    const pendingRef = useRef<PendingKernelChoice | null>(null);
    const mounted = useRef(false);

    // Pending confirmations survive language switches and use the locale at save time.
    useLayoutEffect(() => {
        currentTranslate.current = t;
    }, [t]);

    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            pendingRef.current?.cancel();
        };
    }, []);

    const readTarget = useCallback(
        async (pid: number, signal: AbortSignal) => {
            const processes = await api.processes.list(signal);
            signal.throwIfAborted();
            const matches = processes.filter((process) => process.pid === pid);
            const process = matches.length === 1 ? matches[0] : undefined;
            const uin = process?.account?.uin;

            if (typeof uin !== 'string' || !isRealUin(uin)) {
                throw new ApiError(
                    409,
                    kernelErrorMessage(ACCOUNT_REQUIRED, currentTranslate.current),
                );
            }

            return {
                pid,
                path: process!.path,
                uin,
                nickname: process!.account!.nickname,
                injected: process!.injected,
            };
        },
        [api],
    );

    const recheckTarget = useCallback(
        async (target: KernelChoiceTarget, signal: AbortSignal) => {
            const current = await readTarget(target.pid, signal);

            if (current.uin !== target.uin || current.path !== target.path) {
                throw new ApiError(
                    409,
                    kernelErrorMessage(ACCOUNT_CHANGED, currentTranslate.current),
                );
            }
        },
        [readTarget],
    );

    const ask = useCallback(
        (
            target: KernelChoiceTarget,
            catalog: KernelCatalog,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ) => {
            if (pendingRef.current) {
                throw new ApiError(
                    409,
                    kernelErrorMessage(CHOICE_PENDING, currentTranslate.current),
                );
            }

            signal.throwIfAborted();
            return new Promise<boolean>((resolve) => {
                let saving = false;

                const finish = (accepted: boolean) => {
                    signal.removeEventListener('abort', cancel);

                    if (pendingRef.current === request) {
                        pendingRef.current = null;

                        if (mounted.current) {
                            setPending(null);
                        }
                    }

                    resolve(accepted);
                };

                const cancel = () => finish(false);
                const request: PendingKernelChoice = {
                    target,
                    catalog,
                    cancel,
                    confirm: async (choice) => {
                        if (
                            saving ||
                            pendingRef.current !== request ||
                            signal.aborted ||
                            !mounted.current
                        ) {
                            return;
                        }

                        if (
                            choice.kernel !== 'compat' ||
                            !choice.riskAccepted ||
                            choice.riskVersion !== catalog.riskVersion
                        ) {
                            throw new ApiError(
                                400,
                                kernelErrorMessage(DISCLOSURE_REQUIRED, currentTranslate.current),
                            );
                        }

                        saving = true;

                        try {
                            await recheckTarget(target, signal);

                            if (pendingRef.current !== request || !mounted.current) {
                                return;
                            }

                            onPolicyWrite?.(true);

                            try {
                                await runAction(
                                    kernelSaveFeedback(target.uin, currentTranslate.current),
                                    async () => {
                                        const result = readSaveKernelChoiceResult(
                                            await api.kernel.save(target.uin, choice, signal),
                                            choice,
                                        );
                                        signal.throwIfAborted();
                                        return result;
                                    },
                                );
                            } finally {
                                onPolicyWrite?.(false);
                            }

                            if (
                                pendingRef.current === request &&
                                mounted.current &&
                                !signal.aborted
                            ) {
                                finish(true);
                            }
                        } finally {
                            saving = false;
                        }
                    },
                };
                pendingRef.current = request;
                signal.addEventListener('abort', cancel, { once: true });
                setPending(request);
            });
        },
        [api, recheckTarget, runAction],
    );

    const beforeAttach = useCallback(
        async (
            pid: number,
            signal: AbortSignal,
            onPolicyWrite?: (writing: boolean) => void,
        ): Promise<boolean> => {
            try {
                const target = await readTarget(pid, signal);
                const policy = await api.kernel.get(target.uin, signal);
                signal.throwIfAborted();

                if (!mounted.current) {
                    return false;
                }

                if (!policy.canLoad) {
                    const catalog = await api.kernel.catalog(signal);
                    signal.throwIfAborted();

                    if (
                        !mounted.current ||
                        !(await ask(
                            target,
                            { ...catalog, options: policy.options },
                            signal,
                            onPolicyWrite,
                        ))
                    ) {
                        return false;
                    }

                    const savedPolicy = await api.kernel.get(target.uin, signal);
                    signal.throwIfAborted();

                    if (!savedPolicy.canLoad) {
                        throw new ApiError(
                            409,
                            kernelErrorMessage(CHOICE_NOT_APPLIED, currentTranslate.current),
                        );
                    }
                }

                // The PID may have changed accounts while the dialog or save was pending.
                await recheckTarget(target, signal);
                return mounted.current && !signal.aborted;
            } catch (error) {
                if (signal.aborted || !mounted.current) {
                    return false;
                }

                throw error;
            }
        },
        [api, ask, readTarget, recheckTarget],
    );

    return { pending, beforeAttach };
}
