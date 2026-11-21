import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as React from 'react';
import type * as I18n from '../src/i18n';
import { useFriends } from '../src/hooks/use-debug-contacts';
import { hookHost } from './helpers/hook-host';
import { translator } from '../src/i18n';
import { contactErrorMessage, createContactList } from '../src/lib/debug-contacts';
import type { DebugInvokeResult } from '../src/types';

const api = vi.hoisted(() => ({ debug: { invoke: vi.fn() } }));
const language = vi.hoisted(() => ({ value: 'zh' as I18n.Language }));
vi.mock('react', async (original) => ({
    ...(await original<typeof React>()),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
vi.mock('@/lib/api', () => ({ useApi: () => api }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(language.value) };
});

function deferred() {
    let resolve!: (result: DebugInvokeResult) => void;
    const promise = new Promise<DebugInvokeResult>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

const success = (nickname: string): DebugInvokeResult => ({
    status: 'ok',
    data: [{ user_id: 123, nickname }],
});

beforeEach(() => {
    language.value = 'zh';
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('debug contact lists', () => {
    it('retains an in-flight contact read and selection when language changes', async () => {
        const host = hookHost();
        const pending = Promise.withResolvers<DebugInvokeResult>();
        api.debug.invoke.mockReset().mockReturnValue(pending.promise);
        host.render(() => useFriends('language-account'));
        expect(api.debug.invoke).toHaveBeenCalledOnce();
        language.value = 'en';
        expect(host.render(() => useFriends('language-account')).loading).toBe(true);
        expect(api.debug.invoke).toHaveBeenCalledOnce();
        pending.resolve(success('原样昵称'));

        for (let index = 0; index < 6; index++) {
            await Promise.resolve();
        }

        const loaded = host.render(() => useFriends('language-account'));
        expect(loaded.loading).toBe(false);
        expect(loaded.items[0]).toMatchObject({ value: '123', label: '原样昵称' });
        expect(api.debug.invoke).toHaveBeenCalledOnce();
        api.debug.invoke.mockResolvedValue({ status: 'failed' });
        loaded.refresh();

        for (let index = 0; index < 6; index++) {
            await Promise.resolve();
        }

        expect(host.render(() => useFriends('language-account')).error).toBe(
            'Could not load contacts',
        );
        language.value = 'zh';
        expect(host.render(() => useFriends('language-account')).error).toBe('加载失败');
        expect(api.debug.invoke).toHaveBeenCalledTimes(2);
        host.unmount();
    });

    it('keeps account state separate and ignores a response after leaving its list', async () => {
        const previous = deferred();
        const invoke = vi
            .fn()
            .mockReturnValueOnce(previous.promise)
            .mockResolvedValue(success('current'));
        const oldList = createContactList(invoke, 'friends', 'old-account');
        const pending = oldList.refresh();
        oldList.invalidate();
        const current = createContactList(invoke, 'friends', 'new-account');
        await current.refresh();
        previous.resolve(success('stale'));
        await pending;
        expect(current.getSnapshot().items[0].label).toBe('current');
        expect(oldList.getSnapshot().items).toEqual([]);
        expect(createContactList(invoke, 'friends', 'old-account').getSnapshot().items).toEqual([]);
    });

    it('supersedes an in-flight refresh when using a fresh cached list', async () => {
        const pending = deferred();
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(success('cached'))
            .mockReturnValueOnce(pending.promise);
        const list = createContactList(invoke, 'friends', 'cache-account');
        await list.refresh();
        const refresh = list.refresh();
        await list.refresh(false);
        expect(list.getSnapshot().loading).toBe(false);
        pending.resolve(success('superseded'));
        await refresh;
        expect(list.getSnapshot().items[0].label).toBe('cached');
    });

    it('ignores an earlier refresh that completes after its replacement', async () => {
        const first = deferred();
        const invoke = vi
            .fn()
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce(success('latest'));
        const list = createContactList(invoke, 'friends', 'race-account');
        const pending = list.refresh();
        await list.refresh();
        first.resolve(success('old'));
        await pending;
        expect(list.getSnapshot().items[0].label).toBe('latest');
    });

    it('keeps group-member caches scoped to the account and group', async () => {
        const invoke = vi.fn().mockResolvedValue(success('member'));
        const first = createContactList(invoke, 'members', 'member-account', '111');
        await first.refresh();
        expect(invoke).toHaveBeenCalledWith('member-account', 'get_group_member_list', {
            group_id: '111',
        });
        expect(
            createContactList(invoke, 'members', 'member-account', '111').getSnapshot().items,
        ).toHaveLength(1);
        expect(
            createContactList(invoke, 'members', 'member-account', '222').getSnapshot().items,
        ).toEqual([]);
        expect(
            createContactList(invoke, 'members', 'other-account', '111').getSnapshot().items,
        ).toEqual([]);
    });

    it('reports malformed successful responses instead of caching an empty list', async () => {
        const invoke = vi
            .fn()
            .mockResolvedValueOnce(success('retained'))
            .mockResolvedValueOnce({ status: 'ok', data: {} });
        const list = createContactList(invoke, 'friends', 'invalid-account');
        await list.refresh();
        await list.refresh();
        expect(list.getSnapshot().loading).toBe(false);
        expect(contactErrorMessage(list.getSnapshot().error)).toBe('联系人列表格式无效');
        expect(list.getSnapshot().items[0].label).toBe('retained');
        await list.refresh(false);
        expect(list.getSnapshot().error).toBeNull();
        expect(invoke).toHaveBeenCalledTimes(2);
    });

    it('localizes contact validation but retains server wording', async () => {
        const wording = '联系人 ID 格式无效';
        const invoke = vi
            .fn()
            .mockResolvedValueOnce({ status: 'ok', data: [{ user_id: {} }] })
            .mockResolvedValueOnce({ status: 'failed', wording });
        const list = createContactList(invoke, 'friends', 'error-account');
        await list.refresh();
        expect(contactErrorMessage(list.getSnapshot().error, translator('en'))).toBe(
            'Invalid contact ID format',
        );
        await list.refresh();
        expect(contactErrorMessage(list.getSnapshot().error, translator('en'))).toBe(wording);
    });

    it('does not request contacts without an account or group selection', async () => {
        const invoke = vi.fn();
        const lists = [
            createContactList(invoke, 'friends', ''),
            createContactList(invoke, 'members', 'account'),
        ];

        for (const list of lists) {
            await list.refresh();
            expect(list.getSnapshot()).toEqual({ items: [], loading: false, error: null });
        }

        expect(invoke).not.toHaveBeenCalled();
    });
});
