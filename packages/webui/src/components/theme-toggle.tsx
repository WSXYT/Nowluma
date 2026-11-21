import { useDropdown } from '@/components/interior/dropdown';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { GlassMaterial } from '@/components/ui/glass-material';
import { paletteResolved, useTheme, type ThemeMode } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import '@/styles/workspace.css';

export function ThemeToggle({ className }: { className?: string }) {
    const t = useT();
    const options = [
        { value: 'system', icon: Monitor, label: t('跟随系统', 'System') },
        { value: 'light', icon: Sun, label: t('浅色', 'Light') },
        { value: 'dark', icon: Moon, label: t('深色', 'Dark') },
    ];
    const { appearance, mode, setMode, managedBy, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const { open, activeIndex, rootRef, triggerProps, listProps, getItemProps } = useDropdown({
        items: options,
        value: mode,
        onChange: (value) => setMode(value as ThemeMode),
    });
    const selected = options.find((option) => option.value === mode) ?? options[0];
    const SelectedIcon = selected.icon;

    if (managedBy || paletteResolved(appearance.palette)) {
        return null;
    }

    return (
        <div ref={rootRef} className={cn('workspace-theme', className)}>
            <button
                {...triggerProps}
                aria-label={t(`切换主题：${selected.label}`, `Change theme: ${selected.label}`)}
                title={t(`主题：${selected.label}`, `Theme: ${selected.label}`)}
                className="ui-glass workspace-icon-button workspace-theme-trigger"
                data-press-scale=""
            >
                <GlassMaterial />
                <SelectedIcon className="size-4" aria-hidden="true" />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={reduced ? false : { opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={
                            reduced
                                ? { duration: 0 }
                                : performance?.low
                                  ? { duration: 0.18, ease: 'easeOut' }
                                  : { type: 'spring', duration: 0.42, bounce: 0.12 }
                        }
                        className="ui-glass ui-glass-menu workspace-theme-menu"
                    >
                        <GlassMaterial />
                        <ul
                            {...listProps}
                            aria-label={t('主题', 'Theme')}
                            className="workspace-theme-options"
                        >
                            <motion.li
                                aria-hidden="true"
                                role="presentation"
                                initial={false}
                                animate={{
                                    y: Math.max(0, activeIndex) * 44,
                                    opacity: activeIndex < 0 ? 0 : 1,
                                }}
                                transition={
                                    reduced
                                        ? { duration: 0 }
                                        : performance?.low
                                          ? { duration: 0.18, ease: 'easeOut' }
                                          : { type: 'spring', duration: 0.42, bounce: 0.12 }
                                }
                                className="workspace-theme-active"
                            />
                            {options.map(({ value, label, icon: OptionIcon }, index) => (
                                <li
                                    key={value}
                                    {...getItemProps(index)}
                                    data-active={index === activeIndex}
                                    className="workspace-theme-option"
                                >
                                    <OptionIcon className="size-4" aria-hidden="true" />
                                    <span className="flex-1">{label}</span>
                                    {value === mode && (
                                        <Check className="size-4" aria-hidden="true" />
                                    )}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
