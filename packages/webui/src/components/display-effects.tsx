import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ArrowRight, Layers, Sparkles } from 'lucide-react';
import { Segmented, SettingRow } from '@/components/settings/settings-controls';
import { useWizardNavigation } from '@/components/interior/wizard-steps';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-material';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useTheme } from '@/contexts/ThemeContext';
import { authToken } from '@/appearance/persistence';
import type { PerformanceMode } from '@/lib/performance-mode';
import { useT, type Translate } from '@/i18n';

interface DisplayEffectsChoices {
    disableMotion: boolean | null;
    performanceMode: PerformanceMode | null;
}

type DisplayEffectsPatch = Partial<{
    disableMotion: boolean;
    performanceMode: PerformanceMode;
}>;

const SESSION_CHANGED = '登录状态已变化，请重新登录后保存显示效果。';

function displayEffectsError(message: string, t: Translate): string {
    switch (message) {
        case '登录已失效，请重新登录后保存显示效果。':
            return t(message, 'Your session has expired. Sign in again to save display effects.');
        case SESSION_CHANGED:
            return t(message, 'Your session has changed. Sign in again to save display effects.');
        case '服务器未确认外观已保存。':
            return t(
                message,
                'The server did not confirm that your appearance settings were saved.',
            );
        case '未知错误':
            return t(message, 'Unknown error');

        default: {
            const http = /^外观保存失败（HTTP (\d+)）$/.exec(message);
            return http
                ? t(message, `Could not save appearance settings (HTTP ${http[1]})`)
                : message;
        }
    }
}

/** One set of controls and one appearance owner for Settings and first setup. */
export function DisplayEffectsControls({
    value,
    onChange,
    requireExplicit = false,
    disabled = false,
}: {
    value: DisplayEffectsChoices;
    onChange: (patch: DisplayEffectsPatch) => void;
    requireExplicit?: boolean;
    disabled?: boolean;
}) {
    const t = useT();
    const on = t('开启', 'On');
    const off = t('关闭', 'Off');
    return (
        <>
            <SettingRow
                label={t('动效', 'Motion')}
                hint={t(
                    '由你手动开启或关闭；关闭后仍保留静态玻璃。系统与无障碍设置仍可减弱动画。',
                    'Turn motion on or off manually. Turning it off keeps the static glass effect. System and accessibility settings can still reduce motion.',
                )}
                layout={requireExplicit ? 'auto' : 'inline'}
            >
                {requireExplicit ? (
                    <Segmented<'on' | 'off' | ''>
                        value={
                            value.disableMotion === null ? '' : value.disableMotion ? 'off' : 'on'
                        }
                        options={[
                            { value: 'on', label: on },
                            { value: 'off', label: off },
                        ]}
                        onChange={(choice) => {
                            if (choice) {
                                onChange({ disableMotion: choice === 'off' });
                            }
                        }}
                        disabled={disabled}
                    />
                ) : (
                    <div className="flex min-h-11 items-center gap-3">
                        <span aria-hidden="true" className="text-xs text-muted-foreground">
                            {value.disableMotion ? off : on}
                        </span>
                        <ToggleSwitch
                            value={!value.disableMotion}
                            onChange={(enabled) => onChange({ disableMotion: !enabled })}
                            ariaLabel={t('动效', 'Motion')}
                            data-tutorial-control="motion-setting"
                            disabled={disabled}
                        />
                    </div>
                )}
            </SettingRow>
            <SettingRow
                label={t('玻璃材质', 'Glass material')}
                hint={t(
                    '完整玻璃提供背景折射；磨砂玻璃减少渲染开销。不会自动切换，也不会改变动效开关。',
                    'Full glass refracts the background; frosted glass costs less to render. The material does not switch automatically or change your motion setting.',
                )}
            >
                <Segmented<PerformanceMode | ''>
                    value={value.performanceMode ?? ''}
                    options={[
                        { value: 'high', label: t('完整玻璃', 'Full glass') },
                        { value: 'low', label: t('磨砂玻璃', 'Frosted glass') },
                    ]}
                    onChange={(performanceMode) => {
                        if (performanceMode) {
                            onChange({ performanceMode });
                        }
                    }}
                    disabled={disabled}
                />
            </SettingRow>
            <DisplayEffectsPreview />
        </>
    );
}

