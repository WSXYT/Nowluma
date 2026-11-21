import { motion, useReducedMotionConfig } from 'motion/react';
import { cn } from '@/lib/utils';

interface ToggleSwitchProps {
    value: boolean;
    onChange: (v: boolean) => void;
    ariaLabel: string;
    disabled?: boolean;
    'data-tutorial-control'?: string;
}

/** Small animated on/off switch (`role="switch"`). Shared across the config
 *  surfaces — node enable toggle, built-in command toggles, etc. */
export function ToggleSwitch({
    value,
    onChange,
    ariaLabel,
    disabled,
    'data-tutorial-control': tutorialControl,
}: ToggleSwitchProps) {
    const reduced = useReducedMotionConfig();
    return (
        <button
            type="button"
            role="switch"
            aria-checked={value ? 'true' : 'false'}
            aria-label={ariaLabel}
            data-tutorial-control={tutorialControl}
            disabled={disabled}
            onClick={() => onChange(!value)}
            className={cn(
                'relative inline-flex h-11 w-11 shrink-0 items-center bg-transparent',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'relative flex h-6 w-11 items-center rounded-full transition-colors',
                    value ? 'bg-primary' : 'bg-foreground/20',
                )}
            >
                <motion.span
                    className="inline-block size-4 rounded-full bg-primary-foreground shadow-sm"
                    initial={false}
                    animate={{ x: value ? 24 : 4 }}
                    transition={
                        reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 30 }
                    }
                />
            </span>
        </button>
    );
}
