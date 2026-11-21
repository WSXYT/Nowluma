// Account context strip. The selected QQ account is the context for every
// adapter below it; switching routes through `requestSwitchUin` so the
// unsaved-edit confirmation still gates the switch.

import { useId } from 'react';
import { useT } from '@/i18n';
import { motion, useReducedMotionConfig } from 'motion/react';
import { ScrollableTabList } from '@/components/ui/tabs';
import { GlassSurface } from '@/components/ui/glass-material';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { QQInfo } from '@/types';

function qqAvatarUrl(uin: string) {
    return `/avatar/${encodeURIComponent(uin)}`;
}

interface AccountContextStripProps {
    accounts: QQInfo[];
    selectedUin: string | null;
    onSelect: (uin: string) => void;
}

export function AccountContextStrip({ accounts, selectedUin, onSelect }: AccountContextStripProps) {
    const t = useT();
    const id = useId();
    const reduced = useReducedMotionConfig();
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <span className="text-xs font-medium text-muted-foreground">
                {t('账号', 'Account')}
            </span>
            <GlassSurface className="cp-account-context">
                <ScrollableTabList
                    activeValue={selectedUin ?? ''}
                    role="group"
                    aria-label={t('选择账号', 'Select account')}
                    className="gap-1"
                >
                    {accounts.map((q) => {
                        const active = selectedUin === q.uin;
                        return (
                            <button
                                key={q.uin}
                                type="button"
                                aria-pressed={active}
                                data-tab-active={active ? 'true' : undefined}
                                onClick={() => onSelect(q.uin)}
                                className="cp-acct-chip outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {active && (
                                    <motion.span
                                        aria-hidden="true"
                                        layoutId={reduced ? undefined : `account-context-${id}`}
                                        className="cp-selection"
                                        transition={
                                            reduced
                                                ? { duration: 0 }
                                                : { duration: 0.42, ease: [0.16, 1, 0.3, 1] }
                                        }
                                    />
                                )}
                                <Avatar size={24} className="relative">
                                    <AvatarImage
                                        src={qqAvatarUrl(q.uin)}
                                        alt={q.nickname || q.uin}
                                    />
                                    <AvatarFallback>
                                        {(q.nickname || q.uin).slice(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="relative min-w-0 text-left">
                                    <span className="block max-w-[9rem] truncate text-xs font-medium">
                                        {q.nickname || q.uin}
                                    </span>
                                    <span className="block truncate font-mono text-micro text-muted-foreground tabular-nums">
                                        {q.uin}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </ScrollableTabList>
            </GlassSurface>
        </div>
    );
}