function DisplayEffectsPreview() {
    const t = useT();
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const [active, setActive] = useState(false);

    return (
        <figure
            aria-label={t('显示效果预览', 'Display effects preview')}
            data-tutorial-control="effect-preview"
            className="relative my-3 overflow-hidden rounded-[4px] border border-border bg-card p-5 sm:p-6"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-35"
                style={{
                    backgroundImage:
                        'radial-gradient(circle, var(--border) 0.75px, transparent 0.75px)',
                    backgroundSize: '28px 28px',
                }}
            />
            <div className="relative">
                <p className="text-xs text-muted-foreground">
                    {t('今日工作区', 'Today’s workspace')}
                </p>
                <p className="mt-2 text-sm font-medium">
                    {t('安静的纸面，清晰的内容。', 'A quiet canvas for clear content.')}
                </p>
                <div className="mt-5 flex min-h-14 flex-wrap items-center gap-4">
                    <Button
                        type="button"
                        variant="glass"
                        className="min-h-11"
                        aria-pressed={active}
                        onClick={() => setActive((current) => !current)}
                    >
                        <Sparkles aria-hidden="true" className="size-4" />
                        {t('试试动效', 'Try the motion effect')}
                    </Button>
                    <motion.div
                        animate={{ x: !reduced && active ? 16 : 0 }}
                        transition={
                            reduced
                                ? { duration: 0 }
                                : { type: 'spring', stiffness: 380, damping: 28 }
                        }
                    >
                        <GlassSurface className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-xs">
                            <Layers aria-hidden="true" className="size-4" />
                            <span>{t('导航与短操作', 'Navigation and quick actions')}</span>
                        </GlassSurface>
                    </motion.div>
                </div>
                <figcaption
                    className="mt-4 text-xs leading-relaxed text-muted-foreground"
                    role="status"
                >
                    {t('材质选择：', 'Material: ')}
                    {performance.low ? t('磨砂玻璃', 'Frosted glass') : t('完整玻璃', 'Full glass')}
                    {' · '}
                    {t('动效：', 'Motion: ')}
                    {appearance.disableMotion ? t('关闭', 'Off') : t('开启', 'On')}
                    {!appearance.disableMotion && reduced
                        ? t(
                              '（系统或无障碍设置已减弱）',
                              ' (reduced by system or accessibility settings)',
                          )
                        : ''}
                </figcaption>
            </div>
        </figure>
    );
}

export function DisplayEffectsOnboardingStep({ replay }: { replay: boolean }) {
    const t = useT();
    const { next } = useWizardNavigation();
    const { ready, saveAppearance, setAppearancePreview } = useTheme();
    const { runAction } = useActionFeedback();
    const [choices, setChoices] = useState<DisplayEffectsChoices>({
        disableMotion: null,
        performanceMode: null,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const mounted = useRef(false);
    const saving = useRef(false);

    useLayoutEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

    const choose = (patch: DisplayEffectsPatch) => {
        if (saving.current) {
            return;
        }

        setChoices((current) => ({ ...current, ...patch }));
        setAppearancePreview(patch);
        setError(null);
    };

    const advance = async () => {
        if (saving.current || choices.disableMotion === null || choices.performanceMode === null) {
            return;
        }

        const { disableMotion, performanceMode } = choices;

        if (replay) {
            next();
            return;
        }

        const token = authToken();

        if (!token) {
            setError('登录已失效，请重新登录后保存显示效果。');
            return;
        }

        saving.current = true;
        setSubmitting(true);
        setError(null);

        try {
            await runAction(
                {
                    title: t('正在保存显示效果', 'Saving display effects'),
                    successTitle: t('显示效果已保存', 'Display effects saved'),
                    errorTitle: t('显示效果保存失败', 'Could not save display effects'),
                    errorDetail: (caught) => displayEffectsError(actionErrorMessage(caught), t),
                },
                () =>
                    saveAppearance({
                        disableMotion,
                        performanceMode,
                    }),
            );

            if (!mounted.current) {
                return;
            }

            if (authToken() !== token) {
                setError(SESSION_CHANGED);
                return;
            }

            next();
        } catch (caught) {
            if (mounted.current) {
                setError(actionErrorMessage(caught));
            }
        } finally {
            saving.current = false;

            if (mounted.current) {
                setSubmitting(false);
            }
        }
    };

    return (
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col gap-5 py-2 sm:py-5">
            <header>
                <h2 className="text-balance text-lg font-semibold tracking-tight sm:text-xl">
                    {t('显示效果', 'Display effects')}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t(
                        '分别选择动效与玻璃材质，再继续设置。以后可在设置 → 外观中调整。',
                        'Choose motion and glass material separately to continue setup. You can change them later in Settings → Appearance.',
                    )}
                </p>
            </header>
            {replay && (
                <p role="status" className="text-xs leading-relaxed text-muted-foreground">
                    {t(
                        '开发者演练：只预览显示效果，不保存外观、密码或协议确认；退出后恢复原来的显示设置。',
                        'Developer rehearsal: display effects are previewed only. Appearance settings, passwords, and notice acknowledgments are not saved. Your previous display settings return when you exit.',
                    )}
                </p>
            )}
            <div className="divide-y divide-border/60">
                <DisplayEffectsControls
                    value={choices}
                    onChange={choose}
                    requireExplicit
                    disabled={submitting}
                />
            </div>
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {displayEffectsError(error, t)}
                </p>
            )}
            <div className="workspace-onboarding-actions mt-auto flex justify-end pt-3">
                <Button
                    type="button"
                    className="min-h-11 w-full sm:w-auto"
                    disabled={
                        submitting ||
                        (!replay && !ready) ||
                        choices.disableMotion === null ||
                        choices.performanceMode === null
                    }
                    onClick={() => {
                        void advance();
                    }}
                >
                    {submitting
                        ? t('保存中…', 'Saving…')
                        : replay
                          ? t('应用预览并继续', 'Apply preview and continue')
                          : t('保存并继续', 'Save and continue')}
                    <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
            </div>
        </div>
    );
}
