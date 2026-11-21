// ApiBrowser — an embedded, searchable reference for every declarative action
// (~520), grouped by category, surfaced straight from /api/debug/actions (the
// same docs the tester uses). Each row expands to params / returns / invariants
// and a Try action button that prefills the tester. No hand-maintained docs — this
// is the live catalog.
import { useId, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { AnimatePresence, motion, useReducedMotionConfig } from 'motion/react';
import { BookOpen, ChevronRight, PlayCircle, Search, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-material';
import type { DebugActionDoc } from '@/types';

function ActionRow({
    doc,
    onTry,
    tryDisabled,
}: {
    doc: DebugActionDoc;
    onTry: (name: string) => void;
    tryDisabled: boolean;
}) {
    const t = useT();
    const [open, setOpen] = useState(false);
    const id = useId();
    const reduced = useReducedMotionConfig();
    return (
        <div className="cp-action-row">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls={id}
                className="flex min-h-16 min-w-0 w-full items-start gap-3 py-3 text-left transition-colors hover:bg-muted/30"
            >
                <ChevronRight
                    className={cn(
                        'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
                        open && 'rotate-90',
                    )}
                />
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 break-all font-mono text-[13px] font-medium">
                            {doc.name}
                        </code>
                        {doc.readOnly ? (
                            <ShieldCheck
                                className="size-3.5 shrink-0 text-success"
                                aria-label={t('只读', 'Read-only')}
                            />
                        ) : (
                            <span
                                className="size-1.5 shrink-0 rounded-full bg-warning"
                                title={t('有副作用', 'Has side effects')}
                            />
                        )}
                        {doc.stream && (
                            <Zap
                                className="size-3.5 shrink-0 text-primary"
                                aria-label={t('流式', 'Streaming')}
                            />
                        )}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {doc.summary}
                    </span>
                </span>
            </button>
            <div id={id} inert={!open} aria-hidden={!open}>
                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div
                            key="detail"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            <div className="flex min-w-0 flex-col gap-3 border-t border-border/50 py-4 text-[13px]">
                                {doc.aliases.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('别名:', 'Aliases: ')}
                                        {doc.aliases.map((a) => (
                                            <code key={a} className="ml-1 font-mono">
                                                {a}
                                            </code>
                                        ))}
                                    </p>
                                )}
                                {doc.params.length > 0 ? (
                                    <div className="min-w-0">
                                        <table className="cp-api-table">
                                            <caption className="sr-only">
                                                {t(
                                                    `${doc.name} 参数`,
                                                    `Parameters for ${doc.name}`,
                                                )}
                                            </caption>
                                            <thead>
                                                <tr>
                                                    <th scope="col">{t('参数', 'Parameter')}</th>
                                                    <th scope="col">{t('类型', 'Type')}</th>
                                                    <th scope="col">{t('必填', 'Required')}</th>
                                                    <th scope="col">{t('说明', 'Description')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {doc.params.map((p) => (
                                                    <tr
                                                        key={p.name}
                                                        className="border-t border-border/40"
                                                    >
                                                        <td
                                                            data-label={t('参数', 'Parameter')}
                                                            className="font-mono"
                                                        >
                                                            {p.name}
                                                        </td>
                                                        <td
                                                            data-label={t('类型', 'Type')}
                                                            className="font-mono text-muted-foreground"
                                                        >
                                                            {p.values
                                                                ? p.values.map(String).join(' | ')
                                                                : p.type}
                                                            {p.role ? (
                                                                <span className="ml-1 text-primary/70">
                                                                    ·{p.role}
                                                                </span>
                                                            ) : null}
                                                        </td>
                                                        <td data-label={t('必填', 'Required')}>
                                                            {p.required
                                                                ? t('是', 'Yes')
                                                                : t('否', 'No')}
                                                        </td>
                                                        <td
                                                            data-label={t('说明', 'Description')}
                                                            className="text-muted-foreground"
                                                        >
                                                            {p.desc ?? ''}
                                                            {p.default !== undefined
                                                                ? t(
                                                                      ` (默认 ${JSON.stringify(p.default)})`,
                                                                      ` (default: ${JSON.stringify(p.default)})`,
                                                                  )
                                                                : ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">
                                        {t('无参数', 'No parameters')}
                                    </p>
                                )}
                                {doc.invariants && doc.invariants.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {t(
                                            `约束:${doc.invariants.join('；')}`,
                                            `Constraints: ${doc.invariants.join('; ')}`,
                                        )}
                                    </p>
                                )}
                                {doc.returns && (
                                    <p className="text-xs text-muted-foreground">
                                        {t('返回:', 'Returns: ')}
                                        <code className="font-mono">{doc.returns}</code>
                                    </p>
                                )}
                                <div>
                                    <Button
                                        variant="glass"
                                        size="sm"
                                        onClick={() => onTry(doc.name)}
                                        disabled={tryDisabled}
                                    >
                                        <PlayCircle className="h-3.5 w-3.5" />{' '}
                                        {t('试一下', 'Try action')}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export function ApiBrowser({
    docs,
    onTry,
    tryDisabled = false,
}: {
    docs: DebugActionDoc[];
    onTry: (name: string) => void;
    tryDisabled?: boolean;
}) {
    const reduced = useReducedMotionConfig();
    const t = useT();
    const [query, setQuery] = useState('');
    const [cat, setCat] = useState<string>('');

    const categories = useMemo(() => {
        const set = new Set<string>();

        for (const d of docs) {
            if (d.category) {
                set.add(d.category);
            }
        }

        return Array.from(set).sort();
    }, [docs]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return docs.filter((d) => {
            if (cat && d.category !== cat) {
                return false;
            }

            if (!q) {
                return true;
            }

            return (
                d.name.toLowerCase().includes(q) ||
                (d.summary?.toLowerCase().includes(q) ?? false) ||
                d.aliases.some((a) => a.toLowerCase().includes(q))
            );
        });
    }, [docs, query, cat]);

    const grouped = useMemo(() => {
        const m = new Map<string | undefined, DebugActionDoc[]>();

        for (const d of filtered) {
            const k = d.category;
            const arr = m.get(k) ?? [];
            arr.push(d);
            m.set(k, arr);
        }

        const fallback = t('其他', 'Other');
        return Array.from(m.entries()).sort((a, b) =>
            (a[0] ?? fallback).localeCompare(b[0] ?? fallback),
        );
    }, [filtered, t]);

    return (
        <motion.section
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduced ? 0 : 0.28 }}
            className="cp-panel flex min-w-0 flex-col gap-5"
        >
            <div className="flex items-center gap-2.5">
                <BookOpen className="size-4 text-muted-foreground" />
                <h2 className="text-[15px] font-semibold tracking-tight">
                    {t('接口库', 'API reference')}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {filtered.length}/{docs.length}
                </span>
            </div>

            <GlassSurface className="ui-glass-search cp-search max-w-3xl">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                    type="search"
                    aria-label={t(
                        '搜索接口名、摘要或别名',
                        'Search action names, summaries, or aliases',
                    )}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t(
                        '搜索接口名、摘要或别名…',
                        'Search action names, summaries, or aliases…',
                    )}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
            </GlassSurface>

            <div
                role="group"
                aria-label={t('接口分类', 'Action categories')}
                className="flex flex-wrap gap-1.5"
            >
                <button
                    type="button"
                    onClick={() => setCat('')}
                    aria-pressed={cat === ''}
                    className={cn(
                        'cp-level-toggle',
                        cat === '' ? 'text-foreground' : 'text-muted-foreground',
                    )}
                >
                    {t('全部', 'All')}
                </button>
                {categories.map((c) => (
                    <button
                        key={c}
                        type="button"
                        onClick={() => setCat(c)}
                        aria-pressed={cat === c}
                        className={cn(
                            'cp-level-toggle',
                            cat === c ? 'text-foreground' : 'text-muted-foreground',
                        )}
                    >
                        {c}
                    </button>
                ))}
            </div>

            <div className="flex min-w-0 flex-col gap-6">
                {grouped.length === 0 ? (
                    <p className="py-12 text-sm text-muted-foreground">
                        {t('没有匹配的接口', 'No matching actions')}
                    </p>
                ) : (
                    grouped.map(([category, items]) => (
                        <div
                            key={category === undefined ? 'uncategorized' : `category:${category}`}
                            className="flex flex-col gap-1.5"
                        >
                            <h3 className="px-1 text-xs font-semibold text-muted-foreground">
                                {category ?? t('其他', 'Other')}{' '}
                                <span className="font-normal tabular-nums">{items.length}</span>
                            </h3>
                            <div className="min-w-0 border-y border-border">
                                {items.map((d) => (
                                    <ActionRow
                                        key={d.name}
                                        doc={d}
                                        onTry={onTry}
                                        tryDisabled={tryDisabled}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </motion.section>
    );
}
