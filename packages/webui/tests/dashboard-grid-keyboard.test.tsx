import type { ComponentProps, KeyboardEvent, ReactElement, ReactNode } from 'react';
import type {
    GridItemHTMLElement,
    GridStackEngine,
    GridStackNode,
    GridStackWidget,
} from 'gridstack';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardGrid } from '../src/components/pages/dashboard-grid';
import { OverviewPage } from '../src/components/pages/overview-page';
import { minSizeOf } from '../src/lib/dashboard-layout';
import type * as I18nModule from '../src/i18n';
import type { UiLayoutItem } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

type Handle = {
    dataset: { widgetId: string };
    closest: () => GridItemHTMLElement | undefined;
    focus: ReturnType<typeof vi.fn>;
};
const state = vi.hoisted(() => ({
    language: 'zh' as 'zh' | 'en',
    blocks: [] as UiLayoutItem[],
    mobile: [] as UiLayoutItem[],
    wide: true,
    editing: true,
    low: false,
    reduced: true,
    engine: null as GridStackEngine | null,
    items: new Map<string, GridItemHTMLElement>(),
    handles: new Map<string, Handle>(),
    listeners: new Map<string, () => void>(),
    update: vi.fn(),
    remove: vi.fn(),
    galleryFocus: vi.fn(),
    pointerClass: '',
    setMobile: vi.fn(),
}));

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.translator(state.language) };
});
vi.mock('react-dom', async (original) => ({
    ...(await original<typeof import('react-dom')>()),
    createPortal: (children: ReactNode) => children,
}));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => state.reduced,
    useDragControls: () => ({ start: vi.fn() }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => state.wide }));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: { reduceMotion: false, disableMotion: false },
        performance: { low: state.low },
    }),
}));
vi.mock('@/contexts/LayoutContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/LayoutContext')>()),
    useLayout: () => ({
        overviewBlocks: state.blocks,
        overviewMobile: state.mobile,
        setOverviewBlocks: (blocks: UiLayoutItem[]) => {
            state.blocks = blocks;
        },
        setOverviewMobile: state.setMobile,
        resetLayout: vi.fn(),
        editing: state.editing,
        setEditing: vi.fn(),
    }),
}));

// Only DOM/event transport is faked; the installed engine performs all layout transformations.
vi.mock('gridstack', async (original) => {
    const actual = await original<typeof import('gridstack')>();
    return {
        ...actual,
        GridStack: {
            init: (options: { column: number; float: boolean }) => {
                const engine = new actual.GridStackEngine(options);
                state.engine = engine;
                state.update.mockImplementation(
                    (item: GridItemHTMLElement, patch: GridStackWidget) => {
                        if (
                            engine.moveNode(item.gridstackNode!, {
                                ...patch,
                                resizing: patch.w !== undefined || patch.h !== undefined,
                            })
                        ) {
                            state.listeners.get('change')?.();
                        }
                    },
                );
                state.remove.mockImplementation((item: GridItemHTMLElement) => {
                    engine.removeNode(item.gridstackNode!, false, true);
                    state.items.delete(String(item.gridstackNode!.id));
                    state.handles.delete(String(item.gridstackNode!.id));
                    state.listeners.get('removed')?.();
                });
                return {
                    batchUpdate: (flag = true) => engine.batchUpdate(flag),
                    addWidget: (widget: GridStackNode) => {
                        const node = engine.addNode(widget);
                        const content = { nodeType: 1 };
                        const item = {
                            gridstackNode: node,
                            classList: { contains: (name: string) => name === state.pointerClass },
                            querySelector: () => content,
                        } as unknown as GridItemHTMLElement;
                        node.el = item;
                        state.items.set(String(node.id), item);
                        return item;
                    },
                    save: () => engine.save(false),
                    on: (name: string, callback: () => void) => state.listeners.set(name, callback),
                    off: (name: string) => state.listeners.delete(name),
                    update: state.update,
                    removeWidget: state.remove,
                    destroy: vi.fn(),
                };
            },
        },
    };
});

