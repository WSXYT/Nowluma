import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { NodeEditDialog } from '../src/components/config/node-edit-dialog';
import { Button } from '../src/components/ui/button';
import type * as I18n from '../src/i18n';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';
import { elements, hookHost } from './helpers/hook-host';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('motion/react', async (original) => ({
    ...(await original<typeof import('motion/react')>()),
    useReducedMotionConfig: () => true,
}));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.translator('en') };
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('awaits an adapter write and keeps the draft and error visible when it fails', async () => {
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });
    const host = hookHost();
    const pending = Promise.withResolvers<void>();
    const onSubmit = vi.fn(() => pending.promise);
    const onOpenChange = vi.fn();
    const initial = normalizeOneBotConfig({
        networks: { httpServers: [{ name: 'server-a', host: '127.0.0.1', port: 3000 }] },
    }).networks.httpServers[0];
    const props: ComponentProps<typeof NodeEditDialog<'httpServers'>> = {
        open: true,
        kind: 'httpServers',
        initial,
        isEdit: true,
        uin: '10001',
        otherNames: [],
        onSubmit,
        onOpenChange,
    };
    const render = () => host.render(() => NodeEditDialog(props));
    expect(
        (render().props.title as ReactElement<{ children: ReactNode }>).props.children,
    ).toContain('Edit HTTP API');
    expect(render().props.closeLabel).toBe('Close connection editor');
    const nameField = (dialog: ReactNode) =>
        elements(dialog).find((item) => item.props.label === 'Name')!;
    (nameField(render()).props.onChange as (value: string) => void)('server-draft');
    const saveButton = (dialog: ReactElement<{ footer: ReactNode }>) =>
        elements(dialog.props.footer).find(
            (item) => item.type === Button && item.props.variant !== 'outline',
        )!;
    const writing = (saveButton(render()).props.onClick as () => Promise<void>)();
    const busy = render();
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ ...initial, name: 'server-draft' });
    expect(saveButton(busy).props.disabled).toBe(true);
    expect(busy.props.closeOnBackdrop).toBe(false);
    expect(busy.props.closeOnEscape).toBe(false);
    expect(elements(busy).find((item) => item.type === 'fieldset')?.props.disabled).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
    pending.reject(new Error('连接中断，写入结果未知'));
    await writing;
    const failed = render();
    expect(elements(failed).find((item) => item.props.role === 'alert')?.props.children).toBe(
        '连接中断，写入结果未知',
    );
    expect(saveButton(failed).props.disabled).toBe(false);
    expect(elements(failed).find((item) => item.type === 'fieldset')?.props.disabled).toBe(false);
    expect(failed.props.open).toBe(true);
    expect(nameField(failed).props.value).toBe('server-draft');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledOnce();
    host.unmount();
});
