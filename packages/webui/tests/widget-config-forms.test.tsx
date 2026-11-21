import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, type Language } from '../src/i18n';
import {
    AccountConfigForm,
    AlertsConfigForm,
    ConnectionsConfigForm,
    HostConfigForm,
    LinkConfigForm,
    NoteConfigForm,
    SessionsConfigForm,
} from '../src/components/pages/widget-config-forms';

vi.mock('@/contexts/AppStateContext', () => ({
    useAppState: () => ({ qqList: [{ uin: '10001', nickname: '用户昵称' }] }),
}));

function renderForms(language: Language) {
    const onChange = vi.fn();
    return renderToStaticMarkup(
        <LocaleProvider fixed={language}>
            <AlertsConfigForm config={{ count: 7, levels: ['error'] }} onChange={onChange} />
            <SessionsConfigForm config={{ filter: '用户昵称', sort: 'uin' }} onChange={onChange} />
            <HostConfigForm
                config={{ cpu: true, memory: false, runtime: false }}
                onChange={onChange}
            />
            <ConnectionsConfigForm
                config={{ sort: 'status', onlyIssues: true }}
                onChange={onChange}
            />
            <NoteConfigForm config={{ text: '用户备注' }} onChange={onChange} />
            <LinkConfigForm
                config={{ label: '用户文档', url: 'invalid', icon: 'book' }}
                onChange={onChange}
            />
            <AccountConfigForm config={{ uin: '10001' }} onChange={onChange} />
        </LocaleProvider>,
    );
}

describe('widget configuration localization', () => {
    it('keeps Chinese controls and configuration values intact', () => {
        const html = renderForms('zh');

        for (const label of [
            '显示条数',
            '显示级别',
            '排序',
            '内存使用',
            '仅显示异常端点',
            '图标',
            'QQ 号',
        ]) {
            expect(html).toContain(label);
        }

        expect(html).toContain('仅支持 http:// 或 https:// 链接');
        expect(html).toContain('aria-label="book"');
        expect(html).toContain('value="7"');
        expect(html).toContain('用户备注');
        expect(html).toContain('value="10001"');
    });

    it('renders English controls and validation without translating user text or saved values', () => {
        const html = renderForms('en');

        for (const label of [
            'Entries to show',
            'Visible levels',
            'Sort by',
            'QQ number',
            'CPU usage',
            'Show only endpoints with issues',
            'Note text (plain text, with line breaks)',
            'Only http:// or https:// links are supported',
        ]) {
            expect(html).toContain(label);
        }

        expect(html).toContain('aria-label="Book"');
        expect(html).toContain('value="7"');
        expect(html).toContain('用户备注');
        expect(html).toContain('用户文档');
        expect(html).toContain('用户昵称');
        expect(html).toContain('value="10001"');
        expect(html).toContain('value="invalid"');
    });
});
