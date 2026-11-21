import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOneBotInstanceConfig } from '../src/hooks/use-onebot-instance-config';
import type * as I18n from '../src/i18n';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';
import type { ConfigSaveResult } from '../src/lib/api/types';
import { hookHost } from './helpers/hook-host';

const api = vi.hoisted(() => ({ config: { get: vi.fn(), save: vi.fn() } }));
const language = vi.hoisted(() => ({ value: 'en' as I18n.Language }));
const onSelectedUinChange = vi.fn();
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/lib/api', () => ({ useApi: () => api }));
vi.mock('@/contexts/ActionFeedbackContext', () => ({
    useActionFeedback: () => ({ runAction: (_options: unknown, run: () => unknown) => run() }),
}));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator(language.value) };
});

const original = normalizeOneBotConfig({});
const edited = { ...original, historySync: { enabled: true } };
const saved = (config = edited, patch: Partial<ConfigSaveResult> = {}): ConfigSaveResult => ({
    config,
    saved: true,
    applied: true,
    online: true,
    errors: [],
    message: '',
    ...patch,
});
let host: ReturnType<typeof hookHost>;
let selectedUin: string;
const render = () =>
    host.render(() => useOneBotInstanceConfig([], { selectedUin, onSelectedUinChange }));

async function loaded() {
    render();
    await Promise.resolve();
    return render();
}

beforeEach(() => {
    language.value = 'en';
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
    host = hookHost();
    selectedUin = '10001';
    api.config.get.mockReset().mockResolvedValue(original);
    api.config.save.mockReset();
    onSelectedUinChange.mockClear();
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('useOneBotInstanceConfig persistence', () => {
    it('keeps an in-flight save and loaded draft when language changes', async () => {
        const config = await loaded();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        api.config.save.mockReturnValue(pending.promise);
        const writing = config.save(edited);
        language.value = 'zh';
        const switched = render();
        expect(switched.config).toBe(original);
        expect(switched.saveStatusTone).toBe('saving');
        expect(switched.saveStatus).toBe('保存中…');
        expect(api.config.get).toHaveBeenCalledOnce();
        expect(api.config.save).toHaveBeenCalledOnce();
        pending.resolve(saved());
        await writing;
        expect(render().config).toBe(edited);
        expect(render().saveStatus).toBe('已保存并应用');
        expect(api.config.get).toHaveBeenCalledOnce();
        expect(api.config.save).toHaveBeenCalledOnce();
    });

    it('rejects a refused write and keeps the original configuration and error', async () => {
        const config = await loaded();
        api.config.save.mockResolvedValue(saved(original, { saved: false, message: '磁盘已满' }));
        await expect(config.save(edited)).rejects.toThrow('磁盘已满');
        vi.advanceTimersByTime(10_000);
        const next = render();
        expect(next.config).toBe(original);
        expect(next.dirty).toBe(false);
        expect(next.saveStatusTone).toBe('error');
        expect(next.saveStatus).toContain('磁盘已满');
        expect(api.config.save).toHaveBeenCalledExactlyOnceWith('10001', edited);
    });

    it('retains the draft on an unknown network result without writing again', async () => {
        let config = await loaded();
        config.setConfig(edited);
        config = render();
        api.config.save.mockRejectedValue(new Error('连接中断，结果未知'));
        await expect(config.save()).rejects.toThrow('结果未知');
        vi.advanceTimersByTime(10_000);
        const next = render();
        expect(next.config).toBe(edited);
        expect(next.dirty).toBe(true);
        expect(next.saveStatus).toContain('结果未知');
        expect(api.config.save).toHaveBeenCalledOnce();
    });

    it('keeps a persisted configuration when runtime apply fails, including every error', async () => {
        const config = await loaded();
        const result = saved(edited, {
            applied: false,
            errors: [
                { name: 'http-a', phase: 'start', message: '端口占用', at: 1 },
                { name: 'ws-b', phase: 'stop', message: '关闭超时', at: 2 },
            ],
        });
        api.config.save.mockResolvedValue(result);
        await expect(config.save(edited)).resolves.toBe(result);
        vi.advanceTimersByTime(10_000);
        const next = render();
        expect(next.config).toBe(edited);
        expect(next.dirty).toBe(false);
        expect(next.saveStatusTone).toBe('warning');
        expect(next.saveStatus).toContain('http-a: 端口占用');
        expect(next.saveStatus).toContain('ws-b: 关闭超时');
        expect(api.config.save).toHaveBeenCalledOnce();
    });

    it('retains newer edits while recording the saved snapshot', async () => {
        const config = await loaded();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        api.config.save.mockReturnValue(pending.promise);
        const writing = config.save(edited);
        const newer = { ...edited, statusCommand: { ...edited.statusCommand, trigger: '#new' } };
        config.setConfig(newer);
        render();
        pending.resolve(saved());
        await writing;
        const next = render();
        expect(next.config).toBe(newer);
        expect(next.dirty).toBe(true);
        expect(next.saveStatus).toContain('New changes are unsaved');
    });

    it('does not let a late save overwrite a newly selected account', async () => {
        const config = await loaded();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        api.config.save.mockReturnValue(pending.promise);
        const writing = config.save(edited);
        selectedUin = '20002';
        await loaded();
        pending.resolve(saved());
        await writing;
        const next = render();
        expect(next.selectedUin).toBe('20002');
        expect(next.config).toBe(original);
        expect(next.saveStatus).toBe('');
        expect(api.config.save).toHaveBeenCalledExactlyOnceWith('10001', edited);
    });

    it('ignores an older save result after a newer generation completes', async () => {
        let config = await loaded();
        const pending = Promise.withResolvers<ConfigSaveResult>();
        api.config.save.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(saved());
        const older = config.save(original);
        config = render();
        await config.save(edited);
        pending.resolve(saved(original));
        await older;
        expect(render().config).toBe(edited);
    });

    it('parks a dirty account switch until the user confirms and permits cancellation', async () => {
        let config = await loaded();
        config.setConfig(edited);
        config = render();
        config.requestSwitchUin('20002');
        config = render();
        expect(config.pendingSwitchUin).toBe('20002');
        expect(onSelectedUinChange).not.toHaveBeenCalled();
        config.cancelSwitch();
        expect(render().pendingSwitchUin).toBeNull();
        render().requestSwitchUin('30003');
        render().confirmSwitch();
        expect(onSelectedUinChange).toHaveBeenCalledExactlyOnceWith('30003');
        expect(api.config.save).not.toHaveBeenCalled();
    });
});
