import type { ComponentProps, ReactNode } from 'react';
import type * as ReactModule from 'react';
import type * as MotionModule from 'motion/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageComposer } from '../src/components/debug/message-composer';
import { MessageBuilder } from '../src/components/debug/message-builder';
import type * as I18n from '../src/i18n';
import type { Seg } from '../src/components/debug/message-builder';
import { Dropdown } from '../src/components/interior/dropdown';
import type { DebugInvokeResult, QQInfo } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';

const api = vi.hoisted(() => ({ debug: { invoke: vi.fn() } }));
vi.mock('react', async (original) => ({ ...(await original<typeof ReactModule>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof MotionModule>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/lib/api', () => ({ useApi: () => api }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator('en') };
});

const accounts = [
    { uin: '10001', nickname: 'Account A' },
    { uin: '20002', nickname: 'Account B' },
] as QQInfo[];
const draft: Seg[] = [{ _id: 'fixture-text', k: 'text', text: 'retained draft' }];
const success: DebugInvokeResult = { status: 'ok', retcode: 0, data: { message_id: 123 } };
let host: HookHost;
const render = () => host.render(() => MessageComposer({ accounts }));

function targetPicker(tree: ReactNode) {
    return elements(tree).find(
        (item) => typeof item.type === 'function' && item.type.name === 'TargetPicker',
    )!;
}

function accountPicker(tree: ReactNode) {
    return elements(tree).find((item) => item.type === Dropdown)!.props as ComponentProps<
        typeof Dropdown
    >;
}

function builder(tree: ReactNode) {
    return elements(tree).find((item) => item.type === MessageBuilder)!.props as ComponentProps<
        typeof MessageBuilder
    >;
}

function sendButton(tree: ReactNode) {
    return elements(tree).find((item) => item.props['aria-label'] === 'Send message')!;
}

async function flush() {
    for (let index = 0; index < 12; index++) {
        await Promise.resolve();
    }
}

beforeEach(() => {
    host = hookHost();
    api.debug.invoke.mockReset().mockResolvedValue(success);
    render();
    builder(render()).onChange(draft);
    (targetPicker(render()).props.onChange as (value: string) => void)('424242');
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

describe('MessageComposer account-bound sends', () => {
    it('retains the message draft but requires a new recipient after changing account', async () => {
        accountPicker(render()).onChange!('20002');
        let tree = render();
        expect(targetPicker(tree).props.uin).toBe('20002');
        expect(targetPicker(tree).props.value).toBe('');
        expect(builder(tree).segments).toEqual(draft);
        await (sendButton(tree).props.onClick as () => Promise<void>)();
        expect(api.debug.invoke).not.toHaveBeenCalled();
        (targetPicker(render()).props.onChange as (value: string) => void)('737373');
        tree = render();
        await (sendButton(tree).props.onClick as () => Promise<void>)();
        expect(api.debug.invoke).toHaveBeenCalledExactlyOnceWith('20002', 'send_group_msg', {
            group_id: '737373',
            message: [{ type: 'text', data: { text: 'retained draft' } }],
        });
        expect(builder(render()).segments).toEqual(draft);
    });

    it('locks the send context until settlement and keeps failed drafts without retrying', async () => {
        const pending = Promise.withResolvers<DebugInvokeResult>();
        api.debug.invoke.mockReturnValue(pending.promise);
        const tree = render();
        const changeAccount = accountPicker(tree).onChange!;
        const send = sendButton(tree).props.onClick as () => Promise<void>;
        const sending = send();
        await send();
        changeAccount('20002');
        const busy = render();
        expect(api.debug.invoke).toHaveBeenCalledOnce();
        expect(accountPicker(busy).value).toBe('10001');
        expect(accountPicker(busy).disabled).toBe(true);
        expect(targetPicker(busy).props.disabled).toBe(true);
        expect(sendButton(busy).props.disabled).toBe(true);
        expect(
            elements(busy)
                .filter((item) => item.type === 'fieldset')
                .every((item) => item.props.disabled === true),
        ).toBe(true);
        pending.reject(new Error('连接中断，发送结果未知'));
        await sending;
        await flush();
        const failed = render();
        expect(elements(failed).find((item) => item.props.role === 'alert')?.props.children).toBe(
            '连接中断，发送结果未知',
        );
        expect(builder(failed).segments).toEqual(draft);
        expect(targetPicker(failed).props.value).toBe('424242');
        expect(sendButton(failed).props.disabled).toBe(false);
        expect(api.debug.invoke).toHaveBeenCalledOnce();
    });
});
