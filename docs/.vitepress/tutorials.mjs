export const DOCS_BASE = '/NowLuma/';

export const CHAPTER_IDS = [
  'index',
  'introduction',
  'install-docker',
  'install-native',
  'first-run',
  'overview',
  'qq-connection',
  'onebot-config',
  'logs',
  'debug',
  'settings-console',
  'settings-runtime',
  'access-network',
  'data-backup',
  'troubleshooting',
  'demo',
  'planned',
  'developing',
];

export const LOCALES = {
  zh: { htmlLang: 'zh-CN', title: 'Nowluma 文档', label: '简体中文' },
  en: { htmlLang: 'en', title: 'Nowluma documentation', label: 'English' },
};

export function tutorialForPage(relativePath, tutorial) {
  const match = /^(zh|en)\/([^/]+)\.md$/.exec(relativePath);
  if (!match || !CHAPTER_IDS.includes(match[2])) return null;
  const chapter = tutorial ?? match[2];
  if (chapter !== match[2] || !CHAPTER_IDS.includes(chapter)) return null;
  return { chapter, lang: match[1] };
}

export function tutorialUrl(base, chapter, lang, { embedded = true } = {}) {
  if (!CHAPTER_IDS.includes(chapter) || !Object.hasOwn(LOCALES, lang)) {
    throw new Error('Unknown documentation tutorial or language');
  }
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)) {
    throw new Error('The documentation base must be a local absolute directory');
  }
  return `${base}demo/?tutorial=${chapter}&lang=${lang}${embedded ? '&embed=1' : ''}`;
}

export function tutorialSectionForEvent(event, origin, frameWindow, lesson, sections) {
  if (!frameWindow || event.origin !== origin || event.source !== frameWindow) return null;
  const data = event.data;
  if (!lesson || !data || typeof data !== 'object' || Array.isArray(data)) return null;
  const keys = ['type', 'tutorial', 'step', 'lang'];
  if (Object.keys(data).length !== keys.length || !keys.every((key) => Object.hasOwn(data, key)))
    return null;
  if (
    data.type !== 'nowluma-tutorial-section' ||
    data.tutorial !== lesson.chapter ||
    data.lang !== lesson.lang
  )
    return null;
  if (typeof data.step !== 'string' || data.step.length > 80) return null;
  if (!Object.hasOwn(sections, lesson.chapter)) return null;
  const chapter = sections[lesson.chapter];
  if (!Object.hasOwn(chapter, data.step)) return null;
  const anchor = chapter[data.step][lesson.lang];
  return typeof anchor === 'string' && anchor.length > 0 ? anchor : null;
}
