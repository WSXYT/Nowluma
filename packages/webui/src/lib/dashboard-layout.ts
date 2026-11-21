import type { LogLevel, UiLayoutItem } from '@/types';
import { defaultTranslate, type Translate } from '@/i18n';

// The overview dashboard is a free 12-column gridstack grid. This module is
// the pure catalogue + migration so it can be shared by the
// LayoutContext (defaults / reset / migrate-on-load), the DashboardGrid
// (render + min sizes), and the layout editor (labels) without import cycles.

export const GRID_COLS = 12;
/** Keep the established row height so saved coordinates retain their physical layout. */
export const GRID_CELL_HEIGHT = 108;
export const GRID_MARGIN = 8;

export interface GridWidgetSpec {
    id: string;
    label: readonly [string, string];
    /** Minimum width/height in grid units — prevents the content from collapsing. */
    minW: number;
    minH: number;
    /** Default placement when the operator hasn't positioned it yet. */
    def: { x: number; y: number; w: number; h: number };
    /** Whether the widget is shown by default. Static widgets (note/link/account)
     *  start hidden — they're opt-in and need configuring first. Defaults true. */
    defaultVisible?: boolean;
}

/** Individual instruments retained from the legacy `stats` block. */
export const STAT_TILE_IDS = [
    'stat:status',
    'stat:accounts',
    'stat:processes',
    'stat:host',
    'stat:uptime',
] as const;

export const GRID_WIDGETS: GridWidgetSpec[] = [
    {
        id: 'stat:status',
        label: ['控制台连接', 'Console connection'],
        minW: 2,
        minH: 1,
        def: { x: 0, y: 0, w: 2, h: 1 },
    },
    {
        id: 'stat:accounts',
        label: ['已登录会话', 'Signed-in sessions'],
        minW: 2,
        minH: 1,
        def: { x: 2, y: 0, w: 2, h: 1 },
    },
    {
        id: 'stat:processes',
        label: ['QQ 程序', 'QQ processes'],
        minW: 2,
        minH: 1,
        def: { x: 4, y: 0, w: 2, h: 1 },
    },
    {
        id: 'stat:host',
        label: ['运行设备', 'Host device'],
        minW: 2,
        minH: 1,
        def: { x: 6, y: 0, w: 3, h: 1 },
    },
    {
        id: 'stat:uptime',
        label: ['连续运行', 'Uptime'],
        minW: 2,
        minH: 1,
        def: { x: 9, y: 0, w: 3, h: 1 },
    },
    {
        id: 'connections',
        label: ['机器人连接', 'Bot connections'],
        minW: 3,
        minH: 3,
        def: { x: 0, y: 1, w: 7, h: 4 },
    },
    {
        id: 'alerts',
        label: ['运行动态', 'Runtime activity'],
        minW: 3,
        minH: 3,
        def: { x: 7, y: 1, w: 5, h: 4 },
    },
    {
        id: 'host',
        label: ['资源用量', 'Resource usage'],
        minW: 4,
        minH: 3,
        def: { x: 4, y: 5, w: 8, h: 4 },
    },
    {
        id: 'sessions',
        label: ['QQ 会话', 'QQ sessions'],
        minW: 3,
        minH: 3,
        def: { x: 0, y: 5, w: 4, h: 4 },
    },
    // Static, opt-in widgets — content lives in block.config, hidden by default.
    {
        id: 'note',
        label: ['便签', 'Note'],
        minW: 2,
        minH: 2,
        def: { x: 0, y: 9, w: 4, h: 2 },
        defaultVisible: false,
    },
    {
        id: 'link',
        label: ['链接卡', 'Link card'],
        minW: 2,
        minH: 1,
        def: { x: 4, y: 9, w: 4, h: 1 },
        defaultVisible: false,
    },
    {
        id: 'account',
        label: ['账号快捷卡', 'Account shortcut'],
        minW: 2,
        minH: 1,
        def: { x: 8, y: 9, w: 4, h: 1 },
        defaultVisible: false,
    },
    {
        id: 'deliveries',
        label: ['通知投递', 'Notification deliveries'],
        minW: 3,
        minH: 3,
        def: { x: 0, y: 11, w: 7, h: 3 },
        defaultVisible: false,
    },
];

/** Widgets hidden on first sight (opt-in) — derived from the catalogue's
 *  `defaultVisible:false` so a new opt-in widget is hidden on BOTH desktop
 *  (migrateOverviewBlocks) and mobile (reconcileLayoutItems) from a single
 *  source of truth — no second registration to forget. */
