import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTester } from '../src/components/debug/action-tester';
import { ConfirmDialog } from '../src/components/confirm-dialog';
import type * as I18n from '../src/i18n';
import type { DebugActionDoc, DebugStreamFrame, QQInfo } from '../src/types';
import { elements, hookHost, type HookHost } from './helpers/hook-host';

const api = vi.hoisted(() => ({ debug: { invokeStream: vi.fn(), invoke: vi.fn() } }));
const language = vi.hoisted(() => ({ value: 'en' as I18n.Language }));
const tasks = vi.hoisted(() => ({
    start: vi.fn(() => 'stream-1'),
    update: vi.fn(),
    finish: vi.fn(),
}));
const history = vi.hoisted(() => ({
    loadHistory: vi.fn(() => []),
    pushHistory: vi.fn(() => []),
    clearHistory: vi.fn(),
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/lib/api', () => ({ useApi: () => api }));
vi.mock('@/contexts/DebugTaskContext', () => ({ useDebugTasks: () => tasks }));
vi.mock('@/lib/debug-history', () => history);
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(language.value) };
});
const docs: DebugActionDoc[] = [
    {
        name: 'read_stream',
        summary: 'fixture stream',
        aliases: [],
        params: [],
        readOnly: true,
        stream: true,
    },
    {
        name: 'get_msg',
        summary: '原样显示的说明',
        aliases: [],
        params: [{ name: 'message_id', type: 'int32', required: true }],
        readOnly: true,
    },
];
const accounts = [{ uin: '10001', nickname: 'Fixture' }] as QQInfo[];
let host: HookHost;
let presetAction: { name: string; nonce: number } | undefined;
const onInvokingChange = vi.fn();
const render = () =>
    host.render(() => ActionTester({ accounts, docs, presetAction, onInvokingChange }));

const flush = async () => {
    for (let i = 0; i < 12; i++) {
        await Promise.resolve();
    }
};

function runButton(tree: ReactNode) {
    return elements(tree).find((item) => item.props['data-tutorial-control'] === 'debug-run')!;
}

function actionPicker(tree: ReactNode) {
    const control = elements(tree).find(
        (item) => item.props['data-tutorial-control'] === 'debug-action',
    );
    return elements(control?.props.children as ReactNode).find(
        (item) => typeof item.props.ariaLabel === 'string',
    )!;
}

