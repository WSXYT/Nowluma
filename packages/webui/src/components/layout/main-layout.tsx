import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { useRouterState } from '@tanstack/react-router';
import { Minimize2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { NavigationDock, WorkspaceManagement } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { PaperBackdrop } from '@/components/layout/paper-backdrop';
import { useTheme } from '@/contexts/ThemeContext';
import { useKiosk } from '@/contexts/KioskContext';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import '@/styles/workspace.css';

interface MainLayoutProps {
    status: string;
    onLogout: () => void;
    notice?: ReactNode;
    children: ReactNode;
}

export function MainLayout({ status, onLogout, notice, children }: MainLayoutProps) {
    const t = useT();
    const { appearance } = useTheme();
    const customBg = appearance.background.type !== 'none';
    const reduce = useReducedMotionConfig() || appearance.reduceMotion || appearance.disableMotion;
    const { kiosk, exit: exitKiosk } = useKiosk();
    const [managementOpen, setManagementOpen] = useState(false);

    useEffect(() => {
        if (kiosk) {
            setManagementOpen(false);
        }
    }, [kiosk]);

    const pathname = useRouterState({ select: (state) => state.location.pathname });

    return (
        <div
            className={cn('workspace-shell text-foreground', !customBg && 'bg-background')}
            data-workspace-kiosk={kiosk}
        >
            {!customBg && <PaperBackdrop />}
            {!kiosk && (
                <>
                    <TopBar
                        status={status}
                        onManageWorkspace={() => setManagementOpen(true)}
                        onLogout={onLogout}
                    />
                    <Sheet open={managementOpen} onOpenChange={setManagementOpen}>
                        <SheetContent
                            side="right"
                            className="workspace-management-sheet"
                            onCloseAutoFocus={(event) => {
                                event.preventDefault();
                                document.getElementById('workspace-session-trigger')?.focus();
                            }}
                        >
                            <div className="workspace-management-heading">
                                <SheetTitle>{t('工作区管理', 'Workspace management')}</SheetTitle>
                                <SheetDescription>
                                    {t('导航、布局与更新。', 'Navigation, layout, and updates.')}
                                </SheetDescription>
                            </div>
                            <WorkspaceManagement onItemClick={() => setManagementOpen(false)} />
                        </SheetContent>
                    </Sheet>
                    {notice}
                </>
            )}
            {kiosk && (
                <button
                    type="button"
                    onClick={exitKiosk}
                    title={t('退出展示模式 (Esc)', 'Exit presentation mode (Esc)')}
                    aria-label={t('退出展示模式', 'Exit presentation mode')}
                    className="workspace-icon-button workspace-kiosk-exit"
                >
                    <Minimize2 className="size-4" />
                </button>
            )}
            <main
                id="workspace-content"
                tabIndex={-1}
                className="workspace-main"
                data-ui-surface="canvas"
            >
                <ScrollArea className="flex-1 min-h-0" viewportClassName="[&>div]:!block">
                    <div className="workspace-content">
                        <motion.div
                            key={pathname}
                            initial={reduce ? false : { opacity: 0.45 }}
                            animate={{ opacity: 1 }}
                            transition={reduce ? { duration: 0 } : { duration: 0.14 }}
                            className="workspace-route"
                        >
                            {children}
                        </motion.div>
                    </div>
                </ScrollArea>
            </main>
            {!kiosk && <NavigationDock />}
        </div>
    );
}
