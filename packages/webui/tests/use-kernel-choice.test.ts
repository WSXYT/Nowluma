import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoKernelCatalog, demoProcess } from '../src/demo/fixtures';
import { useKernelChoice } from '../src/hooks/use-kernel-choice';
import { useHookProcessOps } from '../src/hooks/use-hook-process-ops';
import type * as I18n from '../src/i18n';
import type { HookProcessInfo } from '../src/types';
import type { KernelChoiceInput, KernelSelection } from '../src/lib/api/types';
import { hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    api: {
        processes: { list: vi.fn(), load: vi.fn(), refresh: vi.fn(), unload: vi.fn() },
        kernel: { catalog: vi.fn(), get: vi.fn(), save: vi.fn() },
    },
    runAction: vi.fn(async (_options: unknown, action: () => Promise<unknown>) => action()),
    onAfterOp: vi.fn(),
    language: 'zh' as I18n.Language,
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useApi: () => mocks.api,
}));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: mocks.runAction }),
}));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(mocks.language) };
});

const catalog = demoKernelCatalog();
const input: KernelChoiceInput = {
    kernel: 'compat',
    riskAccepted: true,
    riskVersion: catalog.riskVersion,
};
const saved: KernelSelection = { ...input, acceptedAt: '2026-11-15T12:00:00.000Z' };
let process: HookProcessInfo;
let selections: Map<string, KernelSelection>;
let choiceHost: ReturnType<typeof hookHost>;
let opsHost: ReturnType<typeof hookHost>;
const choice = () => choiceHost.render(() => useKernelChoice());

const operations = () => {
    const { beforeAttach } = choice();
    return opsHost.render(() => useHookProcessOps({ beforeAttach, onAfterOp: mocks.onAfterOp }));
};

