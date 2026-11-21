import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { MotionConfig } from 'motion/react';
import { actionErrorMessage, useActionFeedback } from '@/contexts/ActionFeedbackContext';
import {
    normalizePerformanceMode,
    performanceModeLow,
    type PerformanceMode,
} from '@/lib/performance-mode';
import type { ThemeMode, UiAppearance, UiBackground } from '@/types';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import { WEBUI_TARGETS, type WebuiPresentation } from '@nowluma/common/webui-target';
import { resolveAppearance } from '@/appearance/registry';
import {
    getTargetAppearance,
    presentationStore,
    subscribeHostAppearance,
} from '@/appearance/runtime';
import { paletteResolved } from '@/appearance/catalog';
import { applyAppearance, applyBackgroundLayer } from '@/appearance/dom';
import {
    authToken,
    fetchAppearance,
    persistAppearance,
    readCache,
    removeBackgroundImage,
    uploadBackgroundImage,
    writeCache,
} from '@/appearance/persistence';
import { runThemeReveal, trackRevealOrigin } from '@/appearance/reveal';
import { translator, useLocale } from '@/i18n';

// Re-export the appearance surface so consumers keep importing it from the
// context module while each value has one owner under `@/appearance`.
export type {
    AccentMode,
    AccentScope,
    BackgroundType,
    DarkIntensity,
    Density,
    Palette,
    SidebarStyle,
    ThemeMode,
    TimeFormat,
    UiAppearance,
} from '@/types';
export { DEFAULT_APPEARANCE };
export type {
    AccentColor,
    AccentSpec,
    FontSpec,
    GradientSpec,
    PaletteSpec,
} from '@/appearance/catalog';
export {
    ACCENTS,
    FONT_CUSTOM_ID,
    FONT_MONO_OPTIONS,
    FONT_SANS_OPTIONS,
    GRADIENT_OPTIONS,
    PALETTE_OPTIONS,
    POLL_INTERVAL_OPTIONS,
    RADIUS_OPTIONS,
    UI_SCALE,
    paletteResolved,
} from '@/appearance/catalog';
export { accentVarsCss } from '@/appearance/color';

/** A partial appearance update; `background` may itself be a partial patch. */
export type AppearancePatch = Partial<Omit<UiAppearance, 'background'>> & {
    background?: Partial<UiBackground>;
};

function mergeAppearance(current: UiAppearance, patch: AppearancePatch): UiAppearance {
    return {
        ...current,
        ...patch,
        background: patch.background
            ? { ...current.background, ...patch.background }
            : current.background,
    };
}

function mergeAppearancePatches(current: AppearancePatch, patch: AppearancePatch): AppearancePatch {
    return {
        ...current,
        ...patch,
        background: patch.background
            ? { ...current.background, ...patch.background }
            : current.background,
    };
}

// ─── Context ───────────────────────────────────────────────────────────────

