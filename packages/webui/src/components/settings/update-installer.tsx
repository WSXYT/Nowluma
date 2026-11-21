import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useActionFeedback } from '@/contexts/ActionFeedbackContext';
import { useT } from '@/i18n';
import { useApi } from '@/lib/api';
import type { UpdateStatus } from '@/types';

export function UpdateInstaller({ version }: { version: string | null }) {
    const t = useT();
    const tRef = useRef(t);

    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const api = useApi();
    const { startAction, runAction } = useActionFeedback();
    const [status, setStatus] = useState<UpdateStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmRestart, setConfirmRestart] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const phase = status?.phase;

    useEffect(() => {
        if (phase !== undefined && phase !== 'downloading') {
            return;
        }

        let disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        const activity =
            phase === 'downloading'
                ? startAction({ title: tRef.current('正在下载更新', 'Downloading update') })
                : null;

        const poll = async () => {
            try {
                const next = await api.update.status();

                if (disposed && !activity) {
                    return;
                }

                if (!disposed) {
                    setStatus(next);
                    setError(null);
                }

                if (next.phase === 'ready') {
                    activity?.succeed({
                        title: tRef.current('更新已就绪', 'Update ready'),
                        detail: tRef.current('重启后生效', 'Takes effect after restart'),
                    });
                } else if (next.phase === 'error') {
                    activity?.fail(next.message, {
                        title: tRef.current('更新失败', 'Update failed'),
                    });
                } else if (next.phase === 'downloading') {
                    timer = setTimeout(() => {
                        void poll();
                    }, 1000);
                }
            } catch (caught) {
                const message = caught instanceof Error ? caught.message : String(caught);
                activity?.fail(message, {
                    title: tRef.current('读取更新状态失败', 'Failed to read update status'),
                });

                if (!disposed) {
                    setError(message);
                    timer = setTimeout(() => {
                        void poll();
                    }, 5000);
                }
            }
        };

        void poll();

        return () => {
            disposed = true;

            if (!activity) {
                clearTimeout(timer);
            }
        };
    }, [api, phase, startAction]);

    const download = async () => {
        if (!version) {
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            setStatus(await api.update.download(version));
        } catch (caught) {
            const message = caught instanceof Error ? caught.message : String(caught);
            setError(message);
            setStatus(null);
            startAction({ title: t('下载更新', 'Download update') }).fail(message, {
                title: t('下载失败', 'Download failed'),
            });
        } finally {
            setSubmitting(false);
        }
    };

    const restart = async () => {
        await runAction(
            {
                title: t('正在重启', 'Restarting'),
                successTitle: t('已请求重启', 'Restart requested'),
                successDetail: t('稍后刷新页面', 'Refresh the page shortly'),
                errorTitle: t('重启失败', 'Restart failed'),
            },
            async () => {
                setStatus(await api.update.restart());
            },
        );
    };

    if (status?.phase === 'idle' && !version && !error) {
        return null;
    }

    return (
        <div className="flex min-w-0 flex-col gap-3 py-3">
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
            {status?.phase === 'error' && (
                <p role="alert" className="text-xs text-destructive">
                    {status.message}
                </p>
            )}
            {status?.phase === 'unavailable' && (
                <p className="text-xs text-muted-foreground">{status.message}</p>
            )}
            {status?.phase === 'downloading' && (
                <p className="flex items-center gap-2 text-sm">
                    <Loader2 className="size-4 animate-spin" />
                    {t(`正在下载 v${status.version}`, `Downloading v${status.version}`)}
                </p>
            )}
            {status?.phase === 'restarting' && (
                <p className="text-sm">
                    {t('正在重启，稍后刷新页面。', 'Restarting; refresh the page shortly.')}
                </p>
            )}
            {status?.phase === 'ready' && (
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm">
                        {t(`v${status.version} 已就绪`, `v${status.version} ready`)}
                    </span>
                    <Button size="sm" variant="glass" onClick={() => setConfirmRestart(true)}>
                        <RefreshCw className="size-4" />
                        {t('重启更新', 'Restart to update')}
                    </Button>
                </div>
            )}
            {version && (phase === 'idle' || phase === 'error') && (
                <Button
                    variant="glass"
                    size="sm"
                    className="self-start"
                    onClick={() => {
                        void download();
                    }}
                    disabled={submitting}
                >
                    <Download className="size-4" />
                    {t('下载更新', 'Download update')}
                </Button>
            )}
            <ConfirmDialog
                open={confirmRestart}
                onOpenChange={setConfirmRestart}
                title={t('重启并更新？', 'Restart and update?')}
                description={t(
                    '连接将暂时断开，配置与数据保留。',
                    'The connection drops temporarily; configuration and data are kept.',
                )}
                confirmText={t('重启更新', 'Restart to update')}
                cancelText={t('取消', 'Cancel')}
                onConfirm={restart}
            />
        </div>
    );
}
