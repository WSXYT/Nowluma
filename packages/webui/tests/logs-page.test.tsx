import type { ChangeEvent, RefObject } from 'react';
import type * as MotionModule from 'motion/react';
import type * as ReactModule from 'react';
import type * as UtilsModule from '../src/lib/utils';
import type { VirtualizerOptions } from '@tanstack/react-virtual';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogsPage } from '../src/components/pages/logs-page';
import type { LogEntry, UiLogsPrefs } from '../src/types';
import type { LogsStreamOptions } from '../src/lib/api/types';
import type * as I18nModule from '../src/i18n';
import { elements, hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';

type LogVirtualizerOptions = Pick<
    VirtualizerOptions<HTMLElement, HTMLElement>,
    'count' | 'getScrollElement' | 'getItemKey' | 'scrollMargin'
>;

const state = vi.hoisted(() => ({
    language: 'zh' as 'zh' | 'en',
    prefs: {} as UiLogsPrefs,
    virtualizerOptions: null as LogVirtualizerOptions | null,
    stream: null as LogsStreamOptions | null,
    api: {
        logs: {
            list: vi.fn(),
            stream: vi.fn(),
            getLevel: vi.fn(),
            setLevel: vi.fn(),
            exportTrace: vi.fn(),
        },
    },
    disposeStream: vi.fn(),
    measure: vi.fn(),
    scrollToIndex: vi.fn(),
    downloadBlob: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof ReactModule>()) }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.translator(state.language) };
});
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof MotionModule>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/lib/api', () => ({ useApi: () => state.api }));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ formatClock: (time: string) => time }),
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({
        runAction: (_options: unknown, action: () => unknown) => action(),
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({
        pages: { logs: state.prefs },
        setPages: (patch: { logs: UiLogsPrefs }) => {
            state.prefs = patch.logs;
        },
    }),
}));
vi.mock('@/lib/utils', async (original) => ({
    ...(await original<typeof UtilsModule>()),
    downloadBlob: state.downloadBlob,
}));
vi.mock('@tanstack/react-virtual', () => {
    const virtualizer = {
        measure: state.measure,
        measureElement: vi.fn(),
        scrollToIndex: state.scrollToIndex,
        getTotalSize: () => (state.virtualizerOptions?.count ?? 0) * 28,
        getVirtualItems: () =>
            state.virtualizerOptions?.count
                ? [
                      {
                          index: 0,
                          key: state.virtualizerOptions.getItemKey?.(0) ?? 0,
                          start: state.virtualizerOptions.scrollMargin ?? 0,
                          end: (state.virtualizerOptions.scrollMargin ?? 0) + 28,
                          size: 28,
                          lane: 0,
                      },
                  ]
                : [],
    };
    return {
        useVirtualizer: (options: LogVirtualizerOptions) => {
            state.virtualizerOptions = options;
            return virtualizer;
        },
    };
});

let host: HookHost;
let viewport: HTMLElement;
let pageElement: HTMLDivElement;
let listElement: HTMLDivElement;
let listOffset: number;
let documentStub: EventTarget & { visibilityState: 'visible' | 'hidden' };
let resizeCallbacks: (() => void)[];
const queryViewport = vi.fn();

const initialLogs: LogEntry[] = [
    {
        id: 1,
        time: '10:00:01',
        level: 'info',
        scope: 'bridge',
        message: 'connected',
        line: 'bridge connected',
    },
    {
        id: 2,
        time: '10:00:02',
        level: 'error',
        scope: 'bridge',
        message: 'failure',
        line: '\u001b[31mbridge failure\u001b[0m',
    },
    {
        id: 3,
        time: '10:00:03',
        level: 'info',
        scope: 'other',
        message: 'other output',
        line: 'other output',
    },
];

function render() {
    return host.render(() => {
        const tree = LogsPage();
        (tree.props.ref as RefObject<HTMLDivElement | null>).current = pageElement;
        const region = elements(tree).find(
            (item) => item.props['data-tutorial-control'] === 'log-entries',
        )!;
        (region.props.ref as RefObject<HTMLDivElement | null>).current = listElement;
        return tree;
    });
}

async function flush() {
    for (let index = 0; index < 12; index++) {
        await Promise.resolve();
    }
}

