import { useId } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import {
    Bell,
    Bug,
    Code2,
    HardDrive,
    Info,
    Palette,
    RefreshCw,
    Server,
    ShieldCheck,
    SlidersHorizontal,
    type Sun,
} from 'lucide-react';
import { AboutPanel } from '@/components/settings/about-panel';
import { AccountPanel } from '@/components/settings/account-panel';
import { AdvancedPanel } from '@/components/settings/advanced-panel';
import { AppearancePanel } from '@/components/settings/appearance-panel';
import { DataPanel } from '@/components/settings/data-panel';
import { DeveloperPanel } from '@/components/settings/developer-panel';
import { GlobalConfigPanel } from '@/components/settings/global-config-panel';
import { NotificationsPanel } from '@/components/settings/notifications-panel';
import { StoragePanel } from '@/components/settings/storage-panel';
import { SystemPanel } from '@/components/settings/system-panel';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { settingsRoute, type SettingsTab } from '@/router';
import '@/styles/console-pages.css';

interface TabDef {
    key: SettingsTab;
    label: [zh: string, en: string];
    icon: typeof Sun;
}

// These categories belong only to Settings. Every key remains URL-addressable;
// the compact document index stays visible without a second scrolling region.
const TABS: TabDef[] = [
    { key: 'appearance', label: ['外观', 'Appearance'], icon: Palette },
    { key: 'data', label: ['数据与格式', 'Data and formatting'], icon: RefreshCw },
    { key: 'account', label: ['账号安全', 'Account security'], icon: ShieldCheck },
    { key: 'globalConfig', label: ['全局配置', 'Global configuration'], icon: SlidersHorizontal },
    { key: 'storage', label: ['存储管理', 'Storage'], icon: HardDrive },
    { key: 'notifications', label: ['通知', 'Notifications'], icon: Bell },
    { key: 'system', label: ['服务', 'Service'], icon: Server },
    { key: 'advanced', label: ['高级', 'Advanced'], icon: Code2 },
    { key: 'developer', label: ['开发者', 'Developer'], icon: Bug },
    { key: 'about', label: ['关于', 'About'], icon: Info },
];

export function SettingsPage() {
    const t = useT();
    // Active tab lives in the URL (`?tab=`) so it's deep-linkable — e.g. the
    // sidebar update banner jumps straight to About. Default tab omits the param.
    const { tab: urlTab } = settingsRoute.useSearch();
    const navigate = settingsRoute.useNavigate();
    const tab: SettingsTab = urlTab ?? 'appearance';
    const tabLabel = TABS.find((item) => item.key === tab)?.label;
    const setTab = (next: SettingsTab) =>
        void navigate({
            to: '/settings',
            search: next === 'appearance' ? {} : { tab: next },
            replace: true,
        });

    return (
        <div className="cp-page cp-settings">
            <header className="border-b border-border pb-4">
                <h2 className="text-lg font-semibold tracking-tight">
                    {t('控制台偏好', 'Console preferences')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('外观、数据与服务设置。', 'Appearance, data, and service settings.')}
                </p>
            </header>
            <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
                <SettingsNav tab={tab} onChange={setTab} />
                <section
                    key={tab}
                    data-settings-tab={tab}
                    aria-label={tabLabel && t(...tabLabel)}
                    className="cp-settings-content cp-fade flex min-w-0 flex-col gap-5"
                >
                    {tab === 'appearance' && <AppearancePanel />}
                    {tab === 'data' && <DataPanel />}
                    {tab === 'advanced' && <AdvancedPanel />}
                    {tab === 'account' && <AccountPanel />}
                    {tab === 'system' && <SystemPanel />}
                    {tab === 'storage' && <StoragePanel />}
                    {tab === 'notifications' && <NotificationsPanel />}
                    {tab === 'globalConfig' && <GlobalConfigPanel />}
                    {tab === 'developer' && <DeveloperPanel />}
                    {tab === 'about' && <AboutPanel />}
                </section>
            </div>
        </div>
    );
}

export function SettingsNav({
    tab,
    onChange,
}: {
    tab: SettingsTab;
    onChange: (tab: SettingsTab) => void;
}) {
    const t = useT();
    const id = useId();
    const reduced = useReducedMotionConfig();

    return (
        <nav
            aria-label={t('设置导航', 'Settings navigation')}
            className="min-w-0 lg:border-r lg:border-border lg:pr-5"
        >
            <div className="grid min-w-0 grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
                {TABS.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.key;
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onChange(item.key)}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'relative flex min-h-11 min-w-0 items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50',
                                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                            )}
                        >
                            {active && (
                                <motion.span
                                    aria-hidden="true"
                                    layoutId={reduced ? undefined : `settings-category-${id}`}
                                    className="absolute inset-y-2 left-0 w-0.5 bg-foreground"
                                    transition={
                                        reduced
                                            ? { duration: 0 }
                                            : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
                                    }
                                />
                            )}
                            <Icon aria-hidden="true" className="size-4 shrink-0" />
                            <span className="min-w-0 break-words">{t(...item.label)}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
