import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from './build-docs.mjs';
import { CHAPTERS, DOCS_BASE, readDocuments } from './docs-metadata.mjs';
import { checkSite, checkSources } from './check-docs.mjs';
import {
  CHAPTER_IDS,
  tutorialForPage,
  tutorialSectionForEvent,
  tutorialUrl,
} from '../docs/.vitepress/tutorials.mjs';
import { TUTORIAL_SECTION_ANCHORS } from '../packages/webui/src/demo/tutorial-sections.ts';

test('tutorial routes accept only the chapter and language allowlists', () => {
  for (const chapter of CHAPTER_IDS) {
    for (const lang of ['zh', 'en']) {
      assert.deepEqual(tutorialForPage(`${lang}/${chapter}.md`, chapter), { chapter, lang });
      assert.equal(
        tutorialUrl(DOCS_BASE, chapter, lang),
        `${DOCS_BASE}demo/?tutorial=${chapter}&lang=${lang}&embed=1`,
      );
      assert.equal(
        tutorialUrl(DOCS_BASE, chapter, lang, { embedded: false }),
        `${DOCS_BASE}demo/?tutorial=${chapter}&lang=${lang}`,
      );
    }
  }
  assert.deepEqual(tutorialForPage('en/logs.md'), { chapter: 'logs', lang: 'en' });
  assert.equal(tutorialForPage('index.md', 'index'), null);
  assert.equal(tutorialForPage('en/logs.md', 'debug'), null);
  assert.equal(tutorialForPage('en/../../demo.md', 'demo'), null);
  assert.throws(() => tutorialUrl('//example.invalid/', 'logs', 'en'));
  assert.throws(() => tutorialUrl(DOCS_BASE, 'logs&token=private', 'en'));
  assert.throws(() => tutorialUrl(DOCS_BASE, 'logs', 'en&embed=0'));
});

test('sources use real VitePress frontmatter, links, images and coverage', async () => {
  assert.deepEqual(await checkSources(), []);
});

test('published hash URLs coexist with native VitePress heading anchors', async () => {
  const documents = await readDocuments();
  const anchors = documents.get('zh/onebot-config.md').anchors;
  assert.ok(anchors.has('通知选择opt-in'), 'the published hash remains reachable');
  assert.ok(anchors.has('通知选择-opt-in'), 'new links use the native framework hash');
  assert.ok(!documents.get('en/index.md').anchors.has('title-nowluma-documentation'));
  for (const [chapter, steps] of Object.entries(TUTORIAL_SECTION_ANCHORS)) {
    for (const anchors of Object.values(steps)) {
      for (const lang of ['zh', 'en']) {
        assert.ok(
          documents.get(`${lang}/${chapter}.md`).anchors.has(anchors[lang]),
          `${lang}/${chapter}: ${anchors[lang]}`,
        );
      }
    }
  }
});

test('section requests reject untrusted windows, origins, fields and step IDs', () => {
  const source = {};
  const origin = 'https://docs.example.invalid';
  const lesson = { chapter: 'first-run', lang: 'en' };
  const data = {
    type: 'nowluma-tutorial-section',
    tutorial: 'first-run',
    step: 'login',
    lang: 'en',
  };
  const request = (changes = {}, event = {}) =>
    tutorialSectionForEvent(
      { origin, source, data: { ...data, ...changes }, ...event },
      origin,
      source,
      lesson,
      TUTORIAL_SECTION_ANCHORS,
    );
  assert.equal(request(), TUTORIAL_SECTION_ANCHORS['first-run'].login.en);
  assert.equal(request({}, { origin: 'https://other.example.invalid' }), null);
  assert.equal(request({}, { source: {} }), null);
  assert.equal(request({ tutorial: 'logs' }), null);
  assert.equal(request({ lang: 'zh' }), null);
  assert.equal(request({ step: 'toString' }), null);
  assert.equal(request({ step: 'login#arbitrary' }), null);
  assert.equal(request({ step: { anchor: 'login' } }), null);
  assert.equal(request({ url: 'https://other.example.invalid/' }), null);
  assert.equal(request({ anchor: 'login' }), null);
});