beforeEach(() => {
    language.value = 'en';
    host = hookHost();
    presetAction = undefined;
    onInvokingChange.mockReset();
    api.debug.invokeStream.mockReset();
    api.debug.invoke.mockReset();
    tasks.start.mockClear();
    tasks.finish.mockClear();
    history.pushHistory.mockClear();
    render();
    (actionPicker(render()).props.onChange as (value: string) => void)('read_stream');
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

describe('ActionTester stream completion', () => {
    it('shows failure when the connection ends after a progress frame', async () => {
        api.debug.invokeStream.mockImplementation(
            async (_uin, _action, _params, frame: (value: DebugStreamFrame) => void) => {
                frame({ status: 'ok', retcode: 0, data: { type: 'progress', progress: 0.5 } });
            },
        );
        (runButton(render()).props.onClick as () => void)();
        await flush();
        const alert = elements(render()).find((item) => item.props.role === 'alert');
        expect(alert?.props.children).toBe('The stream ended without a completion response');
        expect(tasks.finish).toHaveBeenCalledExactlyOnceWith('stream-1', 'failed');
        expect(history.pushHistory).toHaveBeenCalledWith(
            expect.objectContaining({
                uin: '10001',
                action: 'read_stream',
                ok: false,
                stream: true,
            }),
        );
        expect(api.debug.invokeStream).toHaveBeenCalledOnce();
    });

    it('requires the successful terminal response before marking a stream done', async () => {
        api.debug.invokeStream.mockImplementation(
            async (_uin, _action, _params, frame: (value: DebugStreamFrame) => void) => {
                frame({ status: 'ok', retcode: 0, data: { type: 'response', value: 42 } });
            },
        );
        (runButton(render()).props.onClick as () => void)();
        await flush();
        expect(tasks.finish).toHaveBeenCalledExactlyOnceWith('stream-1', 'done');
        expect(
            elements(render()).some(
                (item) => item.props.children === 'The stream ended without a completion response',
            ),
        ).toBe(false);
        expect(history.pushHistory).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });

    it('keeps an in-flight invocation intact across reference prefill and repeat clicks', async () => {
        const pending = Promise.withResolvers<void>();
        api.debug.invokeStream.mockReturnValue(pending.promise);
        const run = runButton(render()).props.onClick as () => void;
        run();
        run();
        let tree = render();
        expect(api.debug.invokeStream).toHaveBeenCalledOnce();
        expect(runButton(tree).props.disabled).toBe(true);
        expect(onInvokingChange).toHaveBeenLastCalledWith(true);
        presetAction = { name: 'another_action', nonce: 1 };
        tree = render();
        expect(actionPicker(tree).props.value).toBe('read_stream');
        expect(
            elements(tree).find((item) => item.props.ariaLabel === 'Select account')?.props
                .disabled,
        ).toBe(true);
        language.value = 'zh';
        tree = render();
        expect(actionPicker(tree).props.ariaLabel).toBe('选择接口');
        expect(actionPicker(tree).props.value).toBe('read_stream');
        expect(runButton(tree).props['aria-label']).toBe('运行流式调用');
        expect(runButton(tree).props.disabled).toBe(true);
        expect(api.debug.invokeStream).toHaveBeenCalledOnce();
        pending.resolve();
        await flush();
        tree = render();
        expect(onInvokingChange).toHaveBeenLastCalledWith(false);
        expect(runButton(tree).props.disabled).toBe(false);
        expect(api.debug.invokeStream).toHaveBeenCalledOnce();
    });
});

it.each(['ok', 'failed'] as const)(
    'runs a chapter action through the English controls and preserves a %s response',
    async (status) => {
        (actionPicker(render()).props.onChange as (value: string) => void)('get_msg');
        const fixture =
            status === 'ok'
                ? { status, retcode: 0, data: { message_id: 101, message: '#nl' } }
                : { status, retcode: 1404, wording: '服务端错误：消息不存在', data: null };
        api.debug.invoke.mockResolvedValue(fixture);

        const tree = render();
        expect(actionPicker(tree).props.placeholder).toBe('Select action');
        expect(
            elements(tree).some(
                (element) =>
                    Array.isArray(element.props.children) &&
                    element.props.children.includes('原样显示的说明'),
            ),
        ).toBe(true);
        const param = elements(tree).find(
            (item) => (item.props.param as { name?: string } | undefined)?.name === 'message_id',
        );
        expect(param).toBeDefined();
        (param?.props.onChange as (value: string) => void)('101');

        const run = runButton(render());
        expect(run.props['aria-label']).toBe('Run action');
        (run.props.onClick as () => void)();
        await flush();
        expect(api.debug.invoke).toHaveBeenCalledExactlyOnceWith('10001', 'get_msg', {
            message_id: 101,
        });
        expect(history.pushHistory).toHaveBeenCalledWith(
            expect.objectContaining({ ok: status === 'ok' }),
        );
        const resultNodes = elements(render());
        expect(resultNodes.some((element) => element.props.data === fixture)).toBe(true);
        const resultLabel = status === 'ok' ? 'Action completed' : 'Action failed';
        expect(
            resultNodes.some(
                (element) =>
                    Array.isArray(element.props.children) &&
                    element.props.children.includes(resultLabel) &&
                    (status === 'ok' || element.props.children.includes(` · ${fixture.wording}`)),
            ),
        ).toBe(true);
    },
);

it('warns in English and requires confirmation before a destructive write', () => {
    (actionPicker(render()).props.onChange as (value: string) => void)('delete_msg');
    const tree = render();
    expect(
        elements(tree).some(
            (element) =>
                element.props.children === 'Write actions affect the selected account directly.',
        ),
    ).toBe(true);
    (runButton(tree).props.onClick as () => void)();
    expect(api.debug.invoke).not.toHaveBeenCalled();
    const confirmation = elements(render()).find(
        (element) => element.type === ConfirmDialog && element.props.open,
    );
    expect(confirmation?.props.title).toBe('Confirm destructive action');
    expect(confirmation?.props.confirmText).toBe('Confirm action');
    expect(
        elements(confirmation?.props.description as ReactNode).some(
            (element) => element.props.children === 'delete_msg',
        ),
    ).toBe(true);
});