export const HIDDEN_BY_DEFAULT_IDS: ReadonlySet<string> = new Set(
    GRID_WIDGETS.filter((w) => w.defaultVisible === false).map((w) => w.id),
);

const WIDGET_BY_ID = new Map(GRID_WIDGETS.map((w) => [w.id, w]));

export function widgetLabel(id: string, t: Translate = defaultTranslate): string {
    const label = WIDGET_BY_ID.get(id)?.label;
    return label ? t(...label) : id;
}

function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validCoords(item: UiLayoutItem | undefined): boolean {
    return (
        !!item &&
        typeof item.x === 'number' &&
        typeof item.y === 'number' &&
        typeof item.w === 'number' &&
        typeof item.h === 'number'
    );
}

/** A fully-positioned overview block (coords always present). */
export function defaultOverviewGrid(): UiLayoutItem[] {
    return GRID_WIDGETS.map((w) => ({ id: w.id, visible: w.defaultVisible !== false, ...w.def }));
}

/** Mobile starts with the connection task and activity, then the instruments. */
export const MOBILE_WIDGET_IDS: readonly string[] = [
    'stat:status',
    'connections',
    'alerts',
    'sessions',
    'host',
    'stat:accounts',
    'stat:processes',
    'stat:host',
    'stat:uptime',
    'note',
    'link',
    'account',
    'deliveries',
];

/** Default single-column mobile overview (id+visible, no coords). */
export function defaultOverviewMobile(): UiLayoutItem[] {
    return MOBILE_WIDGET_IDS.map((id) => ({
        id,
        visible: WIDGET_BY_ID.get(id)?.defaultVisible !== false,
    }));
}

/**
 * Bring any stored overview layout up to the current grid catalogue:
 *  - expand the legacy single `stats` block into the 5 individual tiles
 *    (inheriting its visibility),
 *  - keep stored coords/visibility/config for known widgets, assign the default
 *    placement to any widget missing coords,
 *  - append catalogue widgets the stored layout predates (visible),
 *  - drop unknown ids.
 * Output items always carry x/y/w/h.
 */
export function migrateOverviewBlocks(stored: UiLayoutItem[] | undefined): UiLayoutItem[] {
    const byId = new Map<string, UiLayoutItem>();

    for (const raw of Array.isArray(stored) ? stored : []) {
        if (isObj(raw) && typeof raw.id === 'string') {
            byId.set(raw.id, raw as UiLayoutItem);
        }
    }

    // Legacy: a single `stats` block → seed the 5 tiles' visibility from it,
    // but only when the tiles aren't already individually present.
    const legacyStats = byId.get('stats');

    return GRID_WIDGETS.map((spec) => {
        const item = byId.get(spec.id);
        const isStatTile = (STAT_TILE_IDS as readonly string[]).includes(spec.id);
        const visible = item
            ? item.visible !== false
            : isStatTile && legacyStats
              ? legacyStats.visible !== false
              : spec.defaultVisible !== false;
        const coords = validCoords(item)
            ? { x: item!.x!, y: item!.y!, w: item!.w!, h: item!.h! }
            : { ...spec.def };
        const config = isObj(item?.config) ? { config: { ...item.config } } : {};
        return { id: spec.id, visible, ...coords, ...config };
    });
}

export function minSizeOf(id: string): { minW: number; minH: number } {
    const spec = WIDGET_BY_ID.get(id);
    return { minW: spec?.minW ?? 1, minH: spec?.minH ?? 1 };
}

/** A widget's natural height (grid rows) for single-column mobile stacking —
 *  the catalogue default, so phones get sensible per-widget heights without
 *  carrying the desktop grid's stored coords. */
export function mobileHeightOf(id: string): number {
    return WIDGET_BY_ID.get(id)?.def.h ?? 1;
}

// ─── Per-widget config (interpreted client-side from the opaque block.config) ───

export const ALL_LOG_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'success', 'warn', 'error'];

export interface AlertsConfig {
    count: number;
    levels: LogLevel[];
}
export interface SessionsConfig {
    sort: 'recent' | 'uin' | 'nickname';
    filter: string;
}
/** Host widget: which resource sub-panels to show. */
export interface HostConfig {
    cpu: boolean;
    memory: boolean;
    runtime: boolean;
}
/** Connections widget: filter + sort + issues-only. */
export interface ConnectionsConfig {
    filter: string;
    onlyIssues: boolean;
    sort: 'default' | 'name' | 'status';
}

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = { count: 5, levels: ['warn', 'error'] };
export const DEFAULT_SESSIONS_CONFIG: SessionsConfig = { sort: 'recent', filter: '' };
export const DEFAULT_HOST_CONFIG: HostConfig = { cpu: true, memory: true, runtime: true };
export const DEFAULT_CONNECTIONS_CONFIG: ConnectionsConfig = {
    filter: '',
    onlyIssues: false,
    sort: 'default',
};

