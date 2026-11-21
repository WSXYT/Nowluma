import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactModule from 'react';
import type * as I18nModule from '../src/i18n';
import { DeliveriesWidget } from '../src/components/overview/deliveries-widget';
import type { NotificationDeliveryRecord } from '../src/types';
import { elements, hookHost } from './helpers/hook-host';
import type { HookHost } from './helpers/hook-host';

const state = vi.hoisted(() => ({
    language: 'zh' as 'zh' | 'en',
    poll: null as (() => Promise<unknown>) | null,
    stop: vi.fn(),
    start: vi.fn(),
    api: { notifications: { recent: vi.fn() } },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof ReactModule>()) }));
vi.mock('@/i18n', async (original) => {
    const actual = await original<typeof I18nModule>();
    return { ...actual, useT: () => actual.translator(state.language) };
});
vi.mock('@/lib/api', () => ({ useApi: () => state.api }));
vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({ formatClock: (time: number) => String(time) }),
}));
vi.mock('@/lib/polling', () => ({
    startPolling: (poll: () => Promise<unknown>, interval: number) => {
        state.poll = poll;
        state.start(interval);
        return state.stop;
    },
}));

const records: NotificationDeliveryRecord[] = [
    {
        time: 1000,
        uin: '10001',
        event: 'online',
        channelId: '用户通道',
        ok: false,
        error: '原始错误 (E_DELIVERY)',
    },
];
let host: HookHost;
beforeEach(() => {
    state.language = 'zh';
    state.poll = null;
    state.stop.mockReset();
    state.start.mockReset();
    state.api.notifications.recent.mockReset().mockResolvedValue(records);
    host = hookHost();
    host.render(DeliveriesWidget);
});
afterEach(() => {
    host.unmount();
    vi.restoreAllMocks();
});

describe('DeliveriesWidget localization', () => {
    it('switches existing delivery labels without restarting polling or changing record data', async () => {
        await state.poll!();
        let nodes = elements(host.render(DeliveriesWidget));
        expect(
            nodes.some(
                ({ type, props }) =>
                    type === 'h4' &&
                    Array.isArray(props.children) &&
                    props.children.includes('通知投递'),
            ),
        ).toBe(true);
        expect(nodes.some((item) => item.props.children === '上线')).toBe(true);
        state.language = 'en';
        nodes = elements(host.render(DeliveriesWidget));
        expect(
            nodes.some(
                ({ type, props }) =>
                    type === 'h4' &&
                    Array.isArray(props.children) &&
                    props.children.includes('Notification deliveries'),
            ),
        ).toBe(true);
        expect(nodes.some((item) => item.props.children === 'Online')).toBe(true);
        expect(nodes.some((item) => item.props.children === '10001')).toBe(true);
        expect(nodes.some((item) => item.props.title === '原始错误 (E_DELIVERY)')).toBe(true);
        expect(
            nodes.some(
                (item) =>
                    Array.isArray(item.props.children) && item.props.children.includes('用户通道'),
            ),
        ).toBe(true);
        expect(state.start).toHaveBeenCalledExactlyOnceWith(15_000);
        expect(state.api.notifications.recent).toHaveBeenCalledExactlyOnceWith(50);
        expect(state.stop).not.toHaveBeenCalled();
    });

    it('localizes refresh failure context while retaining stale delivery records and raw errors', async () => {
        await state.poll!();
        state.api.notifications.recent.mockRejectedValueOnce(new Error('读取超时 (E_READ)'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await state.poll!();
        const zhAlert = elements(host.render(DeliveriesWidget)).find(
            (item) => item.props.role === 'alert',
        );
        expect(zhAlert?.props.children).toBe('读取超时 (E_READ)；当前显示上次成功读取的投递记录。');
        state.language = 'en';
        const nodes = elements(host.render(DeliveriesWidget));
        const enAlert = nodes.find((item) => item.props.role === 'alert');
        expect(enAlert?.props.children).toBe(
            'Failed to load recent deliveries: 读取超时 (E_READ) Showing the last successfully loaded deliveries.',
        );
        expect(
            nodes.filter((item) => item.props.className === 'workspace-delivery-row'),
        ).toHaveLength(1);
        expect(state.start).toHaveBeenCalledOnce();
        expect(state.stop).not.toHaveBeenCalled();
    });
});