let hosts: ReturnType<typeof hookHost>[];
beforeEach(() => {
    vi.clearAllMocks();
    state.blocks = [
        { id: 'note', visible: true, x: 0, y: 0, w: 3, h: 3, config: { text: 'retained note' } },
        {
            id: 'link',
            visible: true,
            x: 6,
            y: 5,
            w: 3,
            h: 3,
            config: { url: 'https://example.invalid' },
        },
    ];
    state.mobile = [
        { id: 'note', visible: false },
        { id: 'link', visible: true },
    ];
    Object.assign(state, {
        language: 'zh',
        wide: true,
        editing: true,
        low: false,
        reduced: true,
        pointerClass: '',
    });
    state.items.clear();
    state.handles.clear();
    state.listeners.clear();
    state.setMobile.mockImplementation((items: UiLayoutItem[]) => {
        state.mobile = items;
    });
    hosts = [];
    vi.stubGlobal('document', { querySelector: () => ({ focus: state.galleryFocus }) });
});
afterEach(() => {
    hosts.forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function host() {
    const next = hookHost();
    hosts.push(next);
    return next;
}

function find(
    node: ReactNode,
    predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) {
    const result = elements(node).find(predicate);

    if (!result) {
        throw new Error('Expected production layout control');
    }

    return result;
}

function invoke(node: ReactElement<Record<string, unknown>>) {
    return (node.type as (props: Record<string, unknown>) => ReactNode)(node.props);
}

function owner() {
    const parent = host();
    return () => parent.render(() => OverviewPage());
}

function mount(cols = 12) {
    const renderOwner = owner();
    const original = find(renderOwner(), (element) => element.type === DashboardGrid)
        .props as unknown as ComponentProps<typeof DashboardGrid>;
    let currentChange = original.onChange;
    const change = vi.fn((coords: Parameters<typeof currentChange>[0]) => currentChange(coords));
    const gridHost = host();
    const dom = {
        contains: (target: unknown) => [...state.handles.values()].includes(target as Handle),
        querySelectorAll: () => [...state.handles.values()],
        replaceChildren: () => {
            state.items.clear();
            state.handles.clear();
        },
    };

    const render = () => {
        const props = find(renderOwner(), (element) => element.type === DashboardGrid)
            .props as unknown as ComponentProps<typeof DashboardGrid>;
        currentChange = props.onChange;
        return gridHost.render(() => {
            const tree = DashboardGrid({
                ...props,
                cols,
                onChange: change,
                renderWidget: () => <span>content</span>,
            });
            (tree.props.ref as { current: unknown }).current = dom;

            for (const element of elements(tree)) {
                const id = element.props['data-widget-id'];

                if (typeof id !== 'string' || state.handles.has(id)) {
                    continue;
                }

                state.handles.set(id, {
                    dataset: { widgetId: id },
                    closest: () => state.items.get(id),
                    focus: vi.fn(),
                });
            }

            return tree;
        });
    };

    render();
    render();

    const key = (
        id: string,
        name: string,
        patch: Partial<KeyboardEvent<HTMLButtonElement>> = {},
    ) => {
        const button = find(render(), (element) => element.props['data-widget-id'] === id);
        const target = state.handles.get(id)!;
        const event = {
            key: name,
            currentTarget: target,
            target,
            shiftKey: false,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
            ...patch,
        };
        (button.props.onKeyDown as (event: unknown) => void)(event);
        return event;
    };

    return { render, key, change, gridHost };
}

describe('DashboardGrid keyboard editing through the real layout engine', () => {
    it('localizes the overview and edit controls without changing widget identity', () => {
        state.language = 'en';
        const overview = owner()();
        expect(
            find(overview, (item) => item.props.id === 'overview-widgets-title').props.children,
        ).toBe('Runtime and logs');
        const gallery = find(
            overview,
            (item) => typeof item.type === 'function' && item.type.name === 'WidgetGallery',
        );
        expect(
            find(invoke(gallery), (item) => item.props.role === 'region').props['aria-label'],
        ).toBe('Card library');
        const grid = mount();
        const rendered = grid.render();
        expect(
            find(rendered, (item) => item.props['data-widget-id'] === 'note').props['aria-label'],
        ).toBe('Adjust the Note card layout');
        expect(
            find(rendered, (item) => item.props['aria-label'] === 'Configure the Note card').type,
        ).toBe('button');
    });

    it('moves and resizes through the existing change writer without initialization writes', () => {
        const grid = mount();
        expect(grid.change).not.toHaveBeenCalled();
        const event = grid.key('note', 'ArrowRight');
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(grid.change).toHaveBeenCalledOnce();
        expect(state.blocks.find((block) => block.id === 'note')).toMatchObject({
            x: 1,
            y: 0,
            config: { text: 'retained note' },
        });
        grid.key('note', 'ArrowDown', { shiftKey: true });
        expect(state.blocks.find((block) => block.id === 'note')).toMatchObject({
            h: 4,
            config: { text: 'retained note' },
        });
    });

    it('clamps non-negative position, width to columns and dimensions to catalogue minimums without boundary writes', () => {
        const grid = mount();
        grid.key('note', 'ArrowLeft');
        grid.key('note', 'ArrowUp');
        expect(grid.change).not.toHaveBeenCalled();

        for (let index = 0; index < 20; index += 1) {
            grid.key('note', 'ArrowLeft', { shiftKey: true });
        }

        for (let index = 0; index < 20; index += 1) {
            grid.key('note', 'ArrowUp', { shiftKey: true });
        }

        expect(state.engine!.nodes.find((node) => node.id === 'note')).toMatchObject({
            w: minSizeOf('note').minW,
            h: minSizeOf('note').minH,
        });

        for (let index = 0; index < 20; index += 1) {
            grid.key('note', 'ArrowRight');
        }

        const node = state.engine!.nodes.find((node) => node.id === 'note')!;
        expect(node.x! + node.w!).toBeLessThanOrEqual(12);
        grid.change.mockClear();
        grid.key('note', 'ArrowRight');
        expect(grid.change).not.toHaveBeenCalled();
    });

    it('hides instead of deleting durable configuration and restores focus to a surviving handle', () => {
        const grid = mount();
        grid.key('note', 'ArrowRight');
        const before = { ...state.blocks[0] };
        grid.key('note', 'Delete');
        expect(state.remove).toHaveBeenCalledOnce();
        expect(state.blocks.find((block) => block.id === 'note')).toEqual({
            ...before,
            visible: false,
        });
        grid.render();
        grid.render();
        expect(state.handles.get('link')!.focus).toHaveBeenCalled();
    });

    it('returns focus to the gallery when hiding the last visible card unmounts the grid', () => {
        state.blocks = [state.blocks[0]];
        const grid = mount();
        grid.key('note', 'Delete');
        grid.gridHost.unmount();
        expect(state.galleryFocus).toHaveBeenCalledOnce();
        expect(state.blocks[0].config).toEqual({ text: 'retained note' });
    });

    it('leaves input/modifier keys, pointer gestures and unmounted controls untouched', () => {
        const grid = mount();
        grid.key('note', 'ArrowRight', { target: {} as EventTarget });
        grid.key('note', 'ArrowRight', { ctrlKey: true });
        state.pointerClass = 'ui-draggable-dragging';
        grid.key('note', 'ArrowRight');
        expect(grid.change).not.toHaveBeenCalled();
        state.pointerClass = '';
        const control = find(
            grid.render(),
            (element) => element.props['data-widget-id'] === 'note',
        );
        const currentTarget = state.handles.get('note')!;
        grid.gridHost.unmount();
        (control.props.onKeyDown as (event: unknown) => void)({
            key: 'Delete',
            currentTarget,
            target: currentTarget,
        });
        expect(state.remove).not.toHaveBeenCalled();
    });
});

describe('MobileOverview keyboard order through its original writer', () => {
    it('sorts from the focused handle, preserves IDs/visibility/config and skips boundaries', () => {
        state.wide = false;
        const render = owner();
        const mobile = find(
            render(),
            (element) =>
                typeof element.type === 'function' && element.type.name === 'MobileOverview',
        );
        const list = invoke(mobile);
        const row = find(
            list,
            (element) =>
                typeof element.type === 'function' &&
                element.type.name === 'MobileLayoutRow' &&
                (element.props.item as UiLayoutItem).id === 'note',
        );
        const rowHost = host();
        const tree = rowHost.render(() => invoke(row));
        const handle = find(tree, (element) => element.props['aria-label'] === '调整便签卡片顺序');
        const currentTarget = {};
        const event = {
            key: 'ArrowUp',
            currentTarget,
            target: currentTarget,
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };
        (handle.props.onKeyDown as (event: unknown) => void)(event);
        expect(state.setMobile).not.toHaveBeenCalled();
        event.key = 'ArrowDown';
        (handle.props.onKeyDown as (event: unknown) => void)(event);
        expect(event.preventDefault).toHaveBeenCalledTimes(2);
        expect(state.mobile[1]).toEqual({ id: 'note', visible: false });
        expect(state.blocks[0].config).toEqual({ text: 'retained note' });
        expect(state.mobile[0].id).toBe('link');
        state.setMobile.mockClear();
        const nextMobile = find(
            render(),
            (element) =>
                typeof element.type === 'function' && element.type.name === 'MobileOverview',
        );
        const nextRow = find(
            invoke(nextMobile),
            (element) =>
                typeof element.type === 'function' &&
                element.type.name === 'MobileLayoutRow' &&
                (element.props.item as UiLayoutItem).id === 'note',
        );
        expect(nextRow.key).toBe(row.key);
        const lastId = (nextMobile.props.items as UiLayoutItem[]).at(-1)!.id;
        const lastRow = find(
            invoke(nextMobile),
            (element) =>
                typeof element.type === 'function' &&
                element.type.name === 'MobileLayoutRow' &&
                (element.props.item as UiLayoutItem).id === lastId,
        );
        const lastTree = rowHost.render(() => invoke(lastRow));
        const lastHandle = find(
            lastTree,
            (element) =>
                typeof element.props['aria-label'] === 'string' &&
                String(element.props['aria-label']).endsWith('卡片顺序'),
        );
        (lastHandle.props.onKeyDown as (event: unknown) => void)(event);
        expect(state.setMobile).not.toHaveBeenCalled();
    });
});