beforeEach(async () => {
    vi.useFakeTimers();
    host = hookHost();
    state.language = 'zh';
    state.prefs = {
        visibleLevels: ['trace', 'debug', 'info', 'success', 'warn', 'error'],
        maxLines: 1000,
        autoScroll: true,
        wrap: true,
        highlightRules: [],
        preset: 'custom',
    };
    state.virtualizerOptions = null;
    state.stream = null;
    state.disposeStream.mockReset();
    state.measure.mockReset();
    state.scrollToIndex.mockReset();
    state.downloadBlob.mockReset();
    state.api.logs.list.mockReset().mockResolvedValue(initialLogs);
    state.api.logs.getLevel.mockReset().mockResolvedValue({ level: 'info' });
    state.api.logs.stream.mockReset().mockImplementation((options: LogsStreamOptions) => {
        state.stream = options;
        return state.disposeStream;
    });
    listOffset = 320;
    viewport = {
        scrollTop: 80,
        getBoundingClientRect: () => ({ top: 10 }),
    } as unknown as HTMLElement;
    pageElement = {} as HTMLDivElement;
    listElement = {
        getBoundingClientRect: () => ({ top: listOffset + 10 - viewport.scrollTop }),
    } as unknown as HTMLDivElement;
    queryViewport.mockReset().mockReturnValue(viewport);
    documentStub = Object.assign(new EventTarget(), {
        visibilityState: 'visible' as 'visible' | 'hidden',
        querySelector: queryViewport,
    });
    resizeCallbacks = [];
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    vi.stubGlobal(
        'requestAnimationFrame',
        vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe = vi.fn();
            disconnect = vi.fn();
            constructor(callback: ResizeObserverCallback) {
                resizeCallbacks.push(() => callback([], this as unknown as ResizeObserver));
            }
        },
    );
    render();
    await flush();
    render();
    state.scrollToIndex.mockClear();
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('LogsPage workspace scrolling', () => {
    it.each([
        {
            language: 'zh',
            workspace: '日志工作区',
            searchLabel: '搜索消息 / 模块 / 级别',
            entries: '日志内容',
            trace: '导出完整 TRACE',
        },
        {
            language: 'en',
            workspace: 'Log workspace',
            searchLabel: 'Search messages, modules, or levels',
            entries: 'Log entries',
            trace: 'Export full TRACE',
        },
    ] as const)(
        'exposes the same tutorial controls in $language outside dialogs',
        ({ language, workspace, searchLabel, entries, trace }) => {
            state.language = language;
            const nodes = elements(render());
            const section = nodes.find(
                (item) => item.props['data-tutorial-control'] === 'log-workspace',
            );
            const search = nodes.find(
                (item) => item.props['data-tutorial-control'] === 'log-search',
            );
            const region = nodes.find(
                (item) => item.props['data-tutorial-control'] === 'log-entries',
            );
            expect(section).toMatchObject({ type: 'section', props: { 'aria-label': workspace } });
            expect(search?.props).toMatchObject({ type: 'search', 'aria-label': searchLabel });
            expect(region?.props).toMatchObject({ role: 'region', 'aria-label': entries });

            const traceControl = nodes.find((item) => item.props.label === trace)!;
            const ToolButton = traceControl.type as (
                props: typeof traceControl.props,
            ) => ReactModule.ReactNode;
            const traceButton = elements(ToolButton(traceControl.props)).find(
                (item) => item.props['data-tutorial-control'] === 'log-export-trace',
            );
            expect(traceButton?.props['aria-label']).toBe(trace);
            expect(state.api.logs.list).toHaveBeenCalledOnce();
            expect(state.api.logs.stream).toHaveBeenCalledOnce();
        },
    );

    it('relabels the existing stream state without rewriting log data or reconnecting', () => {
        state.stream!.onStatus?.('reconnecting');
        const reconnecting = elements(render()).find((item) => item.props.role === 'status');
        expect(reconnecting?.props.children).toContain('重连中');

        state.language = 'en';
        const nodes = elements(render());
        const status = nodes.find((item) => item.props.role === 'status');
        expect(status?.props.children).toContain('Reconnecting');
        const row = nodes.find((item) => item.props['data-index'] === 0);
        expect(
            elements(row).find((item) => String(item.props.className).startsWith('cp-log-message '))
                ?.props.children,
        ).toContain(initialLogs[0].message);
        expect(state.virtualizerOptions?.getItemKey?.(0)).toBe(initialLogs[0].id);
        expect(state.api.logs.stream).toHaveBeenCalledOnce();
    });

    it('preserves loaded entries and the underlying error after a failed refresh in English', async () => {
        state.language = 'en';
        state.api.logs.list.mockRejectedValueOnce(new Error('读取超时 (E_READ)'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const refresh = elements(render()).find((item) => item.props.label === 'Refresh')!;
        (refresh.props.onClick as () => void)();
        await flush();
        const alert = elements(render()).find((item) => item.props.role === 'alert')!;
        expect(alert.props.children).toContain('Failed to load logs: 读取超时 (E_READ)');
        expect(alert.props.children).toContain('Showing previously loaded and live entries.');
        expect(state.virtualizerOptions?.count).toBe(initialLogs.length);
    });

    it('uses the workspace viewport and updates virtual offsets when document controls grow', () => {
        expect(queryViewport).toHaveBeenCalledWith(
            '#workspace-content [data-radix-scroll-area-viewport]',
        );
        expect(state.virtualizerOptions?.getScrollElement()).toBe(viewport);
        expect(state.virtualizerOptions?.scrollMargin).toBe(320);
        listOffset += 84;
        resizeCallbacks.forEach((callback) => callback());
        const tree = render();
        expect(state.virtualizerOptions?.scrollMargin).toBe(404);
        const row = elements(tree).find((item) => item.props['data-index'] === 0)!;
        expect(row.props.style).toEqual({ top: 0 });
        expect(state.scrollToIndex).toHaveBeenCalledWith(2, { align: 'end' });
    });

    it('keeps receiving lines without following the tail while scrolling is paused', () => {
        const toggle = elements(render()).find((item) => item.props.label === '自动滚动已开启')!;
        (toggle.props.onClick as () => void)();
        render();
        state.stream!.onLine({ ...initialLogs[0], id: 4, message: 'new output' });
        vi.advanceTimersByTime(80);
        render();
        expect(state.virtualizerOptions?.count).toBe(4);
        expect(state.scrollToIndex).not.toHaveBeenCalled();
        expect(state.api.logs.stream).toHaveBeenCalledOnce();
        expect(state.disposeStream).not.toHaveBeenCalled();
    });

    it('does not move a hidden workspace and follows buffered lines after it becomes visible', () => {
        documentStub.visibilityState = 'hidden';
        documentStub.dispatchEvent(new Event('visibilitychange'));
        render();
        state.stream!.onLine({ ...initialLogs[0], id: 4, message: 'hidden output' });
        vi.advanceTimersByTime(80);
        render();
        expect(state.virtualizerOptions?.count).toBe(4);
        expect(state.scrollToIndex).not.toHaveBeenCalled();
        documentStub.visibilityState = 'visible';
        documentStub.dispatchEvent(new Event('visibilitychange'));
        render();
        expect(state.scrollToIndex).toHaveBeenCalledWith(3, { align: 'end' });
        expect(state.api.logs.stream).toHaveBeenCalledOnce();
    });

    it.each([
        { language: 'zh', exportLabel: '导出当前视图' },
        { language: 'en', exportLabel: 'Export current view' },
    ] as const)(
        'exports only the filtered view in $language and strips terminal presentation',
        async ({ language, exportLabel }) => {
            state.language = language;
            const search = elements(render()).find(
                (item) => item.props['data-tutorial-control'] === 'log-search',
            )!;
            (search.props.onChange as (event: ChangeEvent<HTMLInputElement>) => void)({
                target: { value: 'bridge' },
            } as ChangeEvent<HTMLInputElement>);
            let tree = render();
            expect(state.virtualizerOptions?.count).toBe(2);
            const info = elements(tree).find(
                (item) => item.props.children === 'INFO' && item.props['aria-pressed'] === true,
            )!;
            (info.props.onClick as () => void)();
            tree = render();
            expect(state.virtualizerOptions?.count).toBe(1);
            const exportButton = elements(tree).find(
                (item) => item.props['aria-label'] === exportLabel,
            )!;
            (exportButton.props.onClick as () => void)();
            expect(state.downloadBlob).toHaveBeenCalledOnce();
            const [blob, filename] = state.downloadBlob.mock.calls[0] as [Blob, string];
            expect(await blob.text()).toBe('bridge failure\n');
            expect(filename).toMatch(/^nowluma-logs-.*\.log$/);
            expect(state.api.logs.stream).toHaveBeenCalledOnce();
        },
    );
});
