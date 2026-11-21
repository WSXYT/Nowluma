import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../src/components/pages/login-page';
import { LocaleProvider } from '../src/i18n';

vi.mock('@/contexts/ThemeContext', () => ({
    useTheme: () => ({
        appearance: {
            background: { type: 'none' },
            reduceMotion: true,
            disableMotion: true,
            palette: 'default',
        },
        mode: 'light',
        setMode: () => undefined,
    }),
    paletteResolved: () => false,
}));

describe('LoginPage 2FA step', () => {
    it('keeps the password form on its own screen', () => {
        const markup = renderToStaticMarkup(
            <LoginPage onLogin={async () => ({ success: false, error: 'no' })} />,
        );
        expect(markup).toContain('输入访问密码');
        expect(markup).toContain('打开工作台');
        expect(markup).toContain('max-w-md');
        expect(markup).not.toContain('max-w-2xl');
        expect(markup).not.toContain('第 1 位，共 6 位');
        expect(markup).not.toContain('验证并进入');
    });

    it('shows a separate TOTP screen after the password factor succeeds', () => {
        const markup = renderToStaticMarkup(
            <LoginPage
                initialPassword="Correct-Horse-1!"
                initialNeedsTotp
                onLogin={async () => ({ success: false, needsTotp: true })}
            />,
        );
        expect(markup).not.toContain('输入访问密码');
        expect(markup).toContain('输入 Authenticator 中的 6 位验证码');
        expect(markup).not.toContain('验证并进入');
        expect(markup).toContain('验证码，第 1 位，共 6 位');
        expect(markup).toContain('可以把完整验证码粘贴到任意一格。');
        expect(markup).toContain('使用恢复码');
        expect(markup).toContain('返回');
        expect(markup).toContain('max-w-md');
        expect(markup).not.toContain('max-w-2xl');
        expect(markup).not.toContain('h-[2px] w-3 rounded-full');
    });

    it('uses the same cell UI for a recovery code instead of a single field', () => {
        const markup = renderToStaticMarkup(
            <LoginPage
                initialPassword="Correct-Horse-1!"
                initialNeedsTotp
                initialUseRecovery
                onLogin={async () => ({ success: false, needsTotp: true })}
            />,
        );
        expect(markup).toContain('输入保存的一次性恢复码');
        expect(markup).toContain('恢复码，第 1 位，共 8 位');
        expect(markup).toContain('恢复码，第 8 位，共 8 位');
        expect(markup).toContain('可以把完整恢复码粘贴到任意一格');
        expect(markup).toContain('改用验证码');
        expect(markup).toContain('max-w-2xl');
        expect(markup).toContain('h-[2px] w-3 rounded-full');
        expect(markup).toContain('workspace-recovery-code');
        expect(markup).not.toContain('XXXX-XXXX');
        expect(markup).not.toContain('验证并进入');
        expect(markup).not.toContain('输入访问密码');
    });

    it('renders English recovery instructions and labels without changing its eight-cell input', () => {
        const markup = renderToStaticMarkup(
            <LocaleProvider initial="en">
                <LoginPage
                    initialNeedsTotp
                    initialUseRecovery
                    onLogin={async () => ({ success: false, needsTotp: true })}
                />
            </LocaleProvider>,
        );
        expect(markup).toContain('切换到简体中文');
        expect(markup).toContain('Enter one of your saved one-time recovery codes');
        expect(markup).toContain('Recovery code, character 1 of 8');
        expect(markup).toContain('Recovery code, character 8 of 8');
        expect(markup).toContain(
            'Paste the full recovery code into any cell. Hyphens are ignored.',
        );
        expect(markup).not.toContain('id="login-password"');
    });
});