/** Static-widget content (stored in block.config). */
export interface NoteConfig {
    text: string;
}
export interface LinkConfig {
    label: string;
    url: string;
    icon: string;
}
export interface AccountConfig {
    uin: string;
}

/** Allowed link-card icon ids (a curated lucide subset). */
export const LINK_ICON_IDS = [
    'link',
    'external',
    'github',
    'book',
    'server',
    'globe',
    'star',
    'bell',
] as const;
/** Max note length — kept under the server's 4096-byte block.config JSON cap. */
export const NOTE_MAX = 4000;

/** Widgets that expose a config form (gear) in the layout editor. */
export const CONFIGURABLE_WIDGETS = new Set([
    'alerts',
    'sessions',
    'host',
    'connections',
    'note',
    'link',
    'account',
]);

export function parseNoteConfig(config: Record<string, unknown> | undefined): NoteConfig {
    const c = config ?? {};
    return { text: typeof c.text === 'string' ? c.text.slice(0, NOTE_MAX) : '' };
}

// Only http(s) — never javascript:/data: (the url goes into an <a href>).
const SAFE_URL_RE = /^https?:\/\//i;

export function parseLinkConfig(config: Record<string, unknown> | undefined): LinkConfig {
    const c = config ?? {};
    const label = typeof c.label === 'string' ? c.label.slice(0, 60) : '';
    const url =
        typeof c.url === 'string' && SAFE_URL_RE.test(c.url.trim())
            ? c.url.trim().slice(0, 2048)
            : '';
    const icon =
        typeof c.icon === 'string' && (LINK_ICON_IDS as readonly string[]).includes(c.icon)
            ? c.icon
            : 'link';
    return { label, url, icon };
}

export function parseAccountConfig(config: Record<string, unknown> | undefined): AccountConfig {
    const c = config ?? {};
    const uin = typeof c.uin === 'string' ? c.uin.replace(/\D/g, '').slice(0, 15) : '';
    return { uin };
}

export function parseAlertsConfig(config: Record<string, unknown> | undefined): AlertsConfig {
    const c = config ?? {};
    const count =
        typeof c.count === 'number' && Number.isFinite(c.count)
            ? Math.min(50, Math.max(1, Math.trunc(c.count)))
            : DEFAULT_ALERTS_CONFIG.count;
    const levels = Array.isArray(c.levels)
        ? ALL_LOG_LEVELS.filter((l) => (c.levels as unknown[]).includes(l))
        : DEFAULT_ALERTS_CONFIG.levels;
    return { count, levels: levels.length > 0 ? levels : DEFAULT_ALERTS_CONFIG.levels };
}

export function parseSessionsConfig(config: Record<string, unknown> | undefined): SessionsConfig {
    const c = config ?? {};
    const sort =
        c.sort === 'uin' || c.sort === 'nickname' || c.sort === 'recent'
            ? c.sort
            : DEFAULT_SESSIONS_CONFIG.sort;
    const filter = typeof c.filter === 'string' ? c.filter.slice(0, 100) : '';
    return { sort, filter };
}

export function parseHostConfig(config: Record<string, unknown> | undefined): HostConfig {
    const c = config ?? {};
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    const cfg = {
        cpu: bool(c.cpu, true),
        memory: bool(c.memory, true),
        runtime: bool(c.runtime, true),
    };
    // Never let every panel be hidden — that leaves an empty card; fall back to all.
    return cfg.cpu || cfg.memory || cfg.runtime ? cfg : { ...DEFAULT_HOST_CONFIG };
}

export function parseConnectionsConfig(
    config: Record<string, unknown> | undefined,
): ConnectionsConfig {
    const c = config ?? {};
    const sort =
        c.sort === 'name' || c.sort === 'status' || c.sort === 'default'
            ? c.sort
            : DEFAULT_CONNECTIONS_CONFIG.sort;
    return {
        filter: typeof c.filter === 'string' ? c.filter.slice(0, 100) : '',
        onlyIssues: typeof c.onlyIssues === 'boolean' ? c.onlyIssues : false,
        sort,
    };
}
