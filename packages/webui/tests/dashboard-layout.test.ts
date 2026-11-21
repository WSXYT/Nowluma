import { describe, expect, it } from 'vitest';
import {
    defaultOverviewGrid,
    defaultOverviewMobile,
    GRID_COLS,
    GRID_WIDGETS,
    migrateOverviewBlocks,
    STAT_TILE_IDS,
    widgetLabel,
} from '../src/lib/dashboard-layout';

describe('migrateOverviewBlocks', () => {
    it('preserves saved widget configuration while restoring the grid', () => {
        const migrated = migrateOverviewBlocks([
            {
                id: 'account',
                visible: true,
                x: 8,
                y: 14,
                w: 4,
                h: 1,
                config: { uin: '123456789' },
            },
        ]);
        expect(migrated.find((item) => item.id === 'account')).toEqual({
            id: 'account',
            visible: true,
            x: 8,
            y: 14,
            w: 4,
            h: 1,
            config: { uin: '123456789' },
        });
    });

    it('keeps saved placement and visibility when the default composition changes', () => {
        const saved = {
            id: 'connections',
            visible: false,
            x: 5,
            y: 9,
            w: 6,
            h: 5,
            config: { onlyIssues: true, filter: 'fixture', sort: 'status' },
        };
        const migrated = migrateOverviewBlocks([saved]);
        expect(migrated.find((item) => item.id === saved.id)).toEqual(saved);
        expect(migrated.find((item) => item.id === saved.id)).not.toBe(saved);
    });

    it('retains the legacy summary visibility while expanding its instruments', () => {
        const hidden = migrateOverviewBlocks([{ id: 'stats', visible: false }]);

        for (const id of STAT_TILE_IDS) {
            expect(hidden.find((item) => item.id === id)?.visible).toBe(false);
        }

        const overridden = migrateOverviewBlocks([
            { id: 'stats', visible: false },
            { id: 'stat:host', visible: true, x: 4, y: 10, w: 4, h: 1 },
        ]);
        expect(overridden.find((item) => item.id === 'stat:host')).toMatchObject({
            visible: true,
            x: 4,
            y: 10,
            w: 4,
            h: 1,
        });
    });
});

describe('workspace defaults', () => {
    it('localizes known card labels without changing persisted or unknown IDs', () => {
        const en = (_zh: string, translated: string) => translated;
        expect(widgetLabel('stat:processes')).toBe('QQ 程序');
        expect(widgetLabel('stat:processes', en)).toBe('QQ processes');
        expect(widgetLabel('local:external', en)).toBe('local:external');
        expect(defaultOverviewGrid().find((item) => item.id === 'stat:processes')).toBeDefined();
    });

    it('fits visible widgets in the grid without overlapping their work areas', () => {
        const blocks = defaultOverviewGrid().filter((item) => item.visible);

        for (const [index, item] of blocks.entries()) {
            const spec = GRID_WIDGETS.find((entry) => entry.id === item.id)!;
            expect(item.x! + item.w!).toBeLessThanOrEqual(GRID_COLS);
            expect(item.x).toBeGreaterThanOrEqual(0);
            expect(item.y).toBeGreaterThanOrEqual(0);
            expect(item.w).toBeGreaterThanOrEqual(spec.minW);
            expect(item.h).toBeGreaterThanOrEqual(spec.minH);

            for (const other of blocks.slice(index + 1)) {
                const overlaps =
                    item.x! < other.x! + other.w! &&
                    item.x! + item.w! > other.x! &&
                    item.y! < other.y! + other.h! &&
                    item.y! + item.h! > other.y!;
                expect(overlaps, `${item.id} overlaps ${other.id}`).toBe(false);
            }
        }
    });

    it('keeps all widgets available with connection and activity first on mobile', () => {
        const desktop = defaultOverviewGrid();
        const mobile = defaultOverviewMobile();
        expect(mobile.slice(0, 5).map((item) => item.id)).toEqual([
            'stat:status',
            'connections',
            'alerts',
            'sessions',
            'host',
        ]);
        expect(mobile.map((item) => item.id).sort()).toEqual(desktop.map((item) => item.id).sort());
        expect(new Set(mobile.map((item) => item.id)).size).toBe(desktop.length);

        for (const id of ['note', 'link', 'account', 'deliveries']) {
            expect(desktop.find((item) => item.id === id)?.visible).toBe(false);
            expect(mobile.find((item) => item.id === id)?.visible).toBe(false);
        }
    });
});
