import { useReducer, useState } from 'react';
import { AlertTriangle, Bug, RotateCcw } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DeveloperCrashProbe, developerCrashReducer } from '@/components/settings/developer-tools';
import { Group, SettingRow } from '@/components/settings/settings-controls';
import { Button } from '@/components/ui/button';
import { useSession } from '@/contexts/SessionContext';
import { useT } from '@/i18n';

// ─────────────── 开发者 ───────────────

export function DeveloperPanel() {
    const t = useT();
    const { restartOnboarding } = useSession();
    const [confirmOnboarding, setConfirmOnboarding] = useState(false);
    const [confirmCrash, setConfirmCrash] = useState(false);
    const [crashRequested, requestCrash] = useReducer(developerCrashReducer, false);

    return (
        <div className="flex min-w-0 flex-col gap-7">
            {/* Event-handler errors bypass React boundaries; the probe throws on render. */}
            <DeveloperCrashProbe requested={crashRequested} />
            <Group title={t('交互演练', 'Interaction tests')} icon={Bug}>
                <SettingRow
                    label={t('首次使用引导', 'First-run setup')}
                    hint={t(
                        '演练完整引导，不保存协议确认、访问密码或外观设置。',
                        'Replay setup without saving agreement acceptance, the access password, or appearance settings.',
                    )}
                >
                    <Button variant="glass" size="sm" onClick={() => setConfirmOnboarding(true)}>
                        <RotateCcw className="size-4" /> {t('进入演练', 'Replay setup')}
                    </Button>
                </SettingRow>
                <SettingRow
                    label={t('崩溃界面', 'Crash screen')}
                    hint={t(
                        '展示页面异常界面；选择“重试”返回。',
                        'Show the page error screen. Select Retry to return.',
                    )}
                >
                    <Button variant="destructive" size="sm" onClick={() => setConfirmCrash(true)}>
                        <AlertTriangle className="size-4" /> {t('触发崩溃', 'Trigger crash')}
                    </Button>
                </SettingRow>
            </Group>

            <ConfirmDialog
                open={confirmOnboarding}
                onOpenChange={setConfirmOnboarding}
                title={t('重新进入首次使用引导？', 'Replay first-run setup?')}
                description={t(
                    '将以演练模式展示完整流程，不会修改协议确认记录、真实访问密码或外观设置。',
                    'The entire setup runs in rehearsal mode. It will not change your saved agreement acceptance, actual access password, or appearance settings.',
                )}
                confirmText={t('进入引导', 'Start setup')}
                onConfirm={restartOnboarding}
            />

            <ConfirmDialog
                open={confirmCrash}
                onOpenChange={setConfirmCrash}
                title={t('触发 WebUI 崩溃测试？', 'Trigger a WebUI crash test?')}
                description={t(
                    '当前设置页面将主动抛出测试异常，并交由崩溃界面接管。',
                    'This Settings page will throw a test error and show the crash screen.',
                )}
                confirmText={t('触发崩溃', 'Trigger crash')}
                destructive
                onConfirm={() => requestCrash('confirm')}
            />
        </div>
    );
}
