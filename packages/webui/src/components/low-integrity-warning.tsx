import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/interior/modal';
import { Button } from '@/components/ui/button';
import {
    LOW_INTEGRITY_PERMANENT_KEY,
    readLowIntegrityDismissed,
    saveLowIntegrityDismissed,
} from '@/lib/low-integrity-warning';
import { useT } from '@/i18n';

/** Mounted in the authenticated layout so polling and route changes cannot reopen it. */
export function LowIntegrityWarning({ lowIntegrity }: { lowIntegrity: boolean }) {
    const [dismissed, setDismissed] = useState(readLowIntegrityDismissed);
    const [error, setError] = useState<string | null>(null);
    const temporaryButton = useRef<HTMLButtonElement>(null);
    const t = useT();

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (event.key === LOW_INTEGRITY_PERMANENT_KEY && event.newValue === '1') {
                setDismissed(true);
            }
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const dismiss = (scope: 'session' | 'permanent') => {
        try {
            saveLowIntegrityDismissed(scope);
        } catch (caught) {
            console.warn('failed to save low integrity warning preference', caught);

            if (scope === 'permanent') {
                setError(
                    t(
                        '无法保存设置，请允许浏览器存储或选择临时关闭。',
                        'Could not save the preference. Allow browser storage, or dismiss it temporarily.',
                    ),
                );
                return;
            }
            // Even with storage blocked, temporary dismissal must let the user continue.
        }

        setError(null);
        setDismissed(true);
    };

    return (
        <Modal
            open={lowIntegrity && !dismissed}
            onClose={() => dismiss('session')}
            title={
                <span className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-warning" />
                    {t('Node 完整性过低', 'Node integrity is too low')}
                </span>
            }
            showClose={false}
            closeOnBackdrop={false}
            initialFocusRef={temporaryButton}
            maxWidth={480}
            footer={
                <>
                    <Button type="button" variant="outline" onClick={() => dismiss('permanent')}>
                        {t('永久关闭', 'Turn off permanently')}
                    </Button>
                    <Button ref={temporaryButton} type="button" onClick={() => dismiss('session')}>
                        {t('临时关闭', 'Turn off for now')}
                    </Button>
                </>
            }
        >
            <div className="space-y-3">
                <p>
                    {t(
                        '当前进程可能无法连接 QQ。请检查启动程序的完整性标签，修正后重启。详情见启动日志。',
                        'The current process may be unable to connect to QQ. Check the launcher’s integrity signature, fix it, and restart. See the startup log for details.',
                    )}
                </p>
                <p className="text-xs text-muted-foreground">
                    {t(
                        '临时关闭仅对当前标签页会话有效；永久关闭保存在此浏览器。',
                        'Temporary dismissal only applies to this tab session; permanent dismissal is saved in this browser.',
                    )}
                </p>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    );
}
