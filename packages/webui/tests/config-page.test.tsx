import type { ComponentProps, FunctionComponent, ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigPage } from '../src/components/pages/config-page';
import { AdapterRow } from '../src/components/config/adapter-row';
import { GeneralSettingsTab } from '../src/components/config/general-settings-tab';
import { NodeEditDialog } from '../src/components/config/node-edit-dialog';
import { ConfirmDialog } from '../src/components/confirm-dialog';
import { Button } from '../src/components/ui/button';
import type * as I18n from '../src/i18n';
import type * as Motion from 'motion/react';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';
import type { ConfigSaveResult } from '../src/lib/api/types';
import type { OneBotConfig } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    selectedUin: '10001',
    configTab: 'httpServers',
    api: { config: { get: vi.fn(), save: vi.fn() } },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', () => ({ useApi: () => state.api }));
vi.mock('@/contexts/ActionFeedbackContext', async (original) => ({
    ...(await original<typeof import('../src/contexts/ActionFeedbackContext')>()),
    useActionFeedback: () => ({
        runAction: (_options: unknown, action: () => unknown) => action(),
    }),
}));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof Motion>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({
        selectedUin: state.selectedUin,
        qqList: [
            { uin: '10001', nickname: 'Account A' },
            { uin: '20002', nickname: 'Account B' },
        ],
        connections: [],
        setSelectedUin: vi.fn(),
        refreshQqList: vi.fn(),
        resources: { qqList: { ready: true, error: '' } },
    }),
}));
vi.mock('@/contexts/LayoutContext', () => ({
    useLayout: () => ({ pages: { configTab: state.configTab }, setPages: vi.fn() }),
}));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator('en') };
});

const original = normalizeOneBotConfig({
    networks: { httpServers: [{ name: 'server-a', port: 3000, accessToken: 'fixture' }] },
});
let pageHost: ReturnType<typeof hookHost>;
let viewHost: ReturnType<typeof hookHost>;
let rowHost: ReturnType<typeof hookHost>;
let dialogHost: ReturnType<typeof hookHost>;
const page = () => pageHost.render(ConfigPage);

const flush = async () => {
    for (let i = 0; i < 12; i++) {
        await Promise.resolve();
    }
};

const find = (
    tree: ReactNode,
    predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
) => {
    const result = elements(tree).find(predicate);
    expect(result).toBeDefined();
    return result!;
};

function view() {
    const element = find(
        page(),
        (item) => typeof item.type === 'function' && item.type.name === 'NetworkTabView',
    );
    return viewHost.render(() => (element.type as FunctionComponent)(element.props));
}

function rowProps() {
    return find(view(), (item) => item.type === AdapterRow).props as ComponentProps<
        typeof AdapterRow
    >;
}

function selectTab(tab: 'general' | 'httpServers') {
    const tabs = find(
        page(),
        (item) => typeof item.type === 'function' && item.type.name === 'TabStrip',
    );
    (tabs.props.onChange as (tab: string) => void)(tab);
}

function generalProps() {
    return find(page(), (item) => item.type === GeneralSettingsTab).props as ComponentProps<
        typeof GeneralSettingsTab
    >;
}

function openDelete() {
    const props = rowProps();
    const row = rowHost.render(() => AdapterRow(props));
    (
        find(row, (item) => item.props['aria-label'] === 'Delete server-a').props
            .onClick as () => void
    )();
    return () =>
        find(
            rowHost.render(() => AdapterRow(props)),
            (item) => item.type === ConfirmDialog,
        ).props as ComponentProps<typeof ConfirmDialog>;
}

function confirmButton(tree: ReactNode) {
    const modal = tree as ReactElement<{ footer: ReactNode }>;
    return find(
        modal.props.footer,
        (item) => item.type === Button && item.props.variant === 'destructive',
    );
}

const response = (
    config: OneBotConfig,
    patch: Partial<ConfigSaveResult> = {},
): ConfigSaveResult => ({
    config,
    saved: true,
    applied: true,
    online: true,
    errors: [],
    message: '',
    ...patch,
});

beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    pageHost = hookHost();
    viewHost = hookHost();
    rowHost = hookHost();
    dialogHost = hookHost();
    state.selectedUin = '10001';
    state.configTab = 'httpServers';
    state.api.config.get.mockReset().mockResolvedValue(original);
    state.api.config.save.mockReset();
    page();
    await flush();
});
afterEach(() => {
    [pageHost, viewHost, rowHost, dialogHost].forEach((host) => host.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('ConfigPage adapter changes', () => {
    it('keeps the English chapter tabs and Save now control stable and saves the selected account', async () => {
        const tabStrip = find(
            page(),
            (item) => typeof item.type === 'function' && item.type.name === 'TabStrip',
        );
        const tabTree = hookHost().render(() =>
            (tabStrip.type as FunctionComponent)(tabStrip.props),
        );
        const httpTab = find(tabTree, (item) => item.props.id === 'config-tab-httpServers');
        expect(
            elements(httpTab.props.children as ReactNode).some(
                (item) => item.props.children === 'HTTP API',
            ),
        ).toBe(true);
        expect(httpTab.props['aria-controls']).toBe('config-panel-httpServers');
        const generalTab = find(tabTree, (item) => item.props.id === 'config-tab-general');
        expect(
            elements(generalTab.props.children as ReactNode).some(
                (item) => item.props.children === 'Message behavior',
            ),
        ).toBe(true);
        (generalTab.props.onClick as () => void)();
        expect(
            find(page(), (item) => item.props.id === 'config-panel-general').props[
                'aria-labelledby'
            ],
        ).toBe('config-tab-general');

        const editor = find(
            page(),
            (item) => typeof item.type === 'function' && item.type.name === 'EditorBar',
        );
        const editorTree = hookHost().render(() =>
            (editor.type as FunctionComponent)(editor.props),
        );
        const saveNow = find(
            editorTree,
            (item) => item.props['data-tutorial-control'] === 'config-save',
        );
        expect(saveNow.props.children).toContain('Save now');
        state.api.config.save.mockResolvedValue(response(original));
        (saveNow.props.onClick as () => void)();
        await flush();
        expect(state.api.config.save).toHaveBeenCalledExactlyOnceWith('10001', original);
        expect(find(page(), (item) => item.type === editor.type).props.saveStatusTone).toBe(
            'success',
        );
    });

    it('opens a deletion confirmation and cancels without a write', () => {
        const confirmation = openDelete();
        expect(confirmation().open).toBe(true);
        confirmation().onOpenChange(false);
        expect(confirmation().open).toBe(false);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).not.toHaveBeenCalled();
    });

    it('confirms once, disables repeat submission and targets the selected account', async () => {
        const confirmation = openDelete();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        state.api.config.save.mockReturnValue(pending.promise);
        let dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        expect(state.api.config.save).toHaveBeenCalledOnce();
        const [uin, target] = state.api.config.save.mock.calls[0] as [string, OneBotConfig];
        expect(uin).toBe('10001');
        expect(target.networks.httpServers).toEqual([]);
        dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        expect(confirmButton(dialog).props.disabled).toBe(true);
        pending.resolve(response(target));
        await flush();
        expect(confirmation().open).toBe(false);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
        expect(state.api.config.get).toHaveBeenCalledOnce();
    });

    it('keeps the original adapter and visible modal error after failed deletion without retry', async () => {
        const confirmation = openDelete();
        state.api.config.save.mockRejectedValue(new Error('删除写入失败'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        await flush();
        const next = dialogHost.render(() => ConfirmDialog(confirmation()));
        expect(find(next, (item) => item.props.role === 'alert').props.children).toBe(
            '删除写入失败',
        );
        expect(confirmation().open).toBe(true);
        expect(rowProps().item.name).toBe('server-a');
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
    });

    it('retains a persisted removal and its apply warning when runtime restart fails', async () => {
        const confirmation = openDelete();
        state.api.config.save.mockImplementation((_uin, target: OneBotConfig) =>
            Promise.resolve(
                response(target, {
                    applied: false,
                    errors: [{ name: 'server-a', phase: 'stop', message: '关闭超时', at: 1 }],
                }),
            ),
        );
        const dialog = dialogHost.render(() => ConfirmDialog(confirmation()));
        (confirmButton(dialog).props.onClick as () => void)();
        await flush();
        expect(confirmation().open).toBe(false);
        const editor = find(
            page(),
            (item) => typeof item.type === 'function' && item.type.name === 'EditorBar',
        );
        expect(editor.props.saveStatusTone).toBe('warning');
        expect(editor.props.saveStatus).toContain('server-a: 关闭超时');
        expect(elements(view()).filter((item) => item.type === AdapterRow)).toHaveLength(0);
        vi.advanceTimersByTime(10_000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
    });

    it('blocks edits based on the displayed old adapters until their write settles', async () => {
        const pending = Promise.withResolvers<ConfigSaveResult>();
        state.api.config.save
            .mockReturnValueOnce(pending.promise)
            .mockImplementation((_uin, target: OneBotConfig) => Promise.resolve(response(target)));
        selectTab('general');
        const staleGeneral = generalProps();
        selectTab('httpServers');
        rowProps().onToggleEnabled(false);
        const disabled = state.api.config.save.mock.calls[0][1] as OneBotConfig;
        expect(disabled.networks.httpServers[0].enabled).toBe(false);
        selectTab('general');
        const displayed = generalProps();
        expect(displayed.config.networks.httpServers[0].enabled).not.toBe(false);
        displayed.onChange({ ...displayed.config, historySync: { enabled: true } });
        const pendingTree = page();
        pending.resolve(response(disabled));
        await flush();
        vi.advanceTimersByTime(500);
        await flush();
        expect(state.api.config.save).toHaveBeenCalledOnce();
        const fieldset = find(
            pendingTree,
            (item) =>
                item.type === 'fieldset' &&
                elements(item.props.children as ReactNode).some(
                    (child) => child.type === GeneralSettingsTab,
                ),
        );
        expect(fieldset.props.disabled).toBe(true);
        staleGeneral.onChange({ ...staleGeneral.config, historySync: { enabled: true } });
        vi.advanceTimersByTime(500);
        await flush();
        expect(state.api.config.save).toHaveBeenCalledOnce();
        const current = generalProps();
        expect(current.config.networks.httpServers[0].enabled).toBe(false);
        expect(current.config.historySync.enabled).toBe(false);
        current.onChange({ ...current.config, historySync: { enabled: true } });
        page();
        vi.advanceTimersByTime(500);
        await flush();
        expect(state.api.config.save).toHaveBeenCalledTimes(2);
        const next = state.api.config.save.mock.calls[1][1] as OneBotConfig;
        expect(next.networks.httpServers[0].enabled).toBe(false);
        expect(next.historySync.enabled).toBe(true);
        expect(generalProps().config).toEqual(next);
    });

    it('ignores repeat writes from callbacks captured before an adapter mutation', async () => {
        const pending = Promise.withResolvers<ConfigSaveResult>();
        state.api.config.save.mockReturnValue(pending.promise);
        const tree = page();
        const editor = find(
            tree,
            (item) => typeof item.type === 'function' && item.type.name === 'EditorBar',
        );
        const network = find(
            tree,
            (item) => typeof item.type === 'function' && item.type.name === 'NetworkTabView',
        );
        const toggle = network.props.onToggleEnabled as (index: number, enabled: boolean) => void;
        toggle(0, false);
        (editor.props.onSave as () => void)();
        toggle(0, true);
        await flush();
        expect(state.api.config.save).toHaveBeenCalledOnce();
        const target = state.api.config.save.mock.calls[0][1] as OneBotConfig;
        pending.resolve(response(target));
        await flush();
        (editor.props.onSave as () => void)();
        toggle(0, true);
        await flush();
        vi.advanceTimersByTime(1000);
        expect(state.api.config.save).toHaveBeenCalledOnce();
        expect(rowProps().item.enabled).toBe(false);
    });

    it('keeps an open adapter editor pending when a queued general write starts first', async () => {
        const pending = Promise.withResolvers<ConfigSaveResult>();
        state.api.config.save.mockReturnValue(pending.promise);
        selectTab('general');
        const general = generalProps();
        general.onChange({ ...general.config, historySync: { enabled: true } });
        selectTab('httpServers');
        rowProps().onEdit();
        const dialog = find(page(), (item) => item.type === NodeEditDialog).props as ComponentProps<
            typeof NodeEditDialog
        >;
        vi.advanceTimersByTime(500);
        expect(state.api.config.save).toHaveBeenCalledOnce();
        await expect(dialog.onSubmit({ ...dialog.initial, name: 'edited-server' })).rejects.toThrow(
            'Review your changes and try again.',
        );
        expect(state.api.config.save).toHaveBeenCalledOnce();
        expect(find(page(), (item) => item.type === NodeEditDialog).props.open).toBe(true);
        const target = state.api.config.save.mock.calls[0][1] as OneBotConfig;
        expect(target.historySync.enabled).toBe(true);
        pending.resolve(response(target));
        await flush();
        expect(rowProps().item.name).toBe('server-a');
    });

    it.each([true, false])(
        'preserves earlier queued general edits when an adapter write succeeds=%s',
        async (succeeds) => {
            const pending = Promise.withResolvers<ConfigSaveResult>();
            state.api.config.save.mockReturnValue(pending.promise);
            selectTab('general');
            const general = generalProps();
            general.onChange({ ...general.config, historySync: { enabled: true } });
            selectTab('httpServers');
            rowProps().onToggleEnabled(false);
            const target = state.api.config.save.mock.calls[0][1] as OneBotConfig;
            expect(target.historySync.enabled).toBe(true);
            expect(target.networks.httpServers[0].enabled).toBe(false);
            vi.advanceTimersByTime(500);
            expect(state.api.config.save).toHaveBeenCalledOnce();

            if (succeeds) {
                pending.resolve(response(target));
            } else {
                pending.reject(new Error('写入结果未知'));
            }

            await flush();
            selectTab('general');
            const retained = generalProps().config;
            expect(retained.historySync.enabled).toBe(true);
            expect(retained.networks.httpServers[0].enabled).toBe(succeeds ? false : undefined);
            const editor = find(
                page(),
                (item) => typeof item.type === 'function' && item.type.name === 'EditorBar',
            );
            expect(editor.props.dirty).toBe(!succeeds);

            if (!succeeds) {
                expect(editor.props.saveStatusTone).toBe('error');
                expect(editor.props.saveStatus).toContain('写入结果未知');
            }

            vi.advanceTimersByTime(10_000);
            expect(state.api.config.save).toHaveBeenCalledOnce();
        },
    );

    it('cancels a pending message-behavior debounce when account context changes', async () => {
        state.configTab = 'general';
        pageHost.unmount();
        pageHost = hookHost();
        page();
        await flush();
        const general = find(page(), (item) => item.type === GeneralSettingsTab);
        (general.props.onChange as (next: OneBotConfig) => void)({
            ...original,
            historySync: { enabled: true },
        });
        state.selectedUin = '20002';
        page();
        await flush();
        vi.advanceTimersByTime(1000);
        expect(state.api.config.save).not.toHaveBeenCalled();
    });
});
