import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import {
  CHAPTERS,
  DOCS_BASE,
  LOCALES,
  markdownOptions,
  readDocuments,
} from '../../tools/docs-metadata.mjs';

const mark = `data:image/svg+xml;base64,${fs.readFileSync(new URL('../../packages/webui/src/assets/nowluma-mark.svg', import.meta.url)).toString('base64')}`;
const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig(async () => {
  const documents = await readDocuments();
  const sidebar = Object.fromEntries(
    Object.keys(LOCALES).map((lang) => [
      `/${lang}/`,
      [
        {
          text: lang === 'zh' ? '完整指南' : 'Complete guide',
          items: CHAPTERS.map((chapter) => ({
            text: documents.get(`${lang}/${chapter}`)?.frontmatter.title ?? chapter,
            link: `/${lang}/${chapter.replace(/\.md$/, '.html')}`,
          })),
        },
      ],
    ]),
  );
  return {
    srcDir: 'content',
    outDir: path.resolve(docsRoot, '../_site'),
    cacheDir: path.resolve(docsRoot, '.vitepress/cache'),
    base: DOCS_BASE,
    title: 'Nowluma',
    description: 'Nowluma 中文文档 / English documentation',
    lang: 'zh-CN',
    cleanUrls: false,
    markdown: markdownOptions,
    // The simulator is built separately, immediately after VitePress in CI.
    ignoreDeadLinks: [/^\/demo\/$/, /^\.\.\/demo\/$/],
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: mark }]],
    vite: {
      resolve: { dedupe: ['vue'] },
      // Keep the framework build and dependency prebundle on one language target.
      build: { target: 'es2020' },
      optimizeDeps: { esbuildOptions: { target: 'es2020' } },
      server: {
        proxy: {
          [`${DOCS_BASE}demo/`]: { target: 'http://127.0.0.1:5179', ws: true },
        },
      },
    },
    locales: {
      zh: {
        label: LOCALES.zh.label,
        lang: LOCALES.zh.htmlLang,
        title: LOCALES.zh.title,
        themeConfig: {
          nav: [
            { text: '指南', link: '/zh/index.html' },
            { text: '独立模拟器', link: '/demo/' },
          ],
          outline: { label: '本页目录', level: [2, 3] },
          docFooter: { prev: '上一章', next: '下一章' },
          sidebarMenuLabel: '章节导航',
          returnToTopLabel: '回到顶部',
          darkModeSwitchLabel: '外观',
          lightModeSwitchTitle: '切换为浅色模式',
          darkModeSwitchTitle: '切换为深色模式',
          langMenuLabel: '语言',
          skipToContentLabel: '跳到正文',
        },
      },
      en: {
        label: LOCALES.en.label,
        lang: LOCALES.en.htmlLang,
        title: LOCALES.en.title,
        themeConfig: {
          nav: [
            { text: 'Guide', link: '/en/index.html' },
            { text: 'Standalone simulator', link: '/demo/' },
          ],
          outline: { label: 'On this page', level: [2, 3] },
        },
      },
    },
    themeConfig: {
      logo: mark,
      siteTitle: 'Nowluma',
      sidebar,
      search: {
        provider: 'local',
        options: {
          locales: {
            zh: {
              translations: {
                button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
                modal: {
                  displayDetails: '显示详细列表',
                  resetButtonTitle: '清除搜索',
                  backButtonTitle: '关闭搜索',
                  noResultsText: '没有找到相关结果',
                  footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
                },
              },
            },
          },
        },
      },
      socialLinks: [{ icon: 'github', link: 'https://github.com/NowLuma/NowLuma' }],
      footer: { message: 'Nowluma source: GPL-3.0-only · See LICENSE and LICENSING.md' },
    },
  };
});
