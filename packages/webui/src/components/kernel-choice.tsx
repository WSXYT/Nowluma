import { useId, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import {
    COMPAT_RISK_TEXT,
    COMPAT_RISK_TEXT_EN,
    COMPAT_RISK_VERSION,
    NATIVE_KERNEL_LABEL,
    NATIVE_KERNEL_LABEL_EN,
    REWRITE_KERNEL_LABEL,
    REWRITE_KERNEL_UNAVAILABLE_REASON,
} from '@nowluma/common/kernel-display';
import { Modal } from '@/components/interior/modal';
import { Button } from '@/components/ui/button';
import { actionErrorMessage } from '@/contexts/ActionFeedbackContext';
import type { KernelCatalog, KernelChoiceInput, KernelId } from '@/lib/api';
import { kernelErrorMessage, type PendingKernelChoice } from '@/hooks/use-kernel-choice';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';

function KernelOptions({
    catalog,
    kernel = null,
    onSelect,
    disabled = false,
}: {
    catalog: KernelCatalog;
    kernel?: KernelId | null;
    onSelect?: (kernel: KernelId) => void;
    disabled?: boolean;
}) {
    const t = useT();
    const name = useId();

    return (
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">{t('选择接入内核', 'Choose a connection kernel')}</legend>
            {catalog.options.map((option) => {
                const available = option.id === 'compat' && option.available;
                const label =
                    option.id === 'compat' && option.label === NATIVE_KERNEL_LABEL
                        ? t(option.label, NATIVE_KERNEL_LABEL_EN)
                        : option.id === 'rewrite' && option.label === REWRITE_KERNEL_LABEL
                          ? t(option.label, 'Rewritten kernel')
                          : option.label;
                const reason =
                    option.id === 'rewrite' && option.reason === REWRITE_KERNEL_UNAVAILABLE_REASON
                        ? kernelErrorMessage(option.reason, t)
                        : option.reason ||
                          (available
                              ? t('使用随包提供的原生组件', 'Uses the bundled native components')
                              : t('当前平台尚未验证', 'Not verified on this platform'));

                return (
                    <label
                        key={option.id}
                        className={cn(
                            'min-w-0',
                            available && onSelect ? 'cursor-pointer' : 'cursor-default',
                        )}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.id}
                            checked={kernel === option.id}
                            disabled={!available || !onSelect}
                            onChange={() => onSelect?.(option.id)}
                            className="peer sr-only"
                        />
                        <span
                            className={cn(
                                'flex h-full min-h-28 flex-col gap-2 rounded-xl border border-border bg-card/70 p-4 text-start transition-colors peer-checked:border-primary/60 peer-checked:bg-primary/5 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40',
                                available && onSelect
                                    ? 'hover:border-primary/40'
                                    : 'text-muted-foreground',
                            )}
                        >
                            <span className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
                                {label}
                                <span className="rounded-full border border-current/15 px-2 py-0.5 text-micro font-normal">
                                    {available
                                        ? t('可选择', 'Available')
                                        : t('暂不可用', 'Unavailable')}
                                </span>
                            </span>
                            <span className="text-xs leading-relaxed text-muted-foreground">
                                {reason}
                            </span>
                        </span>
                    </label>
                );
            })}
        </fieldset>
    );
}

export function KernelCatalogPreview({ catalog }: { catalog: KernelCatalog }) {
    return <KernelOptions catalog={catalog} />;
}

