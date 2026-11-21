// Overview widget: the notification subsystem's in-memory delivery history
// (most-recent-first, lost on restart). Opt-in (hidden by default); polls
// /api/notifications/recent. No per-widget config.
import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn } from '@/lib/utils';
import { useApi } from '@/lib/api';
import { startPolling } from '@/lib/polling';
import { useTheme } from '@/contexts/ThemeContext';
import type { NotificationDeliveryRecord } from '@/types';
import { useT } from '@/i18n';

const POLL_MS = 15_000;

export function DeliveriesWidget() {
    const t = useT();
    const api = useApi();
    const { formatClock } = useTheme();
    const [records, setRecords] = useState<NotificationDeliveryRecord[] | null>(null);
    const [loadFailure, setLoadFailure] = useState<{ detail?: string } | null>(null);
    const loadError =
        loadFailure &&
        (loadFailure.detail
            ? t(loadFailure.detail, `Failed to load recent deliveries: ${loadFailure.detail}`)
            : t('加载最近投递失败', 'Failed to load recent deliveries'));

    useEffect(() => {
        let active = true;
        const stop = startPolling(async () => {
            try {
                const records = await api.notifications.recent(50);

                if (active) {
                    setLoadFailure(null);
                    setRecords(records);
                }
            } catch (error) {
                console.error('load recent notification deliveries failed', error);

                if (active) {
                    setLoadFailure(error instanceof Error ? { detail: error.message } : {});
                    setRecords((prev) => prev ?? []);
                }
            }
        }, POLL_MS);

        return () => {
            active = false;
            stop();
        };
    }, [api]);

    return (
        <Card className="workspace-panel workspace-deliveries-panel">
            <CardHeader className="workspace-panel-heading">
                <CardTitle>
                    <h4 className="flex items-center gap-2">
                        <Bell className="size-4" />
                        {t('通知投递', 'Notification deliveries')}
                    </h4>
                </CardTitle>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 overflow-auto">
                <SkeletonSwap
                    ready={records !== null}
                    reserve={120}
                    lines={5}
                    lineHeight={24}
                    label={t('通知投递', 'Notification deliveries')}
                    className={records !== null ? 'skeleton-swap-fluid min-h-[120px]' : ''}
                >
                    {records !== null ? (
                        loadError && records.length === 0 ? (
                            <p
                                role="alert"
                                className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-8 text-center text-sm text-destructive"
                            >
                                {loadError}
                            </p>
                        ) : records.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-muted-foreground">
                                <Bell className="size-8 opacity-40" strokeWidth={1.5} />
                                <p className="text-sm">{t('暂无投递记录', 'No deliveries yet')}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1 text-meta">
                                {loadError && (
                                    <p
                                        role="alert"
                                        className="mb-1 rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 font-sans text-xs text-destructive"
                                    >
                                        {t(
                                            `${loadError}；当前显示上次成功读取的投递记录。`,
                                            `${loadError} Showing the last successfully loaded deliveries.`,
                                        )}
                                    </p>
                                )}
                                {records.map((r, i) => (
                                    <div key={i} className="workspace-delivery-row">
                                        {r.ok ? (
                                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                                        ) : (
                                            <XCircle className="size-3.5 shrink-0 text-destructive" />
                                        )}
                                        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                                            {formatClock(r.time)}
                                        </span>
                                        <span
                                            className={cn(
                                                'shrink-0 font-medium',
                                                r.event === 'online'
                                                    ? 'text-success'
                                                    : 'text-warning-foreground',
                                            )}
                                        >
                                            {r.event === 'online'
                                                ? t('上线', 'Online')
                                                : t('下线', 'Offline')}
                                        </span>
                                        <span className="shrink-0 font-mono">{r.uin}</span>
                                        <span
                                            className="ml-auto min-w-0 truncate text-muted-foreground"
                                            title={r.error ?? r.channelId}
                                        >
                                            {r.channelId}
                                            {!r.ok && r.error && (
                                                <span className="text-xs text-destructive">
                                                    {' '}
                                                    · {r.error}
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : null}
                </SkeletonSwap>
            </CardContent>
        </Card>
    );
}
