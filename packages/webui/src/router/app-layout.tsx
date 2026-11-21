import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useApi } from '@/lib/api';
import { useHookProcessOps } from '@/hooks/use-hook-process-ops';
import { useKernelChoice } from '@/hooks/use-kernel-choice';
import { KernelChoiceDialog } from '@/components/kernel-choice';
import { MainLayout } from '@/components/layout/main-layout';
import { NAV_ITEMS } from '@/components/layout/sidebar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LowIntegrityWarning } from '@/components/low-integrity-warning';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { AppStateProvider } from '@/contexts/AppStateContext';
import { useAppResources } from '@/hooks/use-app-resources';
import { KioskProvider } from '@/contexts/KioskContext';
import { LayoutProvider, useLayout } from '@/contexts/LayoutContext';
import { useSession } from '@/contexts/SessionContext';
import type { AppPath } from '@/router';
import { useT } from '@/i18n';

/**
 * Redirects to the operator's configured landing page once (after the layout
 * config loads), but only when arriving at the root and the target is a real,
 * non-root nav route — so deep-links and later navigation are respected.
 * Rendered INSIDE LayoutProvider (needs useLayout).
 */
function DefaultRouteRedirect() {
    const { pages, ready } = useLayout();
    const navigate = useNavigate();
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const done = useRef(false);

    useEffect(() => {
        if (!ready || done.current) {
            return;
        }

        done.current = true;
        const target = pages.defaultRoute;

        if (
            target &&
            target !== '/' &&
            pathname === '/' &&
            NAV_ITEMS.some((n) => n.to === target)
        ) {
            void navigate({ to: target as AppPath });
        }
    }, [ready, pages.defaultRoute, pathname, navigate]);

    return null;
}

export function AppLayout() {
    const t = useT();
    const api = useApi();
    const { pollInterval, reloadAppearance } = useTheme();
    const session = useSession();

    // Now that we're authed, re-fetch appearance from /api/ui so the
    // authed-only `customCss` (stripped from the pre-auth public subset) loads.
    useEffect(() => {
        void reloadAppearance();
    }, [reloadAppearance]);

    const data = useAppResources(pollInterval);
    const { connections, refreshProcesses, systemInfo } = data;
    const [selectedUin, setSelectedUin] = useState<string | null>(null);
    const { pending: kernelChoice, beforeAttach } = useKernelChoice();
    const {
        ops: processOps,
        unloadFailedAlert,
        dismissUnloadFailedAlert,
        cancelPending,
    } = useHookProcessOps({
        onAfterOp: refreshProcesses,
        beforeAttach,
    });

    const handleLogout = useCallback(async () => {
        cancelPending();
        await api.logout();
        session.onLogoutComplete();
    }, [api, cancelPending, session]);

    const migrationNotice = useMemo(() => {
        const active = connections.filter((account) => {
            const phase = account.databaseMigration?.phase;
            return phase && phase !== 'complete';
        });

        if (active.length === 0) {
            return null;
        }

        const preparing = active.filter(
            (account) => account.databaseMigration?.phase === 'preparing',
        ).length;
        const migrating = active.filter(
            (account) => account.databaseMigration?.phase === 'migrating',
        ).length;
        const failedUsable = active.filter(
            (account) =>
                account.databaseMigration?.phase === 'failed' && account.databaseMigration.usable,
        ).length;
        const failedUnavailable = active.filter(
            (account) =>
                account.databaseMigration?.phase === 'failed' && !account.databaseMigration.usable,
        ).length;
        const parts: string[] = [];

        if (preparing > 0) {
            parts.push(
                t(
                    `${preparing} 个账号正在准备数据库，暂不可用`,
                    `Preparing databases: ${preparing} (temporarily unavailable)`,
                ),
            );
        }

        if (migrating > 0) {
            parts.push(
                t(
                    `${migrating} 个账号正在后台迁移，功能可用`,
                    `Migrating in the background: ${migrating} (available)`,
                ),
            );
        }

        if (failedUsable > 0) {
            parts.push(
                t(
                    `${failedUsable} 个可用账号迁移失败，将自动重试`,
                    `Migration failed: ${failedUsable} (still available; will retry automatically)`,
                ),
            );
        }

        if (failedUnavailable > 0) {
            parts.push(
                t(
                    `${failedUnavailable} 个账号数据库准备失败，暂不可用并将自动重试`,
                    `Database preparation failed: ${failedUnavailable} (unavailable; will retry automatically)`,
                ),
            );
        }

        return (
            <div
                role="status"
                className="border-b border-warning/25 bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground sm:px-6 lg:px-8"
            >
                <span className="font-medium">
                    {t('账号数据库状态：', 'Account database status: ')}
                </span>
                {parts.join(t('；', '; '))}
            </div>
        );
    }, [connections, t]);

    return (
        <AppStateProvider
            value={{
                ...data,
                selectedUin,
                setSelectedUin,
                processOps,
                onLogout: handleLogout,
            }}
        >
            <LayoutProvider>
                <KioskProvider>
                    <DefaultRouteRedirect />
                    <MainLayout
                        status={session.status}
                        onLogout={handleLogout}
                        notice={migrationNotice}
                    >
                        {/* Routes use `lazyRouteComponent` (router/index.tsx) for
                code-splitting, which suspends until the chunk is fetched.
                The chrome (sidebar / top bar) stays mounted across this
                boundary so only the page surface flashes a skeleton. */}
                        <Suspense fallback={<PageFallback />}>
                            <Outlet />
                        </Suspense>
                    </MainLayout>
                </KioskProvider>
            </LayoutProvider>

            {kernelChoice ? (
                <KernelChoiceDialog
                    key={`${kernelChoice.target.pid}:${kernelChoice.target.uin}:${kernelChoice.catalog.riskVersion}`}
                    choice={kernelChoice}
                    onStop={() => processOps.unload(kernelChoice.target.pid)}
                />
            ) : null}
            <LowIntegrityWarning lowIntegrity={systemInfo?.runtime.lowIntegrity === true} />
            <ConfirmDialog
                open={!!unloadFailedAlert}
                onOpenChange={(open) => !open && dismissUnloadFailedAlert()}
                title={t('卸载失败', 'Unload failed')}
                description={
                    unloadFailedAlert ? (
                        <>
                            <p>
                                {t(
                                    `进程 ${unloadFailedAlert.pid} 的 Nowluma DLL 卸载失败。`,
                                    `Could not unload the Nowluma DLL from process ${unloadFailedAlert.pid}.`,
                                )}
                            </p>
                            <p className="mt-2 text-sm">{unloadFailedAlert.error}</p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                {t('如需彻底卸载，请重启 QQ。', 'Restart QQ to finish unloading.')}
                            </p>
                        </>
                    ) : null
                }
                confirmText={t('知道了', 'OK')}
                cancelText={t('取消', 'Cancel')}
                onConfirm={dismissUnloadFailedAlert}
            />
        </AppStateProvider>
    );
}

function PageFallback() {
    const t = useT();
    return (
        <SkeletonSwap
            ready={false}
            lines={7}
            lineHeight={28}
            barHeight={11}
            reserve={196}
            label={t('页面内容', 'Page content')}
            className="w-full"
        >
            {null}
        </SkeletonSwap>
    );
}