test(
  'real VitePress output preserves base paths and anchors without loading the simulator',
  { timeout: 180000 },
  async (t) => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nowluma-vitepress-'));
    t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
    await buildSite({ outDir });
    assert.deepEqual(checkSite({ outDir }), []);
    assert.ok(
      checkSite({ outDir, withDemo: true }).some((problem) => problem.includes('demo route')),
    );

    const demo = path.join(outDir, 'demo/index.html');
    fs.mkdirSync(path.dirname(demo));
    const policies = (forms, connections) =>
      `<!doctype html><meta http-equiv="Content-Security-Policy" content="${forms}; ${connections}">`;
    fs.writeFileSync(demo, policies("form-action 'none'", "connect-src 'none'"));
    assert.deepEqual(checkSite({ outDir, withDemo: true }), []);
    for (const [forms, connections, problem] of [
      ["form-action 'self'; form-action 'none'", "connect-src 'none'", "form-action 'none'"],
      ["form-action 'none'", "connect-src 'self'", "connect-src 'none'"],
    ]) {
      fs.writeFileSync(demo, policies(forms, connections));
      assert.ok(
        checkSite({ outDir, withDemo: true }).some((message) => message.includes(problem)),
        problem,
      );
    }

    const file = path.join(outDir, 'en/first-run.html');
    const original = fs.readFileSync(file, 'utf8');
    const mutations = [
      {
        html: original.replace('</section>', '<iframe src="about:blank"></iframe></section>'),
        problem: 'must not load before activation',
      },
      {
        html: original.replace('data-tutorial-expanded="false"', 'data-tutorial-expanded="true"'),
        problem: 'expected a collapsed tutorial launcher',
      },
      {
        html: original.replace(
          'aria-controls="tutorial-simulator-stage"',
          'aria-controls="missing-stage"',
        ),
        problem: 'accessible load control',
      },
      {
        html: original.replace(
          /(<button\b[^>]*\bdata-tutorial-load[^>]*?) disabled(?=[\s>])/,
          '$1',
        ),
        problem: 'disabled until hydration',
      },
      {
        html: original.replace(
          /href="[^"]+demo\/\?tutorial=first-run[^"]*"/,
          'href="https://example.invalid/demo/"',
        ),
        problem: 'simulator full-view link',
      },
    ];
    try {
      for (const mutation of mutations) {
        assert.notEqual(mutation.html, original, 'the regression must change the actual launcher');
        fs.writeFileSync(file, mutation.html);
        assert.ok(
          checkSite({ outDir }).some((problem) => problem.includes(mutation.problem)),
          mutation.problem,
        );
      }
    } finally {
      fs.writeFileSync(file, original);
    }

    const linkedFile = path.join(outDir, 'zh/introduction.html');
    const linked = fs.readFileSync(linkedFile, 'utf8');
    const broken = linked.replace('id="三种不同的保存结果"', 'id="renamed-save-results"');
    assert.notEqual(broken, linked, 'the regression must rename a real linked heading');
    fs.writeFileSync(linkedFile, broken);
    assert.ok(checkSite({ outDir }).some((problem) => problem.includes('missing anchor')));
  },
);

// Official https://www.gnu.org/licenses/gpl-3.0.txt (35149 bytes).
const GPL3_SHA256 = '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986';

test('LICENSE is the unmodified GNU GPLv3 text', () => {
  const licence = fs.readFileSync(new URL('../LICENSE', import.meta.url));
  assert.equal(createHash('sha256').update(licence).digest('hex'), GPL3_SHA256);

  const text = licence.toString('utf8');
  assert.match(text, /^ {20}GNU GENERAL PUBLIC LICENSE\n {23}Version 3, 29 June 2007\n/);
  assert.ok(text.endsWith('why-not-lgpl.html>.\n'));
  assert.ok(!/Nowluma/i.test(text), 'LICENSE must not carry project-specific additions');
});

test('licence metadata, recorded GPL hash and infringement contact stay in sync', () => {
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const lastLine = readme
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .at(-1);
  assert.match(lastLine, /^本项目参考了 \*\*[A-Za-z]{3,}\*\* 的实现思路。$/);

  const contact = 'ws675170761@gmail.com';
  assert.equal(readme.split(contact).length - 1, 1, 'README is the only infringement contact');
  for (const file of [
    'LICENSE',
    'LICENSING.md',
    'EULA.md',
    'PRIVACY.md',
    'CONTRIBUTING.md',
    'deploy/README.md',
  ]) {
    const text = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!text.includes(contact), `${file} must not carry the contact email`);
  }

  const licensing = fs.readFileSync(new URL('../LICENSING.md', import.meta.url), 'utf8');
  assert.ok(licensing.includes(GPL3_SHA256), 'LICENSING.md must record the shipped GPL text hash');
  assert.ok(licensing.includes('https://www.gnu.org/licenses/gpl-3.0.txt'));

  const root = new URL('../', import.meta.url);
  const packageFiles = [
    'package.json',
    ...fs.readdirSync(new URL('packages', root)).map((name) => `packages/${name}/package.json`),
  ];
  for (const file of packageFiles) {
    const pkg = JSON.parse(fs.readFileSync(new URL(file, root), 'utf8'));
    assert.equal(pkg.license, 'GPL-3.0-only', `${file} should declare GPL-3.0-only`);
    assert.ok(!JSON.stringify(pkg).includes(contact), `${file} must not carry the contact email`);
  }
});

test('coverage features map to known chapters and include performance mode', () => {
  const coverage = JSON.parse(
    fs.readFileSync(new URL('../docs/content/coverage.json', import.meta.url), 'utf8'),
  );
  const ids = new Set();
  for (const feature of coverage.features) {
    assert.ok(feature.id && !ids.has(feature.id), `duplicate or empty feature id: ${feature.id}`);
    ids.add(feature.id);
    for (const page of feature.pages) {
      assert.ok(CHAPTERS.includes(page), `${feature.id} points at unknown page ${page}`);
    }
  }
  assert.ok(ids.has('appearance-performance-mode'), 'performance mode should be covered');
});
