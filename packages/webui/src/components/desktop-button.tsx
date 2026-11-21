import { Monitor } from 'lucide-react';
import { useAppState } from '@/contexts/AppStateContext';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';

/** Open the integrated desktop only when this server reports it is actually served. */
export function DesktopButton() {
    const t = useT();
    const { systemInfo } = useAppState();

    if (systemInfo?.deployment?.desktopAvailable !== true) {
        return null;
    }

    return (
        <Button size="sm" variant="outline" asChild>
            <a href="/desktop/" target="_blank" rel="noopener noreferrer">
                <Monitor className="size-3.5" /> {t('打开 QQ 桌面', 'Open QQ desktop')}
            </a>
        </Button>
    );
}
