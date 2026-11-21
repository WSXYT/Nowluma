// Developer workbench over the real debug API. Editors and activity stay
// mounted across local navigation; the reference retains state after its
// first visit. Prefilling the tester cannot replace an in-flight invocation.
import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { Activity, Library, Send, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/tabs';
import { GlassSurface } from '@/components/ui/glass-material';
import { ActionTester } from '@/components/debug/action-tester';
import { MessageComposer } from '@/components/debug/message-composer';
import { LiveActivity } from '@/components/debug/live-activity';
import { ApiBrowser } from '@/components/debug/api-browser';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { useApi } from '@/lib/api';
import type { DebugActionDoc, QQInfo } from '@/types';
import '@/styles/console-pages.css';

type Tab = 'tester' | 'compose' | 'activity' | 'api';

export function DebugPage() {
    const t = useT();
    const api = useApi();
    const [accounts, setAccounts] = useState<QQInfo[]>([]);
    const [docs, setDocs] = useState<DebugActionDoc[]>([]);
    const [ready, setReady] = useState(false);
    const [loadError, setLoadError] = useState<{ message: string | null } | null>(null);
    const [tab, setTab] = useState<Tab>('tester');
    const [apiOpened, setApiOpened] = useState(false);
    const [testerInvoking, setTesterInvoking] = useState(false);
    const [preset, setPreset] = useState<{ name: string; nonce: number } | undefined>();

    useEffect(() => {
        void (async () => {
            try {
                const [qq, acts] = await Promise.all([api.qqList(), api.debug.actions()]);
                setAccounts(qq);
                setDocs(acts.actions);
            } catch (error) {
                console.error('load debug tools', error);
                setLoadError({ message: error instanceof Error ? error.message : null });
            } finally {
                setReady(true);
            }
        })();
    }, [api]);

    const tryAction = (name: string) => {
        if (testerInvoking) {
            return;
        }

        setPreset((p) => ({ name, nonce: (p?.nonce ?? 0) + 1 }));
        setTab('tester');
    };

    return (
        <div className="cp-page">
            <header className="cp-document-header">
                <div className="cp-toolbar">
                    <div className="min-w-0">
                        <h2 className="cp-page-heading">{t('开发者工具', 'Developer tools')}</h2>
                        <p className="cp-lede">
                            {t(
                                '选择实际账号调用接口，构建消息并阅读运行结果。',
                                'Use a connected account to run actions, compose messages, and inspect the results.',
                            )}
                        </p>
                    </div>
                    {ready && (
                        <span className="cp-runtime-context font-mono tabular-nums">
                            {t(
                                `${accounts.length} 个账号 · ${docs.length} 个接口`,
                                `${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'} · ${docs.length} ${docs.length === 1 ? 'action' : 'actions'}`,
                            )}
                            {testerInvoking && (
                                <span role="status">{t('调用进行中', 'Action running')}</span>
                            )}
                        </span>
                    )}
                </div>
                {loadError && (
                    <div role="alert" className="cp-inline-notice text-destructive">
                        {loadError.message ??
                            t('加载开发者工具失败', 'Could not load developer tools')}
                    </div>
                )}
                <GlassSurface className="cp-category-chrome">
                    <Tabs
                        className="border-0"
                        aria-label={t('调试工具', 'Debug tools')}
                        value={tab}
                        onChange={(next) => {
                            setTab(next);

                            if (next === 'api') {
                                setApiOpened(true);
                            }
                        }}
                        items={[
                            {
                                value: 'tester',
                                label: t('接口调用', 'Action tester'),
                                icon: <Terminal className="size-4" />,
                            },
                            {
                                value: 'compose',
                                label: t('发送消息', 'Send message'),
                                icon: <Send className="size-4" />,
                            },
                            {
                                value: 'activity',
                                label: t('活动记录', 'Activity'),
                                icon: <Activity className="size-4" />,
                            },
                            {
                                value: 'api',
                                label: t('接口库', 'API reference'),
                                icon: <Library className="size-4" />,
                                badge: docs.length || undefined,
                            },
                        ]}
                    />
                </GlassSurface>
            </header>

            <SkeletonSwap
                ready={ready}
                reserve={224}
                lines={8}
                lineHeight={28}
                barHeight={11}
                label={t('开发者工具数据', 'Developer tools data')}
                className={ready ? 'skeleton-swap-fluid' : ''}
            >
                {ready ? (
                    <>
                        {/* Editors remain mounted during local navigation. The activity
                            subscription deliberately captures calls from the other tabs. */}
                        <div
                            role="tabpanel"
                            aria-label={t('接口调用', 'Action tester')}
                            hidden={tab !== 'tester'}
                            inert={tab !== 'tester'}
                            className={cn('min-w-0', tab === 'tester' && 'cp-fade')}
                        >
                            <ActionTester
                                accounts={accounts}
                                docs={docs}
                                presetAction={preset}
                                onInvokingChange={setTesterInvoking}
                            />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label={t('发送消息', 'Send message')}
                            hidden={tab !== 'compose'}
                            inert={tab !== 'compose'}
                            className={cn('min-w-0', tab === 'compose' && 'cp-fade')}
                        >
                            <MessageComposer accounts={accounts} />
                        </div>
                        <div
                            role="tabpanel"
                            aria-label={t('活动记录', 'Activity')}
                            hidden={tab !== 'activity'}
                            inert={tab !== 'activity'}
                            className={cn('min-w-0', tab === 'activity' && 'cp-fade')}
                        >
                            <LiveActivity />
                        </div>
                        {apiOpened && (
                            <div
                                role="tabpanel"
                                aria-label={t('接口库', 'API reference')}
                                hidden={tab !== 'api'}
                                inert={tab !== 'api'}
                                className={cn('min-w-0', tab === 'api' && 'cp-fade')}
                            >
                                <ApiBrowser
                                    docs={docs}
                                    onTry={tryAction}
                                    tryDisabled={testerInvoking}
                                />
                            </div>
                        )}
                    </>
                ) : null}
            </SkeletonSwap>
        </div>
    );
}
