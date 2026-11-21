import { useLocale } from '@/i18n';

export function LanguageToggle() {
    const { language, locked, setLanguage } = useLocale();

    if (locked) {
        return null;
    }

    const english = language === 'en';
    const label = english ? '切换到简体中文' : 'Switch to English';

    return (
        <button
            type="button"
            className="workspace-icon-button text-xs font-semibold"
            lang={english ? 'zh-CN' : 'en'}
            aria-label={label}
            title={label}
            onClick={() => setLanguage(english ? 'zh' : 'en')}
        >
            {english ? '中文' : 'EN'}
        </button>
    );
}
