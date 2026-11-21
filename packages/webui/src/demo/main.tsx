import '../index.css';
import { installDemoIsolation } from './isolation';
import { parseTutorialOptions } from './tutorial-options';
import { TUTORIAL_LESSONS, tutorialText } from './tutorial-lessons';
import { initialLanguage, LocaleProvider, translator, type Language } from '@/i18n';
import { APP_NAME } from '@/types';

const options = parseTutorialOptions(window.location.search);
const isolation = installDemoIsolation(options);
const lesson = options.tutorial ? TUTORIAL_LESSONS[options.tutorial] : undefined;
const language = lesson ? options.lang : initialLanguage(window);
const title = (lang: Language) =>
    `${lesson ? tutorialText(lesson.title, lang) : translator(lang)('控制台示例', 'Console example')} · ${APP_NAME}`;
document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
document.title = title(language);

const root = document.getElementById('root')!;

void (async () => {
    const { DemoApi } = await import('./api');
    const api = new DemoApi(lesson ? language : undefined);
    isolation.attach(api);

    if (lesson) {
        const token = api.resetTutorial(lesson.baseline);

        if (token) {
            isolation.local.setItem('nowluma_token', token);
        }

        window.history.replaceState(
            {},
            '',
            `${window.location.pathname}${window.location.search}#${lesson.steps[0].route}`,
        );
    }

    const [{ createRoot }, { DemoApp }, { prepareTargetAppearance }] = await Promise.all([
        import('react-dom/client'),
        import('./DemoApp'),
        import('@/appearance/runtime'),
    ]);
    await prepareTargetAppearance();
    createRoot(root).render(
        <LocaleProvider initial={language} fixed={lesson ? language : undefined} title={title}>
            <DemoApp api={api} options={options} />
        </LocaleProvider>,
    );
})().catch((error: unknown) => {
    console.error(`[${APP_NAME} DEMO] Startup failed`, error);
    root.textContent = translator(language)(
        '示例控制台加载失败。未连接真实接口；请刷新或查看浏览器控制台。',
        'The sample console could not load. No real API was contacted. Refresh or inspect the browser console.',
    );
});
