import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import type { Sun } from 'lucide-react';
import { SegmentedControl } from '@/components/interior/segmented-control';
import { Slider } from '@/components/ui/slider';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

// ─────────────── shared little controls ───────────────

export interface Opt<T> {
    value: T;
    label: string;
    icon?: typeof Sun;
}

// Associates a SettingRow's visible label with the control inside it (so the
// segmented radiogroup gets an accessible name without prop-threading).
const RowLabelContext = createContext<{ id: string; label: string } | undefined>(undefined);

// Single-select settings use the shared keyboard-accessible radiogroup.
export function Segmented<T extends string | number>({
    value,
    options,
    onChange,
    disabled,
}: {
    value: T;
    options: Opt<T>[];
    onChange: (v: T) => void;
    disabled?: boolean;
}) {
    const t = useT();
    const rowLabel = useContext(RowLabelContext);
    return (
        <div
            aria-labelledby={rowLabel?.id}
            aria-disabled={disabled || undefined}
            className={cn('max-w-full overflow-x-auto', disabled && 'opacity-50')}
        >
            <SegmentedControl
                className="min-w-max"
                label={rowLabel?.label ?? t('选项', 'Options')}
                value={String(value)}
                options={options.map((option) => ({
                    value: String(option.value),
                    label: option.label,
                    disabled,
                }))}
                onValueChange={(next) => {
                    const option = options.find((candidate) => String(candidate.value) === next);

                    if (option) {
                        onChange(option.value);
                    }
                }}
            />
        </div>
    );
}

/**
 * A compact document row. `layout`:
 *  - 'auto'   — label and control share columns on sm+, stack on mobile
 *  - 'inline' — switches stay beside their label
 *  - 'stack'  — wide controls stay below their label
 */
export function SettingRow({
    label,
    hint,
    children,
    layout = 'auto',
}: {
    label: string;
    hint?: ReactNode;
    children: ReactNode;
    layout?: 'auto' | 'inline' | 'stack';
}) {
    const labelId = useId();
    const head = (
        <div className="min-w-0 break-words">
            <p id={labelId} className="text-sm font-medium">
                {label}
            </p>
            {hint && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
        </div>
    );
    const control = (
        <RowLabelContext.Provider value={{ id: labelId, label }}>
            {children}
        </RowLabelContext.Provider>
    );

    if (layout === 'stack') {
        return (
            <div className="flex min-w-0 flex-col gap-2.5 py-3">
                {head}
                {control}
            </div>
        );
    }

    if (layout === 'inline') {
        return (
            <div className="flex min-w-0 items-center justify-between gap-4 py-3">
                {head}
                <div className="min-w-0 max-w-[60%] shrink-0">{control}</div>
            </div>
        );
    }

    return (
        <div className="grid min-w-0 gap-2.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start sm:gap-6">
            {head}
            <div className="min-w-0 max-w-full">{control}</div>
        </div>
    );
}

export function SliderSettingRow({
    label,
    hint,
    ...sliderProps
}: {
    label: string;
    hint?: ReactNode;
} & Omit<ComponentProps<typeof Slider>, 'label'>) {
    const hintId = useId();
    return (
        <div className="flex min-w-0 flex-col gap-2.5 py-3">
            <Slider {...sliderProps} label={label} aria-describedby={hint ? hintId : undefined} />
            {hint && (
                <p id={hintId} className="text-[12px] leading-snug text-muted-foreground">
                    {hint}
                </p>
            )}
        </div>
    );
}

// Stable section headings lead an unboxed document surface.
export function Group({
    title,
    description,
    icon: Icon,
    children,
}: {
    title: string;
    description?: ReactNode;
    icon?: typeof Sun;
    children: ReactNode;
}) {
    const titleId = useId();
    return (
        <section aria-labelledby={titleId} className="cp-settings-group">
            <header className="flex min-w-0 flex-col gap-1.5">
                <h2 id={titleId} className="flex items-center gap-2 text-[15px] font-semibold">
                    {Icon && <Icon aria-hidden="true" className="size-4 text-muted-foreground" />}
                    {title}
                </h2>
                {description && (
                    <div className="max-w-prose text-xs leading-relaxed text-muted-foreground">
                        {description}
                    </div>
                )}
            </header>
            <div className="cp-settings-rows divide-y divide-border/60">{children}</div>
        </section>
    );
}
