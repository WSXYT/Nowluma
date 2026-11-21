import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { prepareTargetAppearance } from './appearance/runtime';
import { initialLanguage, LocaleProvider, translator } from './i18n';
import { APP_NAME } from './types';

const root = document.getElementById('root')!;
const language = initialLanguage(window);
const t = translator(language);
const title = (lang: typeof language) => `${APP_NAME} · ${translator(lang)('控制台', 'Console')}`;
document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
document.title = title(language);

void prepareTargetAppearance()
    .then(() => {
        createRoot(root).render(
            <StrictMode>
                <LocaleProvider initial={language} title={title}>
                    <App />
                </LocaleProvider>
            </StrictMode>,
        );
    })
    .catch((error: unknown) => {
        console.error(`[${APP_NAME} appearance] Startup failed`, error);
        root.textContent = t(
            '界面外观加载失败，请刷新重试。详细原因见浏览器控制台。',
            'Appearance could not load. Refresh to try again or see the browser console for details.',
        );
    });
