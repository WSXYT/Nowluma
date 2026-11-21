import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SkeletonSwap } from '../src/components/interior/skeleton-swap';
import { LocaleProvider } from '../src/i18n';

describe('SkeletonSwap', () => {
    it('announces loaded content in the active locale', () => {
        const html = renderToStaticMarkup(
            <LocaleProvider fixed="en">
                <SkeletonSwap ready label="Content">
                    <div>Content is ready</div>
                </SkeletonSwap>
            </LocaleProvider>,
        );

        expect(html).toContain('Content loaded');
    });

    it('reserves the requested space without painting a skeleton immediately', () => {
        const html = renderToStaticMarkup(
            <SkeletonSwap ready={false} reserve={84} lines={4} label="测试内容">
                <div>尚未就绪</div>
            </SkeletonSwap>,
        );

        expect(html).toContain('aria-busy="true"');
        expect(html).toContain('height:84px');
        expect(html).toContain('尚未就绪');
        expect(html).not.toContain('aria-hidden="true"');
    });

    it('allows loaded content to grow beyond the reserved placeholder height', () => {
        const html = renderToStaticMarkup(
            <SkeletonSwap ready reserve={20}>
                <h3>完整的连接提示</h3>
                <p>窄屏下正文可以换行，不能被占位高度裁切。</p>
            </SkeletonSwap>,
        );
        const shellStyle = /style="([^"]*)"/.exec(html)?.[1] ?? '';

        expect(shellStyle).toContain('min-height:20px');
        expect(shellStyle).not.toMatch(/(?:^|;)height:20px(?:;|$)/);
        expect(html).toContain('完整的连接提示');
    });

    it('exposes ready content without a loading announcement', () => {
        const html = renderToStaticMarkup(
            <SkeletonSwap ready label="测试内容">
                <div>内容已加载</div>
            </SkeletonSwap>,
        );

        expect(html).toContain('aria-busy="false"');
        expect(html).toContain('内容已加载');
        expect(html).toContain('测试内容已加载');
    });
});
