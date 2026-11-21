import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

export type Language = 'zh' | 'en';
export type Translate = (zh: string, en: string) => string;

export const defaultTranslate: Translate = (zh) => zh;
const translateEnglish: Translate = (_zh, en) => en;
const LANGUAGE_KEY = 'nowluma_ui_language';

export function translator(language: Language): Translate {
    return language === 'en' ? translateEnglish : defaultTranslate;
}

export function initialLanguage(host: Pick<Window, 'localStorage' | 'navigator'>): Language {
    try {
        const saved = host.localStorage.getItem(LANGUAGE_KEY);

        if (saved === 'en' || saved === 'zh') {
            return saved;
        }
    } catch {
        // Private/embedded contexts may not expose storage.
    }

    return /^en(?:-|$)/i.test(host.navigator.language) ? 'en' : 'zh';
}

interface Locale {
    language: Language;
    locale: 'zh-CN' | 'en';
    locked: boolean;
    setLanguage: (language: Language) => void;
}

// Components rendered independently (including SSR) use the original Chinese copy.
const LocaleContext = createContext<Locale>({
    language: 'zh',
    locale: 'zh-CN',
    locked: false,
    setLanguage: () => {},
});

export function LocaleProvider({
    children,
    initial = 'zh',
    fixed,
    title,
}: {
    children: ReactNode;
    initial?: Language;
    fixed?: Language;
    title?: (language: Language) => string;
}) {
    const [selection, setSelection] = useState(initial);
    const language = fixed ?? selection;
    const locale = language === 'en' ? 'en' : 'zh-CN';
    const setLanguage = useCallback(
        (next: Language) => {
            if (fixed !== undefined) {
                return;
            }

            setSelection(next);

            try {
                window.localStorage.setItem(LANGUAGE_KEY, next);
            } catch {
                // The current tab still switches even when storage is unavailable.
            }
        },
        [fixed],
    );
    const context = useMemo<Locale>(
        () => ({ language, locale, locked: fixed !== undefined, setLanguage }),
        [language, locale, fixed, setLanguage],
    );

    useEffect(() => {
        document.documentElement.lang = locale;

        if (title) {
            document.title = title(language);
        }
    }, [language, locale, title]);

    return <LocaleContext.Provider value={context}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
    return useContext(LocaleContext);
}

export function useT(): Translate {
    return translator(useLocale().language);
}
