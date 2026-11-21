import { defaultTranslate, useT, type Translate } from '@/i18n';

export const DEVELOPER_CRASH_MESSAGE = '开发者工具主动触发的 WebUI 崩溃测试';

/** Throws the deliberate render-time exception used to exercise ErrorPage. */
export function raiseDeveloperCrash(t: Translate = defaultTranslate): never {
    throw new Error(t(DEVELOPER_CRASH_MESSAGE, 'WebUI crash test triggered by developer tools'));
}

export function developerCrashReducer(_requested: boolean, action: 'confirm'): boolean {
    if (action === 'confirm') {
        return true;
    }

    throw new Error(`Unknown developer crash action: ${String(action)}`);
}

export function DeveloperCrashProbe({ requested }: { requested: boolean }): null {
    const t = useT();

    if (requested) {
        raiseDeveloperCrash(t);
    }

    return null;
}
