<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData, useRouter } from 'vitepress';
import { TUTORIAL_SECTION_ANCHORS } from '../../../packages/webui/src/demo/tutorial-sections';
import { tutorialForPage, tutorialSectionForEvent, tutorialUrl } from '../tutorials.mjs';

const { page, frontmatter, site } = useData();
const restarts = ref(0);
const iframe = ref(null);
const expanded = ref(false);
const loaded = ref(false);
const ready = ref(false);
const router = useRouter();
// Page data changes for a chapter navigation, not for a section hash. Keeping
// this component outside Content preserves an active lesson while reading.
const lesson = computed(() => tutorialForPage(page.value.relativePath, frontmatter.value.tutorial));
const source = computed(() =>
  lesson.value ? tutorialUrl(site.value.base, lesson.value.chapter, lesson.value.lang) : '',
);
const fullView = computed(() =>
  lesson.value
    ? tutorialUrl(site.value.base, lesson.value.chapter, lesson.value.lang, { embedded: false })
    : '',
);

// A chapter or language change starts closed. Hash-only navigation keeps progress.
watch(source, () => {
  expanded.value = false;
  loaded.value = false;
  restarts.value = 0;
});

function toggleSimulator() {
  expanded.value = !expanded.value;
  if (expanded.value) loaded.value = true;
}

const copy = computed(() =>
  lesson.value?.lang === 'en'
    ? {
        title: `${page.value.title} — interactive tutorial`,
        load: 'Load simulator',
        expand: 'Show simulator',
        collapse: 'Collapse simulator',
        description: 'Try this chapter with sample data.',
        restart: 'Restart tutorial',
        larger: 'Full view ↗',
        largerLabel: 'Open larger view (new tab)',
      }
    : {
        title: `${page.value.title} — 交互教程`,
        load: '加载模拟器',
        expand: '展开模拟器',
        collapse: '收起模拟器',
        description: '用示例数据操作本章内容。',
        restart: '重新开始',
        larger: '放大查看 ↗',
        largerLabel: '在新标签页中放大',
      },
);

function onSectionRequest(event) {
  if (!expanded.value || !iframe.value) return;
  const anchor = tutorialSectionForEvent(
    event,
    window.location.origin,
    iframe.value.contentWindow,
    lesson.value,
    TUTORIAL_SECTION_ANCHORS,
  );
  if (!anchor || !document.getElementById(anchor)) return;
  void router.go(
    `${window.location.pathname}${window.location.search}#${encodeURIComponent(anchor)}`,
  );
}

onMounted(() => {
  window.addEventListener('message', onSectionRequest);
  ready.value = true;
});
onBeforeUnmount(() => window.removeEventListener('message', onSectionRequest));
</script>

<template>
  <section
    v-if="lesson"
    class="tutorial-simulator"
    :data-tutorial="lesson.chapter"
    :data-tutorial-expanded="expanded"
    :aria-label="page.title"
  >
    <div class="tutorial-simulator-toolbar">
      <div>
        <h2>{{ page.title }}</h2>
        <p v-if="!expanded" class="tutorial-simulator-description">{{ copy.description }}</p>
      </div>
      <div class="tutorial-simulator-actions">
        <button v-if="expanded" type="button" data-tutorial-restart @click="restarts += 1">
          {{ copy.restart }}
        </button>
        <a
          :href="fullView"
          :aria-label="copy.largerLabel"
          target="_blank"
          rel="noopener noreferrer"
          data-tutorial-larger
          >{{ copy.larger }}</a
        >
        <button
          type="button"
          class="tutorial-simulator-toggle"
          data-tutorial-load
          :disabled="!ready"
          :aria-expanded="expanded"
          aria-controls="tutorial-simulator-stage"
          @click="toggleSimulator"
        >
          {{ expanded ? copy.collapse : loaded ? copy.expand : copy.load }}
        </button>
      </div>
    </div>
    <div id="tutorial-simulator-stage" :hidden="!expanded" class="tutorial-simulator-stage">
      <!-- Allow React submit handlers to run; the demo's CSP still blocks native form navigation. -->
      <iframe
        v-if="loaded"
        ref="iframe"
        :key="`${source}:${restarts}`"
        :src="source"
        :title="copy.title"
        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms"
        referrerpolicy="no-referrer"
      ></iframe>
    </div>
  </section>
</template>
