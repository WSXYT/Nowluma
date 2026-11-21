import type { LogLevel } from '@/types';
import { defaultTranslate, type Translate } from '@/i18n';

export function traceConfirmationWarnings(t: Translate = defaultTranslate): string[] {
    return [
        t('TRACE 会产生非常大量的数据。', 'TRACE produces a very large volume of data.'),
        t(
            'TRACE 可能包含未经脱敏的隐私数据和凭据。',
            'TRACE may contain unredacted private data and credentials.',
        ),
        t('TRACE 不适合长时间开启。', 'Do not leave TRACE enabled for long periods.'),
        t(
            'TRACE 仅用于小规模问题复现和 bug 反馈。',
            'Use TRACE only for brief reproductions and bug reports.',
        ),
    ];
}

interface SelectServerLogLevelOptions {
    currentLevel: LogLevel | null;
    nextLevel: LogLevel;
    applyLevel: (level: LogLevel) => void;
    requestTraceConfirmation: () => void;
}

export function selectServerLogLevel({
    currentLevel,
    nextLevel,
    applyLevel,
    requestTraceConfirmation,
}: SelectServerLogLevelOptions): void {
    if (currentLevel === null || currentLevel === nextLevel) {
        return;
    }

    if (currentLevel !== 'trace' && nextLevel === 'trace') {
        requestTraceConfirmation();
        return;
    }

    applyLevel(nextLevel);
}
