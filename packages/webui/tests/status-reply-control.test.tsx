import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GeneralSettingsTab } from '../src/components/config/general-settings-tab';
import { LocaleProvider, type Language } from '../src/i18n';
import { normalizeOneBotConfig } from '../src/lib/onebot-config';

vi.mock('@/components/config/notification-opt-in', () => ({ NotificationOptIn: () => null }));

describe('status reply control', () => {
    it.each([
        ['zh', '启用 #nl 状态命令', '关闭后完全不响应'],
        ['en', 'Enable #nl status command', 'When disabled, no reply is sent.'],
    ] as const)(
        'renders the #nl switch with an explicit disabled state (%s)',
        (language: Language, label, hint) => {
            const config = normalizeOneBotConfig({
                statusCommand: { enabled: false, trigger: '#nl' },
            });
            const html = renderToStaticMarkup(
                <LocaleProvider fixed={language}>
                    <GeneralSettingsTab config={config} onChange={() => {}} />
                </LocaleProvider>,
            );
            expect(html).toContain(label);
            expect(html).toContain('aria-checked="false"');
            expect(html).toContain(hint);
        },
    );
});
