// The workflow stays outside the editable grid and uses only existing account resources.
import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotionConfig } from 'motion/react';
import { Link } from '@tanstack/react-router';
import {
    AlertCircle,
    ArrowRight,
    Check,
    ChevronRight,
    Cable,
    Loader2,
    MessageCircle,
    RefreshCw,
    ScrollText,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/interior/modal';
import { SkeletonSwap } from '@/components/interior/skeleton-swap';
import { cn } from '@/lib/utils';
import {
    nextStep,
    pickTargetProcess,
    stepTitle,
    type StepAction,
    type StepView,
} from '@/lib/next-step';
import { DesktopButton } from '@/components/desktop-button';
import { useAppState } from '@/contexts/AppStateContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useT } from '@/i18n';

export function GettingStartedPanel() {
    const t = useT();
    const {
        resources,
        processList,
        qqList,
        connections,
        processOps,
        selectedUin,
        setSelectedUin,
        refreshProcesses,
        refreshQqList,
        refreshConnections,
    } = useAppState();
    const { appearance, performance } = useTheme();
    const reduced = useReducedMotionConfig();
    const off = reduced || appearance.reduceMotion || appearance.disableMotion;

    // 面板自己选定的 PID。不放进全局状态：这是引导过程里的临时选择。
    const [selectedPid, setSelectedPid] = useState<number | null>(null);
    const [picking, setPicking] = useState(false);
    const [details, setDetails] = useState<Pick<StepView, 'id' | 'done' | 'error'> | null>(null);

    const target = useMemo(
        () => pickTargetProcess(processList, selectedPid, selectedUin).target,
        [processList, selectedPid, selectedUin],
    );

    const pendingOp = target ? processOps.statusOf(target.pid) : null;

    const step = nextStep(
        {
            ready: {
                processList: resources.processList.ready,
                qqList: resources.qqList.ready,
                connections: resources.connections.ready,
            },
            errors: {
                processList: resources.processList.error ?? '',
                qqList: resources.qqList.error ?? '',
                connections: resources.connections.error ?? '',
            },
            processList,
            qqList,
            connections,
            selectedPid,
            pendingOp,
        },
        selectedUin,
        t,
    );

    const refreshAll = () => {
        refreshProcesses();
        refreshQqList();
        refreshConnections();
    };

    const run = (action: StepAction) => {
        switch (action) {
            case 'refresh-all':
                if (step.id === 'selection-lost') {
                    setSelectedPid(null);
                }

                refreshAll();
                return;

            case 'refresh':
                if (target) {
                    void processOps.refresh(target.pid);
                }

                refreshAll();
                return;

            case 'load':
                if (target) {
                    setSelectedPid(target.pid);
                    void processOps.load(target.pid);
                }

                return;

            case 'choose-qq':
                setPicking(true);
                refreshAll();
                return;

            case 'details':
                setDetails({ id: step.id, done: step.done, error: step.error });
                return;

            case 'open-config':
                return;
        }
    };

    const busy = step.action === null;
    const alertError = step.error.trim().length > 0;

    useEffect(() => {
        if (step.id === 'manual-stopped' && !alertError) {
            setPicking(false);
            setDetails(null);
        }
    }, [step.id, alertError]);

    const stage = step.done
        ? 2
        : [
                'account-preparing',
                'account-failed',
                'no-network',
                'network-off',
                'network-broken',
                'network-warn',
            ].includes(step.id)
          ? 1
          : 0;
    const confirmed =
        !alertError &&
        step.id !== 'mismatch' &&
        target?.status === 'online' &&
        target.injected &&
        target.connected &&
        target.loggedIn;
    const sessionUin = target?.uin && target.uin !== '0' ? target.uin : target?.account?.uin;
    const sessionName = target?.account?.nickname || sessionUin || target?.name;
    const transition = off
        ? { duration: 0 }
        : performance?.low
          ? { duration: 0.18, ease: 'easeOut' as const }
          : { type: 'spring' as const, duration: 0.42, bounce: 0.1 };

    if (step.id === 'manual-stopped' && !alertError) {
        return null;
    }

    return (
        <>
            <motion.section
                aria-label={t('连接工作流', 'Connection workflow')}
                initial={off ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={transition}
                aria-busy={step.id === 'reading' || busy}
                data-ready={step.done}
                className="workspace-connection-workflow"
            >
                <ol
                    aria-label={t('连接路径', 'Connection steps')}
                    className="workspace-connection-story"
                >
                    {[
                        ['session', t('QQ 会话', 'QQ session')],
                        ['connection', t('机器人连接', 'Bot connection')],
                        ['results', t('查看结果', 'View results')],
                    ].map(([id, label], index) => (
                        <li
                            key={id}
                            aria-current={index === stage ? 'step' : undefined}
                            data-complete={index < stage}
                        >
                            <span className="workspace-stage-number" aria-hidden="true">
                                {index < stage ? <Check className="size-3" /> : `0${index + 1}`}
                            </span>
                            <span>{label}</span>
                        </li>
                    ))}
                </ol>
                <div className="workspace-workflow-layout">
                    <div className="workspace-workflow-session">
                        <p className="workspace-eyebrow">{t('当前 QQ', 'Current QQ session')}</p>
                        <div className="workspace-focused-session">
                            {confirmed && target ? (
                                <Avatar size={40}>
                                    <AvatarImage
                                        src={`/avatar/${encodeURIComponent(target.uin)}`}
                                        alt=""
                                    />
                                    <AvatarFallback>
                                        {(sessionName || target.uin).slice(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                            ) : (
                                <MessageCircle
                                    className="size-8 shrink-0 text-muted-foreground"
                                    strokeWidth={1}
                                />
                            )}
                            <div className="min-w-0">
                                <p
                                    className="workspace-focused-session-name"
                                    title={target ? `PID ${target.pid}` : undefined}
                                >
                                    {sessionName ||
                                        (step.id === 'reading'
                                            ? t('读取中…', 'Loading…')
                                            : t('尚未选择', 'No session selected'))}
                                </p>
                                <p className="workspace-focused-session-meta">
                                    {target
                                        ? confirmed
                                            ? t('已登录', 'Signed in')
                                            : t('待确认', 'Unconfirmed')
                                        : t('从会话开始', 'Start with a session')}
                                    {target && (
                                        <span className="font-mono">
                                            {' '}
                                            ·{' '}
                                            {sessionUin ? `QQ ${sessionUin}` : `PID ${target.pid}`}
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        {target && processList.length > 1 && (
                            <button
                                type="button"
                                aria-label={t('切换 QQ 会话', 'Switch QQ session')}
                                disabled={pendingOp !== null}
                                onClick={() => run('choose-qq')}
                                className="workspace-inline-link"
                            >
                                {t('更换会话', 'Switch session')}{' '}
                                <ChevronRight className="size-3.5" />
                            </button>
                        )}
                    </div>
                    <div className="workspace-workflow-next">
                        <div className="workspace-workflow-message">
                            <div
                                className={cn(
                                    'workspace-workflow-icon',
                                    alertError
                                        ? 'text-destructive'
                                        : step.done
                                          ? 'text-success'
                                          : 'text-muted-foreground',
                                )}
                                aria-hidden="true"
                            >
                                {alertError ? (
                                    <AlertCircle className="size-5" />
                                ) : step.done ? (
                                    <Check className="size-5" />
                                ) : busy ? (
                                    <Loader2 className={cn('size-5', !off && 'animate-spin')} />
                                ) : stage === 1 ? (
                                    <Cable className="size-5" />
                                ) : (
                                    <MessageCircle className="size-5" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <SkeletonSwap
                                    ready={step.id !== 'reading'}
                                    lines={2}
                                    lineHeight={28}
                                    reserve={56}
                                    label={t('下一步提示', 'Next step')}
                                    className={step.id !== 'reading' ? 'skeleton-swap-fluid' : ''}
                                >
                                    <h3 className="workspace-workflow-title">{step.title}</h3>
                                </SkeletonSwap>
                                {step.hint && (
                                    <p className="workspace-workflow-hint">{step.hint}</p>
                                )}
                                {alertError && (
                                    <p
                                        role="alert"
                                        className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-destructive"
                                    >
                                        {step.error}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="workspace-workflow-actions">
                            {step.done && (
                                <Button size="sm" asChild>
                                    <Link to="/logs">
                                        <ScrollText className="size-4" />
                                        {t('查看结果', 'View results')}
                                    </Link>
                                </Button>
                            )}
                            {step.action === 'open-config' ? (
                                <Button size="sm" asChild>
                                    <Link
                                        to="/config"
                                        onClick={() =>
                                            target?.loggedIn && setSelectedUin(target.uin)
                                        }
                                    >
                                        {step.actionLabel}
                                        <ArrowRight className="size-4" />
                                    </Link>
                                </Button>
                            ) : step.action ? (
                                <Button
                                    size="sm"
                                    variant={step.done ? 'ghost' : 'default'}
                                    disabled={pendingOp !== null}
                                    onClick={() => run(step.action!)}
                                >
                                    {step.action === 'refresh-all' && (
                                        <RefreshCw className="size-4" />
                                    )}
                                    {step.actionLabel}
                                    {!step.done && step.action !== 'choose-qq' && (
                                        <ArrowRight className="size-4" />
                                    )}
                                </Button>
                            ) : (
                                <Button size="sm" disabled>
                                    <Loader2 className={cn('size-4', !off && 'animate-spin')} />
                                    {step.actionLabel}
                                </Button>
                            )}
                            <DesktopButton />
                        </div>
                    </div>
                </div>
            </motion.section>

            {/* 多进程选择：不批量接入，只让用户点一个。 */}
            <Modal
                open={picking}
                onClose={() => setPicking(false)}
                title={t('选择 QQ 会话', 'Select a QQ session')}
                description={t('只操作你选中的会话。', 'Actions affect only the selected session.')}
                closeLabel={t('关闭会话选择', 'Close session picker')}
                className="workspace-modal"
            >
                <div className="flex flex-col gap-2">
                    {processList.length === 0 ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="size-4" />
                            {t(
                                '现在没有检测到 QQ，先打开并登录 QQ 再回来。',
                                'No QQ process detected. Open QQ and sign in, then return here.',
                            )}
                        </p>
                    ) : (
                        processList.map((proc) => (
                            <button
                                key={proc.pid}
                                type="button"
                                onClick={() => {
                                    setSelectedPid(proc.pid);
                                    setPicking(false);
                                }}
                                className="workspace-process-choice"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                        {proc.account?.nickname || proc.uin || proc.name}
                                    </span>
                                    <span className="block truncate font-mono text-meta text-muted-foreground">
                                        PID {proc.pid}
                                        {proc.uin ? ` · QQ ${proc.uin}` : ''}
                                    </span>
                                </span>
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                            </button>
                        ))
                    )}
                </div>
            </Modal>

            {/* 说明与原因：错误必须看得见，不能只活在自动消失的通知里。 */}
            <Modal
                open={details !== null}
                onClose={() => setDetails(null)}
                title={
                    details?.done
                        ? t('连接说明', 'Connection details')
                        : t('检查原因', 'Check the error')
                }
                description={details ? stepTitle(details.id, t) : undefined}
                closeLabel={t('关闭连接说明', 'Close connection details')}
                className="workspace-modal"
            >
                {details?.done ? (
                    <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
                        <p>
                            {t(
                                '连接就绪只表示端点在监听或已连上，不代表机器人已回复。',
                                'Connection ready means the endpoint is listening or connected. It does not mean the bot has replied.',
                            )}
                        </p>
                        <p>
                            {t(
                                '在运行记录中核对消息；回复逻辑由你的机器人程序负责。',
                                'Check messages in the runtime logs. Your bot handles replies.',
                            )}
                        </p>
                    </div>
                ) : (
                    <p
                        role="alert"
                        className="whitespace-pre-line break-words rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                    >
                        {details?.error ||
                            t(
                                '没有更多信息，请查看「运行记录」。',
                                'No further details. Check the runtime logs.',
                            )}
                    </p>
                )}
            </Modal>
        </>
    );
}