const pendingChoice = async () => {
    await vi.waitFor(() => expect(choice().pending).not.toBeNull());
    return choice().pending!;
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.language = 'zh';
    mocks.runAction.mockImplementation(async (_options, action) => action());
    choiceHost = hookHost();
    opsHost = hookHost();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    process = { ...demoProcess(), account: { uin: '10001', nickname: 'account A' } };
    selections = new Map();
    mocks.api.processes.list.mockImplementation(async () => [process]);
    mocks.api.kernel.catalog.mockResolvedValue(catalog);
    mocks.api.kernel.get.mockImplementation(async (uin: string) => ({
        selection: selections.get(uin) ?? null,
        options: catalog.options,
        canLoad: selections.has(uin),
    }));
    mocks.api.kernel.save.mockImplementation(async (uin: string, value: KernelChoiceInput) => {
        const selection = { ...value, acceptedAt: saved.acceptedAt };
        selections.set(uin, selection);
        return { success: true, selection, canLoad: true };
    });

    for (const kind of ['load', 'refresh', 'unload'] as const) {
        mocks.api.processes[kind].mockImplementation(async () => ({
            success: true,
            process: {
                ...process,
                status: kind === 'unload' ? 'available' : 'injected',
                error: '',
            },
        }));
    }
});
afterEach(() => {
    opsHost.unmount();
    choiceHost.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('useKernelChoice through the shared useHookProcessOps load/refresh owner', () => {
    it.each([undefined, { uin: '', nickname: '' }, { uin: 'PID:4242', nickname: '' }])(
        'requires a fresh real account and never asks or attaches for %j',
        async (account) => {
            process.account = account;
            await operations().ops.load(process.pid);
            expect(mocks.api.processes.list).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();
            expect(mocks.api.kernel.get).not.toHaveBeenCalled();
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            expect(operations().ops.banner).toContain('尚未识别当前 QQ 账号');
        },
    );

    it('cancel keeps zero POST/load/refresh effects and inflight dedupe includes the dialog wait', async () => {
        const ops = operations().ops;
        const loading = ops.load(process.pid);
        const pending = await pendingChoice();
        expect(operations().ops.statusOf(process.pid)).toBe('load');
        await ops.load(process.pid);
        await ops.refresh(process.pid);
        expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1);
        pending.cancel();
        await loading;
        expect(choice().pending).toBeNull();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.processes.refresh).not.toHaveBeenCalled();
        expect(mocks.runAction).not.toHaveBeenCalled();
        expect(operations().ops.statusOf(process.pid)).toBeNull();
    });

    it.each(['load', 'refresh'] as const)(
        'saves account A once, rechecks identity and performs explicit %s once',
        async (kind) => {
            const work = operations().ops[kind](process.pid);
            const pending = await pendingChoice();
            await Promise.all([pending.confirm(input), pending.confirm(input)]);
            await work;
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
            expect(mocks.api.kernel.save).toHaveBeenCalledWith(
                '10001',
                input,
                expect.any(AbortSignal),
            );
            expect(mocks.api.processes[kind]).toHaveBeenCalledTimes(1);
            expect(mocks.api.processes.list).toHaveBeenCalledTimes(3);
            expect(mocks.onAfterOp).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();

            process = { ...process, account: { uin: '20002', nickname: 'account B' } };
            const second = operations().ops.load(process.pid);
            expect((await pendingChoice()).target.uin).toBe('20002');
            choice().pending!.cancel();
            await second;
            expect(selections.has('20002')).toBe(false);
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        },
    );

    it('uses a saved account choice without asking again, but still re-reads the PID identity', async () => {
        selections.set('10001', saved);
        await operations().ops.load(process.pid);
        expect(mocks.api.processes.list).toHaveBeenCalledTimes(2);
        expect(mocks.api.kernel.catalog).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).toHaveBeenCalledTimes(1);
    });

    it.each([
        new Error('策略存储失败'),
        { success: false, message: '未保存' },
        { success: true, canLoad: true, selection: { ...saved, riskVersion: 'old' } },
    ])('failed or unknown save remains an error and never operates (%j)', async (failure) => {
        if (failure instanceof Error) {
            mocks.api.kernel.save.mockRejectedValueOnce(failure);
        } else {
            mocks.api.kernel.save.mockResolvedValueOnce(failure);
        }

        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        await expect(pending.confirm(input)).rejects.toThrow();
        expect(choice().pending).toBe(pending);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.onAfterOp).not.toHaveBeenCalled();
        pending.cancel();
        await work;
    });

    it('a late saved-policy response cannot authorize a different account now using the PID', async () => {
        let finishPolicy!: (value: unknown) => void;
        mocks.api.kernel.get.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishPolicy = resolve;
                }),
        );
        const work = operations().ops.load(process.pid);
        await vi.waitFor(() => expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1));
        process = { ...process, account: { uin: '20002', nickname: 'B' } };
        finishPolicy({ selection: saved, options: catalog.options, canLoad: true });
        await work;
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(operations().ops.banner).toContain('账号或进程已变化');
    });

    it('a backend autoload-policy error leads to the same explicit account choice on load', async () => {
        process = { ...process, status: 'error', error: '请为此 QQ 账号选择接入内核' };
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        expect(pending.target.uin).toBe('10001');
        await pending.confirm(input);
        await work;
        expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        expect(mocks.api.processes.load).toHaveBeenCalledTimes(1);
    });

    it('rejects an inactive acknowledgment and disabled rewrite before saving', async () => {
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();

        for (const invalid of [
            { ...input, riskAccepted: false },
            { ...input, kernel: 'rewrite' as const },
            { ...input, riskVersion: 'old' },
        ]) {
            await expect(pending.confirm(invalid)).rejects.toThrow('请主动确认');
        }

        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        pending.cancel();
        await work;
    });

    it.each(['account', 'path'] as const)(
        'blocks a changed %s before saving, without borrowing the old acknowledgment',
        async (field) => {
            const work = operations().ops.load(process.pid);
            const pending = await pendingChoice();

            if (field === 'account') {
                process = { ...process, account: { uin: '20002', nickname: 'B' } };
            } else {
                process = { ...process, path: '/different/QQ' };
            }

            await expect(pending.confirm(input)).rejects.toThrow('账号或进程已变化');
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            pending.cancel();
            await work;
        },
    );

    it('a switch during a late save authorizes only A, never B or the recycled PID', async () => {
        let finishSave!: (result: unknown) => void;
        mocks.api.kernel.save.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSave = resolve;
                }),
        );
        const work = operations().ops.load(process.pid);
        const pending = await pendingChoice();
        const confirming = pending.confirm(input);
        await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
        selections.set('10001', saved);
        process = { ...process, account: { uin: '20002', nickname: 'B' } };
        finishSave({ success: true, selection: saved, canLoad: true });
        await confirming;
        await work;
        expect(mocks.api.kernel.save.mock.calls[0][0]).toBe('10001');
        expect(selections.has('20002')).toBe(false);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(operations().ops.banner).toContain('账号或进程已变化');
    });

    it.each(['logout', 'unmount'] as const)(
        '%s resolves a pending modal and ignores its late confirmation',
        async (reason) => {
            const controller = operations();
            const work = controller.ops.load(process.pid);
            const pending = await pendingChoice();

            if (reason === 'logout') {
                controller.cancelPending();
            } else {
                opsHost.unmount();
                choiceHost.unmount();
            }

            await work;
            await pending.confirm(input);
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
        },
    );

    it('logout aborts a save already in flight and its late response cannot inject', async () => {
        let finishSave!: (result: unknown) => void;
        mocks.api.kernel.save.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishSave = resolve;
                }),
        );
        const controller = operations();
        const work = controller.ops.load(process.pid);
        const pending = await pendingChoice();
        const confirming = pending.confirm(input);
        await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
        const signal = mocks.api.kernel.save.mock.calls[0][2] as AbortSignal;
        controller.cancelPending();
        expect(signal.aborted).toBe(true);
        await work;
        finishSave({ success: true, selection: saved, canLoad: true });
        await expect(confirming).rejects.toMatchObject({ name: 'AbortError' });
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
    });

    it.each(['load', 'refresh'] as const)(
        'unload cancels a pending %s choice and its late confirmation without releasing the replacement run',
        async (kind) => {
            let finishUnload!: (result: unknown) => void;
            mocks.api.processes.unload.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishUnload = resolve;
                    }),
            );
            const ops = operations().ops;
            const work = ops[kind](process.pid);
            const pending = await pendingChoice();
            expect(operations().ops.canCancelAttach?.(process.pid)).toBe(true);
            const unloading = ops.unload(process.pid);
            await vi.waitFor(() => expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1));
            await work;
            expect(choice().pending).toBeNull();
            expect(operations().ops.statusOf(process.pid)).toBe('unload');
            expect(operations().ops.canCancelAttach?.(process.pid)).toBe(false);
            await pending.confirm(input);
            await ops.unload(process.pid);
            await ops.load(process.pid);
            await ops.refresh(process.pid);
            expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            expect(mocks.api.processes.refresh).not.toHaveBeenCalled();
            expect(mocks.runAction).toHaveBeenCalledTimes(1);
            expect(mocks.runAction.mock.calls[0][0]).toMatchObject({
                title: '正在从进程 4242 卸载…',
            });
            finishUnload({ success: true, process: { ...process, status: 'available' } });
            await unloading;
            expect(operations().ops.statusOf(process.pid)).toBeNull();
            expect(mocks.onAfterOp).toHaveBeenCalledTimes(1);
        },
    );

    it('unload settles a canceled policy read before its abort-ignoring response arrives', async () => {
        let finishPolicy!: (result: unknown) => void;
        mocks.api.kernel.get.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishPolicy = resolve;
                }),
        );
        const ops = operations().ops;
        const finished = vi.fn();
        const work = ops.load(process.pid).then(finished);
        await vi.waitFor(() => expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1));
        await ops.unload(process.pid);
        await vi.waitFor(() => expect(finished).toHaveBeenCalledTimes(1));
        process = { ...process, account: { uin: '20002', nickname: 'B' } };
        finishPolicy({ selection: saved, options: catalog.options, canLoad: true });
        await work;
        expect(choice().pending).toBeNull();
        expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.kernel.catalog).not.toHaveBeenCalled();
        expect(mocks.runAction).toHaveBeenCalledTimes(1);
    });

    it.each(['load', 'refresh'] as const)(
        'unload waits for an already dispatched policy POST, merges repeated intent, and never continues %s',
        async (kind) => {
            let finishSave!: (result: unknown) => void;
            mocks.api.kernel.save.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishSave = resolve;
                    }),
            );
            const ops = operations().ops;
            const work = ops[kind](process.pid);
            const pending = await pendingChoice();
            const confirming = pending.confirm(input);
            await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
            const signal = mocks.api.kernel.save.mock.calls[0][2] as AbortSignal;
            expect(operations().ops.canCancelAttach?.(process.pid)).toBe(false);
            const unloading = ops.unload(process.pid);
            const repeatedUnload = ops.unload(process.pid);
            expect(signal.aborted).toBe(false);
            expect(mocks.api.processes.unload).not.toHaveBeenCalled();
            expect(choice().pending).toBe(pending);
            selections.set('10001', saved);
            finishSave({ success: true, selection: saved, canLoad: true });
            await confirming;
            await Promise.all([work, unloading, repeatedUnload]);
            await pending.confirm(input);
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
            expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            expect(mocks.api.processes.refresh).not.toHaveBeenCalled();
            expect(selections.get('10001')).toBe(saved);
            expect(mocks.api.kernel.get).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();
            expect(operations().ops.statusOf(process.pid)).toBeNull();
            expect(mocks.runAction).toHaveBeenCalledTimes(2);
        },
    );

    it('a failed policy POST still settles queued unload without attaching or hiding its save error', async () => {
        let failSave!: (error: Error) => void;
        mocks.api.kernel.save.mockImplementationOnce(
            () =>
                new Promise((_resolve, reject) => {
                    failSave = reject;
                }),
        );
        const ops = operations().ops;
        const work = ops.load(process.pid);
        const pending = await pendingChoice();
        const confirming = pending.confirm(input);
        const failure = expect(confirming).rejects.toThrow('策略存储失败');
        await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
        const signal = mocks.api.kernel.save.mock.calls[0][2] as AbortSignal;
        const unloading = ops.unload(process.pid);
        expect(signal.aborted).toBe(false);
        failSave(new Error('策略存储失败'));
        await failure;
        await vi.waitFor(() => expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1));
        await Promise.all([work, unloading]);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        expect(choice().pending).toBeNull();
        expect(selections.has('10001')).toBe(false);
    });

    it("an unload for one pending PID does not cancel another PID's dispatched native mutation", async () => {
        const other = { ...process, pid: 4243, account: { uin: '20002', nickname: 'B' } };
        selections.set('20002', saved);
        mocks.api.processes.list.mockImplementation(async () => [process, other]);
        let finishOther!: (result: unknown) => void;
        mocks.api.processes.load.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishOther = resolve;
                }),
        );
        const ops = operations().ops;
        const first = ops.load(process.pid);
        const pending = await pendingChoice();
        const second = ops.load(other.pid);
        await vi.waitFor(() => expect(mocks.api.processes.load).toHaveBeenCalledTimes(1));
        const otherSignal = mocks.api.processes.load.mock.calls[0][1] as AbortSignal;
        await ops.unload(process.pid);
        await vi.waitFor(() => expect(choice().pending).toBeNull());
        await first;
        await pending.confirm(input);
        expect(otherSignal.aborted).toBe(false);
        expect(operations().ops.statusOf(other.pid)).toBe('load');
        expect(mocks.api.processes.load.mock.calls[0][0]).toBe(other.pid);
        expect(mocks.api.processes.unload.mock.calls[0][0]).toBe(process.pid);
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        finishOther({ success: true, process: { ...other, status: 'connecting' } });
        await second;
        expect(operations().ops.statusOf(other.pid)).toBeNull();
    });

    it('unload does not abort or duplicate a native mutation already dispatched for that PID', async () => {
        selections.set('10001', saved);
        let finishLoad!: (result: unknown) => void;
        mocks.api.processes.load.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishLoad = resolve;
                }),
        );
        const ops = operations().ops;
        const work = ops.load(process.pid);
        await vi.waitFor(() => expect(mocks.api.processes.load).toHaveBeenCalledTimes(1));
        const signal = mocks.api.processes.load.mock.calls[0][1] as AbortSignal;
        await ops.unload(process.pid);
        await ops.load(process.pid);
        expect(signal.aborted).toBe(false);
        expect(mocks.api.processes.unload).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).toHaveBeenCalledTimes(1);
        finishLoad({ success: true, process: { ...process, status: 'connecting' } });
        await work;
        await ops.unload(process.pid);
        expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);
    });

    it('unload cancels a confirmation still re-reading identity before any policy POST', async () => {
        let finishRead!: (result: HookProcessInfo[]) => void;
        const ops = operations().ops;
        const work = ops.load(process.pid);
        const pending = await pendingChoice();
        mocks.api.processes.list.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishRead = resolve;
                }),
        );
        const confirming = pending.confirm(input);
        const canceled = expect(confirming).rejects.toMatchObject({ name: 'AbortError' });
        await vi.waitFor(() => expect(mocks.api.processes.list).toHaveBeenCalledTimes(2));
        await ops.unload(process.pid);
        await work;
        expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(choice().pending).toBeNull();
        finishRead([process]);
        await canceled;
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.runAction).toHaveBeenCalledTimes(1);
    });

    it.each(['logout', 'unmount'] as const)(
        '%s clears queued unload intent during a dispatched policy write',
        async (reason) => {
            let finishSave!: (result: unknown) => void;
            mocks.api.kernel.save.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishSave = resolve;
                    }),
            );
            const controller = operations();
            const work = controller.ops.load(process.pid);
            const pending = await pendingChoice();
            const confirming = pending.confirm(input);
            const canceled = expect(confirming).rejects.toMatchObject({ name: 'AbortError' });
            await vi.waitFor(() => expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1));
            const unloading = controller.ops.unload(process.pid);

            if (reason === 'logout') {
                controller.cancelPending();
            } else {
                opsHost.unmount();
                choiceHost.unmount();
            }

            await Promise.all([work, unloading]);
            finishSave({ success: true, selection: saved, canLoad: true });
            await canceled;
            await pending.confirm(input);
            expect(mocks.api.processes.unload).not.toHaveBeenCalled();
            expect(mocks.api.processes.load).not.toHaveBeenCalled();
            expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
            expect(choice().pending).toBeNull();
        },
    );

    it('unload never asks and preserves the existing still-connected failure alert', async () => {
        mocks.api.processes.unload.mockResolvedValueOnce({
            success: true,
            process: { ...process, status: 'connecting', error: '管道仍存活' },
        });
        await operations().ops.unload(process.pid);
        expect(mocks.api.processes.list).not.toHaveBeenCalled();
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        expect(operations().unloadFailedAlert).toEqual({ pid: process.pid, error: '管道仍存活' });
        operations().dismissUnloadFailedAlert();
        expect(operations().unloadFailedAlert).toBeNull();
    });

    it('localizes a visible banner without aborting or repeating an in-flight process operation', async () => {
        const response = Promise.withResolvers<unknown>();
        mocks.api.processes.unload.mockReturnValueOnce(response.promise);
        const initial = operations().ops;
        const work = initial.unload(process.pid);
        const signal = mocks.api.processes.unload.mock.calls[0][1] as AbortSignal;
        expect(operations().ops.banner).toBe(`正在从进程 ${process.pid} 卸载…`);

        mocks.language = 'en';
        const translated = operations().ops;
        expect(translated.banner).toBe(`Unloading from process ${process.pid}…`);
        expect(translated.unload).toBe(initial.unload);
        expect(translated.statusOf(process.pid)).toBe('unload');
        expect(signal.aborted).toBe(false);
        expect(mocks.api.processes.unload).toHaveBeenCalledTimes(1);

        response.resolve({ success: true, process: { ...process, status: 'available' } });
        await work;
        expect(operations().ops.banner).toBe(`Unloaded from process ${process.pid}`);
        expect(mocks.onAfterOp).toHaveBeenCalledTimes(1);
    });

    it.each([
        { process: { pid: 4242, status: 'injected' } },
        { success: false, process: { pid: 4242, status: 'error', error: '操作失败' } },
    ])('does not report an unknown/failed operation as successful (%j)', async (outcome) => {
        selections.set('10001', saved);
        mocks.api.processes.load.mockResolvedValueOnce(outcome);
        await operations().ops.load(process.pid);
        expect(operations().ops.banner).toContain('加载失败');
        expect(mocks.onAfterOp).not.toHaveBeenCalled();
    });
});