interface ThemeContextValue {
    /** Effective presentation for components. Never persist this object. */
    appearance: UiAppearance;
    /** User preferences underneath the deployment overlay. Only these are persisted. */
    savedAppearance: UiAppearance;
    presentation: WebuiPresentation | null;
    managedBy: string | null;
    /** True once the first server load attempt has resolved. */
    ready: boolean;
    resolved: 'light' | 'dark';
    /** Merge a partial appearance: applies instantly, caches, debounced-persists. */
    setAppearance: (patch: AppearancePatch) => void;
    /** Explicit setup save. Resolves only after the authenticated server confirms it. */
    saveAppearance: (patch: AppearancePatch) => Promise<void>;
    /** Scoped setup/replay presentation. Null restores the underlying saved preferences. */
    setAppearancePreview: (patch: AppearancePatch | null) => void;
    /** Upload a wallpaper (PNG/JPEG/WebP, ≤5MB). Throws on failure. */
    uploadBackground: (file: File) => Promise<void>;
    /** Remove the wallpaper. */
    removeBackground: () => Promise<void>;
    /** Format a timestamp per the configured 12h/24h preference. */
    formatClock: (input: string | number | Date) => string;
    /** Re-fetch appearance from the server (e.g. after login, so the authed
     *  `customCss` loads). */
    reloadAppearance: () => Promise<void>;
    // Common appearance controls.
    mode: ThemeMode;
    setMode: (m: ThemeMode) => void;
    pollInterval: number;
    performance: { mode: PerformanceMode; low: boolean };
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): 'light' | 'dark' {
    if (typeof window === 'undefined') {
        return 'light';
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const { language, locale } = useLocale();
    const t = translator(language);
    const tRef = useRef(t);
    // Copy changes must not change the identity of the initial-load or save callbacks.
    useLayoutEffect(() => {
        tRef.current = t;
    }, [t]);

    const { runAction, startAction } = useActionFeedback();
    const [appearance, setAppearanceState] = useState<UiAppearance>(readCache);
    const [appearancePreview, setAppearancePreviewState] = useState<AppearancePatch | null>(null);
    const presentation = useSyncExternalStore(
        presentationStore.subscribe,
        presentationStore.getSnapshot,
    );
    const effectiveAppearance = useMemo(
        () =>
            resolveAppearance(
                appearancePreview ? mergeAppearance(appearance, appearancePreview) : appearance,
                presentation,
                getTargetAppearance(),
            ),
        [appearance, appearancePreview, presentation],
    );
    const performanceMode = normalizePerformanceMode(effectiveAppearance.performanceMode);
    const lowPerformance = performanceModeLow(performanceMode);
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);
    const [ready, setReady] = useState(false);
    const saveTimer = useRef<number | undefined>(undefined);
    // Mirror of the latest appearance so the (pure) setAppearance can read the
    // current value without an impure state-updater closure (StrictMode-safe).
    // Synced via a layout effect (not during render) + written synchronously by
    // the mutators themselves so consecutive calls in one tick still compose.
    const appearanceRef = useRef(appearance);
    const previewRef = useRef<AppearancePatch | null>(null);
    const initialPatch = useRef<AppearancePatch | null>({});
    const editedAppearance = useRef<AppearancePatch>({});
    const initialEditToken = useRef<string | null>(null);
    const inFlightSave = useRef<Promise<void> | null>(null);
    const mounted = useRef(false);

    // Serialize confirmed writes so an older slow save cannot finish after a new choice.
    const queueSave = useCallback((next: UiAppearance, token: string | null) => {
        const write = () => {
            if (!mounted.current) {
                throw new Error(tRef.current('外观保存已取消。', 'Appearance save was canceled.'));
            }

            return persistAppearance(next, token);
        };

        const previous = inFlightSave.current;
        // Previous callers retain their own failure; this is a new explicit/debounced edit.
        const result = previous ? previous.then(write, write) : write();
        inFlightSave.current = result;
        return result;
    }, []);

    const scheduleSave = useCallback(
        (token: string | null) => {
            clearTimeout(saveTimer.current);
            saveTimer.current = window.setTimeout(() => {
                saveTimer.current = undefined;
                void queueSave(appearanceRef.current, token).catch((error) => {
                    if (!mounted.current || authToken() !== token) {
                        return;
                    }

                    console.error('persist appearance failed', error);
                    const translate = tRef.current;
                    const detail = actionErrorMessage(error, translate);
                    startAction({
                        title: translate('外观同步失败', 'Could not sync appearance'),
                    }).fail(
                        translate(`当前修改未保存：${detail}`, `Changes were not saved: ${detail}`),
                    );
                });
            }, 400);
        },
        [queueSave, startAction],
    );

    const setAppearancePreview = useCallback((patch: AppearancePatch | null) => {
        const next =
            patch === null ? null : mergeAppearancePatches(previewRef.current ?? {}, patch);
        previewRef.current = next;
        setAppearancePreviewState(next);
    }, []);

    // A Catppuccin flavor fixes light/dark; otherwise honor mode (+ system).
    const resolved: 'light' | 'dark' =
        paletteResolved(effectiveAppearance.palette) ??
        (effectiveAppearance.mode === 'system' ? systemTheme : effectiveAppearance.mode);

    useLayoutEffect(() => subscribeHostAppearance(window, presentationStore), []);

    // Track the OS theme for `mode: 'system'`.
    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Merge only edits made during the first read over the server's unrelated fields.
    // Defer their save until this merge; cached defaults must not overwrite a slow read.
    useEffect(() => {
        if (initialPatch.current === null) {
            return;
        }

        let cancelled = false;

        (async () => {
            const server = await fetchAppearance();

            if (cancelled) {
                return;
            }

            const patch = initialPatch.current ?? {};
            const next = mergeAppearance(server ?? appearanceRef.current, patch);
            initialPatch.current = null;
            appearanceRef.current = next;
            setAppearanceState(next);
            writeCache(next);
            setReady(true);

            if (Object.keys(patch).length > 0) {
                scheduleSave(initialEditToken.current);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [scheduleSave]);

    // Keep the mutator-facing ref in sync after any state change (init load,
    // system-theme flip, upload/delete). Written in an effect, never during render.
    useLayoutEffect(() => {
        appearanceRef.current = appearance;
    }, [appearance]);

    // Apply to the DOM before paint (useLayoutEffect) so the post-mount
    // application doesn't flash. The pre-mount flash is handled by the inline
    // bootstrap script in index.html.
    useLayoutEffect(() => {
        applyAppearance(effectiveAppearance, resolved, presentation, lowPerformance);
    }, [effectiveAppearance, resolved, presentation, lowPerformance]);
    useLayoutEffect(() => {
        applyBackgroundLayer(effectiveAppearance);
    }, [effectiveAppearance]);

    // Cancel pending debounce work and suppress old-session/unmounted result notices.
    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
            clearTimeout(saveTimer.current);
        };
    }, []);

    // Track the last click so the light/dark reveal can emanate from it.
    useEffect(trackRevealOrigin, []);

    const commit = useCallback(
        (patch: AppearancePatch) => {
            editedAppearance.current = mergeAppearancePatches(editedAppearance.current, patch);
            const next = mergeAppearance(appearanceRef.current, patch);
            appearanceRef.current = next;
            setAppearanceState(next);
            writeCache(next);

            if (initialPatch.current !== null) {
                initialPatch.current = mergeAppearancePatches(initialPatch.current, patch);
                initialEditToken.current = authToken();
            } else {
                scheduleSave(authToken());
            }
        },
        [scheduleSave],
    );

    const saveAppearance = useCallback(
        async (patch: AppearancePatch) => {
            const token = authToken();

            if (!token) {
                throw new Error(
                    tRef.current(
                        '登录已失效，请重新登录后保存显示效果。',
                        'Your session has expired. Sign in again to save appearance settings.',
                    ),
                );
            }

            if (initialPatch.current !== null) {
                throw new Error(
                    tRef.current(
                        '外观仍在加载，请稍后再保存。',
                        'Appearance settings are still loading. Try saving again shortly.',
                    ),
                );
            }

            clearTimeout(saveTimer.current);
            saveTimer.current = undefined;
            // Setup can begin while the initial read was public (without custom CSS).
            // Read the authenticated owner before replacing its full appearance section.
            const server = await fetchAppearance(true);

            if (authToken() !== token) {
                throw new Error(
                    tRef.current(
                        '登录状态已变化，请重新登录后保存显示效果。',
                        'Your session has changed. Sign in again to save appearance settings.',
                    ),
                );
            }

            if (!mounted.current) {
                throw new Error(tRef.current('外观保存已取消。', 'Appearance save was canceled.'));
            }

            if (!server) {
                throw new Error(
                    tRef.current(
                        '无法读取已保存的外观；当前显示选择未提交，请稍后再保存。',
                        'Could not read saved appearance settings. Your changes were not submitted. Try saving again shortly.',
                    ),
                );
            }

            appearanceRef.current = mergeAppearance(server, editedAppearance.current);
            commit(mergeAppearancePatches(previewRef.current ?? {}, patch));
            clearTimeout(saveTimer.current);
            saveTimer.current = undefined;
            await queueSave(appearanceRef.current, token);
        },
        [commit, queueSave],
    );

    const setAppearance = useCallback(
        (patch: AppearancePatch) => {
            // Preview mutations are synchronous and local. A delayed theme reveal
            // must never commit a replay choice after its scope has unmounted.
            if (previewRef.current !== null) {
                setAppearancePreview(patch);
                return;
            }

            const prev = appearanceRef.current;
            // Animate a circular light/dark reveal only for brightness/scheme changes
            // (mode, palette, dark intensity) — and never when motion is reduced/off
            // or the device is on the low-performance budget.
            const schemeChange =
                (patch.mode !== undefined && patch.mode !== prev.mode) ||
                (patch.palette !== undefined && patch.palette !== prev.palette) ||
                (patch.darkIntensity !== undefined && patch.darkIntensity !== prev.darkIntensity);

            if (
                schemeChange &&
                !prev.reduceMotion &&
                !effectiveAppearance.disableMotion &&
                !lowPerformance
            ) {
                runThemeReveal(() => commit(patch));
            } else {
                commit(patch);
            }
        },
        [commit, setAppearancePreview, effectiveAppearance.disableMotion, lowPerformance],
    );

    const uploadBackground = useMemo(
        () => async (file: File) => {
            const translate = tRef.current;
            return runAction(
                {
                    title: translate('正在上传背景', 'Uploading background'),
                    detail: file.name,
                    successTitle: translate('背景已更新', 'Background updated'),
                    successDetail: file.name,
                    errorTitle: translate('背景上传失败', 'Background upload failed'),
                },
                async () => {
                    const ap = await uploadBackgroundImage(file);

                    if (ap) {
                        appearanceRef.current = ap;
                        setAppearanceState(ap);
                        writeCache(ap);
                    }
                },
            );
        },
        [runAction],
    );

    const removeBackground = useMemo(
        () => async () => {
            const translate = tRef.current;
            return runAction(
                {
                    title: translate('正在删除背景', 'Deleting background'),
                    detail: translate('移除已上传的壁纸', 'Removing the uploaded wallpaper'),
                    successTitle: translate('背景已删除', 'Background deleted'),
                    successDetail: translate('已恢复为无壁纸状态', 'Wallpaper removed'),
                    errorTitle: translate('背景删除失败', 'Background deletion failed'),
                },
                async () => {
                    const ap = await removeBackgroundImage();

                    if (ap) {
                        appearanceRef.current = ap;
                        setAppearanceState(ap);
                        writeCache(ap);
                    }
                },
            );
        },
        [runAction],
    );

    const formatClock = useMemo(
        () => (input: string | number | Date) => {
            const d = input instanceof Date ? input : new Date(input);

            if (Number.isNaN(d.getTime())) {
                return String(input);
            }

            return d.toLocaleTimeString(locale, {
                hour12: appearance.timeFormat === '12h',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        },
        [appearance.timeFormat, locale],
    );

    const reloadAppearance = useCallback(async () => {
        // A post-auth read supplies custom CSS, not an implicit save of server defaults.
        const previousCss = appearanceRef.current.customCss;
        const server = await fetchAppearance();

        if (
            server &&
            appearanceRef.current.customCss === previousCss &&
            server.customCss !== previousCss
        ) {
            const next = mergeAppearance(appearanceRef.current, { customCss: server.customCss });
            appearanceRef.current = next;
            setAppearanceState(next);
            writeCache(next);
        }
    }, []);

    const value = useMemo<ThemeContextValue>(
        () => ({
            appearance: effectiveAppearance,
            savedAppearance: appearance,
            presentation,
            managedBy: presentation ? WEBUI_TARGETS[presentation.target].label : null,
            ready,
            resolved,
            setAppearance,
            saveAppearance,
            setAppearancePreview,
            uploadBackground,
            removeBackground,
            formatClock,
            reloadAppearance,
            mode: effectiveAppearance.mode,
            setMode: (m: ThemeMode) => setAppearance({ mode: m }),
            pollInterval: appearance.pollInterval,
            performance: {
                mode: performanceMode,
                low: lowPerformance,
            },
        }),
        [
            appearance,
            effectiveAppearance,
            presentation,
            ready,
            resolved,
            setAppearance,
            saveAppearance,
            setAppearancePreview,
            uploadBackground,
            removeBackground,
            formatClock,
            reloadAppearance,
            performanceMode,
            lowPerformance,
        ],
    );

    return (
        <ThemeContext.Provider value={value}>
            <MotionConfig
                reducedMotion={
                    effectiveAppearance.reduceMotion || effectiveAppearance.disableMotion
                        ? 'always'
                        : 'user'
                }
            >
                {children}
            </MotionConfig>
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);

    if (!ctx) {
        throw new Error('useTheme must be used within ThemeProvider');
    }

    return ctx;
}