export function KernelChoiceForm({
    uin,
    catalog,
    onConfirm,
    onCancel,
    onStop,
    submitLabel,
    onSubmittingChange,
}: {
    uin: string;
    catalog: KernelCatalog;
    onConfirm: (choice: KernelChoiceInput) => Promise<void>;
    onCancel?: () => void;
    onStop?: () => Promise<void>;
    submitLabel?: string;
    onSubmittingChange?: (submitting: boolean) => void;
}) {
    const t = useT();
    const riskId = useId();
    const [kernel, setKernel] = useState<KernelId | null>(null);
    const [accepted, setAccepted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);
    const canSubmit =
        kernel === 'compat' &&
        accepted &&
        catalog.options.some((option) => option.id === 'compat' && option.available);
    const riskText =
        catalog.riskVersion === COMPAT_RISK_VERSION && catalog.riskText === COMPAT_RISK_TEXT
            ? t(COMPAT_RISK_TEXT, COMPAT_RISK_TEXT_EN)
            : catalog.riskText;

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (!canSubmit || busy.current) {
            return;
        }

        busy.current = true;
        setSubmitting(true);
        onSubmittingChange?.(true);
        setError(null);

        try {
            await onConfirm({
                kernel: 'compat',
                riskAccepted: true,
                riskVersion: catalog.riskVersion,
            });
        } catch (error) {
            setError(actionErrorMessage(error));
        } finally {
            busy.current = false;
            setSubmitting(false);
            onSubmittingChange?.(false);
        }
    };

    return (
        <form
            onSubmit={(event) => {
                void submit(event);
            }}
            className="flex flex-col gap-4"
        >
            <KernelOptions
                catalog={catalog}
                kernel={kernel}
                onSelect={(next) => {
                    if (next === 'compat') {
                        setKernel(next);
                    }
                }}
                disabled={submitting}
            />
            <div id={riskId} className="space-y-2 text-sm leading-relaxed">
                <p>{riskText}</p>
                <p className="text-xs text-muted-foreground">
                    {t(
                        `风险说明版本 ${catalog.riskVersion} · 仅对 QQ ${uin} 生效`,
                        `Risk disclosure version ${catalog.riskVersion} · Applies only to QQ ${uin}`,
                    )}
                </p>
            </div>
            <label className="flex min-h-11 items-start gap-3 rounded-xl border border-border bg-card/50 px-4 py-3 text-sm leading-relaxed">
                <input
                    type="checkbox"
                    checked={accepted}
                    disabled={kernel !== 'compat' || submitting}
                    onChange={(event) => setAccepted(event.target.checked)}
                    aria-describedby={riskId}
                    className="mt-1 size-4 shrink-0 accent-current focus-visible:ring-2 focus-visible:ring-ring"
                />
                <span>
                    {t(
                        `我已阅读并主动确认此账号的${NATIVE_KERNEL_LABEL}使用与法律风险`,
                        `I have read and explicitly acknowledge the risks of using the ${NATIVE_KERNEL_LABEL_EN} and the legal risks for this account`,
                    )}
                </span>
            </label>
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {kernelErrorMessage(error, t)}
                </p>
            ) : null}
            <div className="grid gap-3 sm:flex sm:items-center sm:justify-end">
                {onCancel ? (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={onCancel}
                    >
                        {t('取消', 'Cancel')}
                    </Button>
                ) : null}
                {/* Stop can wait for a dispatched save; Cancel must not interrupt it. */}
                {onStop ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            void onStop();
                        }}
                    >
                        {t('停止接入', 'Stop connecting')}
                    </Button>
                ) : null}
                <Button
                    type="submit"
                    disabled={!canSubmit || submitting}
                    className="h-11 sm:min-w-36"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="size-4 animate-spin" />
                            {t('保存中…', 'Saving…')}
                        </>
                    ) : (
                        (submitLabel ?? t('确认并接入', 'Confirm and connect'))
                    )}
                </Button>
            </div>
        </form>
    );
}

export function KernelChoiceDialog({
    choice,
    onStop,
}: {
    choice: PendingKernelChoice;
    onStop?: () => Promise<void>;
}) {
    const t = useT();
    const [submitting, setSubmitting] = useState(false);

    return (
        <Modal
            open
            onClose={() => {
                if (!submitting) {
                    choice.cancel();
                }
            }}
            title={t('选择接入内核', 'Choose a connection kernel')}
            description={`${choice.target.nickname || 'QQ'} · QQ ${choice.target.uin}`}
            closeLabel={t('取消内核选择', 'Cancel kernel choice')}
            showClose={!submitting}
            closeOnEscape={!submitting}
            closeOnBackdrop={!submitting}
            maxWidth={560}
            maxHeight="min(86dvh, 720px)"
        >
            <KernelChoiceForm
                uin={choice.target.uin}
                catalog={choice.catalog}
                onConfirm={choice.confirm}
                onCancel={choice.cancel}
                onStop={choice.target.injected ? onStop : undefined}
                onSubmittingChange={setSubmitting}
            />
        </Modal>
    );
}
