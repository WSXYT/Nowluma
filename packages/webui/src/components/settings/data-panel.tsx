import { Clock, RefreshCw } from 'lucide-react';
import { Dropdown } from '@/components/interior/dropdown';
import { localizeNavItem, NAV_ITEMS } from '@/components/layout/sidebar';
import { Group, Segmented, SettingRow, type Opt } from '@/components/settings/settings-controls';
import { useLayout } from '@/contexts/LayoutContext';
import { POLL_INTERVAL_OPTIONS, useTheme, type TimeFormat } from '@/contexts/ThemeContext';
import { useT } from '@/i18n';

// ─────────────── 数据与格式 ───────────────

export function DataPanel() {
    const t = useT();
    const timeFormats: Opt<TimeFormat>[] = [
        { value: '24h', label: t('24 小时制', '24-hour') },
        { value: '12h', label: t('12 小时制 (AM/PM)', '12-hour (AM/PM)') },
    ];

    const { appearance, setAppearance } = useTheme();
    const { pages, setPages } = useLayout();
    return (
        <div className="flex min-w-0 flex-col gap-7">
            <Group title={t('数据刷新', 'Data refresh')} icon={RefreshCw}>
                <SettingRow
                    label={t('轮询间隔', 'Polling interval')}
                    hint={
                        appearance.pollInterval === 0
                            ? t('已暂停轮询', 'Polling is paused')
                            : t(
                                  `当前 ${appearance.pollInterval} 毫秒`,
                                  `Current interval: ${appearance.pollInterval} ms`,
                              )
                    }
                    layout="stack"
                >
                    <Segmented
                        value={appearance.pollInterval}
                        options={POLL_INTERVAL_OPTIONS.map((o) => ({
                            value: o.value,
                            label:
                                o.value === 0
                                    ? t('暂停', 'Pause')
                                    : t(`${o.value / 1000} 秒`, `${o.value / 1000} s`),
                        }))}
                        onChange={(pollInterval) => setAppearance({ pollInterval })}
                    />
                </SettingRow>
            </Group>

            <Group title={t('显示与启动', 'Display and startup')} icon={Clock}>
                <SettingRow label={t('登录后打开', 'Open after sign-in')}>
                    <Dropdown
                        label={t('默认页面', 'Default page')}
                        value={pages.defaultRoute}
                        items={NAV_ITEMS.map((item) => ({
                            value: item.to,
                            label: localizeNavItem(item, t).label,
                        }))}
                        onChange={(defaultRoute) => setPages({ defaultRoute })}
                        className="w-full max-w-xs"
                    />
                </SettingRow>
                <SettingRow label={t('时间格式', 'Time format')}>
                    <Segmented
                        value={appearance.timeFormat}
                        options={timeFormats}
                        onChange={(timeFormat) => setAppearance({ timeFormat })}
                    />
                </SettingRow>
            </Group>
        </div>
    );
}
