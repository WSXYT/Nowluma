import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoApi } from '../src/demo/api';
import { DEMO_NEW_PASSWORD, DEMO_PASSWORD, DEMO_PID, DEMO_UIN } from '../src/demo/constants';
import { TutorialGuide } from '../src/demo/TutorialGuide';
import {
    TUTORIAL_LESSONS,
    tutorialStepComplete,
    type TutorialSurface,
} from '../src/demo/tutorial-lessons';
import {
    parseTutorialOptions,
    tutorialSearch,
    TUTORIAL_IDS,
    type TutorialId,
} from '../src/demo/tutorial-options';
import { createApiClient } from '../src/lib/api/client';
import { findTutorialTarget } from '../src/demo/tutorial-dom';

const emptySurface: TutorialSurface = {
    console: false,
    process: false,
    accountConfig: false,
    httpConfig: false,
    logs: false,
    logFiltered: false,
    debug: false,
    appearance: false,
    service: false,
    storage: false,
    diagnostics: false,
};

function session(id: TutorialId) {
    const api = new DemoApi();
    let token = api.resetTutorial(TUTORIAL_LESSONS[id].baseline);
    vi.stubGlobal('fetch', api.fetch);
    const client = createApiClient({
        tokenStore: {
            load: () => token,
            save: (next) => {
                token = next;
            },
        },
    });
    return { api, client };
}

afterEach(() => vi.unstubAllGlobals());

describe('strict chapter URL contract', () => {
    it('accepts exactly the chapter IDs and canonical safe options', () => {
        for (const id of TUTORIAL_IDS) {
            const options = parseTutorialOptions(`?tutorial=${id}&lang=en&embed=1`);
            expect(options).toEqual({ tutorial: id, lang: 'en', embed: true });
            expect(tutorialSearch(options)).toBe(`?tutorial=${id}&lang=en&embed=1`);
        }
    });

    it('never admits selectors, URLs, secrets, duplicate values or approximate IDs', () => {
        for (const bad of [
            'https://evil.invalid/',
            '//evil.invalid',
            '#login-password',
            '../first-run',
            'FIRST-RUN',
            'first-run ',
            'constructor',
            '__proto__',
            '',
        ]) {
            expect(
                parseTutorialOptions(`?tutorial=${encodeURIComponent(bad)}`).tutorial,
            ).toBeUndefined();
        }

        const safe = parseTutorialOptions(
            '?tutorial=debug&lang=en&embed=1&token=secret&password=secret&url=https://evil.invalid&selector=body',
        );
        expect(Object.keys(safe).sort()).toEqual(['embed', 'lang', 'tutorial']);
        expect(tutorialSearch(safe)).toBe('?tutorial=debug&lang=en&embed=1');
        expect(
            parseTutorialOptions('?tutorial=debug&tutorial=logs&lang=en&lang=zh&embed=1&embed=1'),
        ).toEqual({ lang: 'zh', embed: false });
        expect(parseTutorialOptions('?tutorial=logs&lang=en-US&embed=true')).toEqual({
            tutorial: 'logs',
            lang: 'zh',
            embed: false,
        });
    });
});

describe('chapter baselines and genuine state proof', () => {
    it('resets every chapter to its own isolated baseline without risk acceptance or prior effects', async () => {
        const api = new DemoApi();

        for (const id of TUTORIAL_IDS) {
            const lesson = TUTORIAL_LESSONS[id];
            const token = api.resetTutorial(lesson.baseline);
            expect(api.tutorialSnapshot).toMatchObject({
                authenticated: lesson.baseline !== 'clean',
                consent: lesson.baseline !== 'clean',
                mustChange: lesson.baseline === 'clean',
                online: lesson.baseline === 'ready',
                kernelAccepted: false,
                configSaved: false,
                appearanceSaved: false,
                serviceSaved: false,
                storageSaved: false,
                backupExported: false,
                traceExported: false,
                sentMessageId: null,
                inspectedMessageId: null,
                stopped: false,
                messages: 1,
                logRetainDays: 7,
                logsBytes: 65536,
            });

            if (token) {
                const response = await api.fetch(`/api/kernel/accounts/${DEMO_UIN}`, {
                    headers: { 'X-Nowluma-Token': token },
                });
                expect(await response.json()).toMatchObject({ selection: null, canLoad: false });
                await api.fetch('/api/system/backup/export', {
                    headers: { 'X-Nowluma-Token': token },
                });
                expect(api.tutorialSnapshot.backupExported).toBe(true);
            }
        }

        const other = new DemoApi();
        expect(other.summary.authenticated).toBe(false);
        expect(other.tutorialSnapshot.backupExported).toBe(false);
        api.reset();
    });

    it('starts first-run at real login, then requires accepted consent and password changes', async () => {
        const { api, client } = session('first-run');
        expect(tutorialStepComplete('login', api.tutorialSnapshot, emptySurface)).toBe(false);
        await expect(client.login('incorrect')).resolves.toMatchObject({ ok: false });
        expect(tutorialStepComplete('login', api.tutorialSnapshot, emptySurface)).toBe(false);
        await client.login(DEMO_PASSWORD);
        expect(tutorialStepComplete('login', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('consent', api.tutorialSnapshot, emptySurface)).toBe(false);
        await client.agreements.recordConsent('demo-v1');
        expect(tutorialStepComplete('consent', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('password', api.tutorialSnapshot, emptySurface)).toBe(false);
        await client.changePassword(DEMO_PASSWORD, DEMO_NEW_PASSWORD);
        expect(tutorialStepComplete('password', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('appearance', api.tutorialSnapshot, emptySurface)).toBe(false);
        expect(tutorialStepComplete('console', api.tutorialSnapshot, emptySurface)).toBe(false);
        api.reset();
    });

    it('does not count a load attempt, saved kernel choice or cancel as a connected outcome', async () => {
        const { api, client } = session('qq-connection');
        await expect(client.processes.load(DEMO_PID)).rejects.toMatchObject({ status: 409 });
        expect(tutorialStepComplete('kernel', api.tutorialSnapshot, emptySurface)).toBe(false);
        expect(
            tutorialStepComplete('online', api.tutorialSnapshot, {
                ...emptySurface,
                process: true,
            }),
        ).toBe(false);
        const catalog = await client.kernel.catalog();
        await expect(
            client.kernel.save(DEMO_UIN, {
                kernel: 'compat',
                riskAccepted: false,
                riskVersion: catalog.riskVersion,
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(api.tutorialSnapshot.kernelAccepted).toBe(false);
        await client.kernel.save(DEMO_UIN, {
            kernel: 'compat',
            riskAccepted: true,
            riskVersion: catalog.riskVersion,
        });
        expect(tutorialStepComplete('kernel', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(
            tutorialStepComplete('online', api.tutorialSnapshot, {
                ...emptySurface,
                process: true,
            }),
        ).toBe(false);
        await client.processes.load(DEMO_PID);
        expect(
            tutorialStepComplete('online', api.tutorialSnapshot, {
                ...emptySurface,
                process: true,
            }),
        ).toBe(true);
        await client.processes.unload(DEMO_PID);
        expect(tutorialStepComplete('stopped', api.tutorialSnapshot, emptySurface)).toBe(true);
        await client.processes.refresh(DEMO_PID);
        expect(api.summary).toMatchObject({ online: false, stopped: true });
        api.resetTutorial('detected');
        expect(api.tutorialSnapshot).toMatchObject({
            online: false,
            kernelAccepted: false,
            stopped: false,
        });
        api.reset();
    });

    it('requires a successful send and a lookup of that result, not the seeded message or failed request', async () => {
        const { api, client } = session('debug');
        await client.debug.invoke(DEMO_UIN, 'get_msg', { message_id: 100 });
        expect(tutorialStepComplete('message-inspected', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.debug.invoke(DEMO_UIN, 'send_private_msg', { user_id: 99, message: '' });
        expect(tutorialStepComplete('message-sent', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.debug.invoke(DEMO_UIN, 'send_group_msg', { group_id: 20001, message: '#nl' });
        await client.debug.invoke(DEMO_UIN, 'send_private_msg', {
            user_id: 10002,
            message: 'different sample',
        });
        expect(tutorialStepComplete('message-sent', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.debug.invoke(DEMO_UIN, 'send_private_msg', { user_id: 10002, message: '#nl' });
        expect(tutorialStepComplete('message-sent', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('message-inspected', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.debug.invoke(DEMO_UIN, 'get_msg', { message_id: 999 });
        expect(tutorialStepComplete('message-inspected', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.debug.invoke(DEMO_UIN, 'get_msg', {
            message_id: api.tutorialSnapshot.sentMessageId,
        });
        expect(tutorialStepComplete('message-inspected', api.tutorialSnapshot, emptySurface)).toBe(
            true,
        );
        api.resetTutorial('ready');
        expect(api.tutorialSnapshot).toMatchObject({
            sentMessageId: null,
            inspectedMessageId: null,
            messages: 1,
        });
        api.reset();
    });

    it('does not advance on failed writes, unsaved values, navigation or conceptual reading alone', async () => {
        const { api, client } = session('onebot-config');
        const config = await client.config.get(DEMO_UIN);
        api.failNextMutation = true;
        await expect(client.config.save(DEMO_UIN, config)).rejects.toMatchObject({ status: 503 });
        expect(tutorialStepComplete('config-saved', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.config.save(DEMO_UIN, config);
        expect(tutorialStepComplete('config-saved', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('http-config', api.tutorialSnapshot, emptySurface)).toBe(false);
        expect(
            tutorialStepComplete('http-config', api.tutorialSnapshot, {
                ...emptySurface,
                httpConfig: true,
            }),
        ).toBe(true);
        expect(tutorialStepComplete('service-saved', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        expect(
            tutorialStepComplete(
                'storage-saved',
                { ...api.tutorialSnapshot, logRetainDays: 14 },
                emptySurface,
            ),
        ).toBe(false);
        expect(
            tutorialStepComplete(
                'logs-cleaned',
                { ...api.tutorialSnapshot, logsBytes: 0 },
                emptySurface,
            ),
        ).toBe(false);
        expect(
            tutorialStepComplete('reading', api.tutorialSnapshot, {
                ...emptySurface,
                console: true,
            }),
        ).toBe(false);
        api.reset();
    });

    it('revokes uncompleted operational proof when the visible result is undone', () => {
        const { api } = session('qq-connection');
        const online = { ...api.tutorialSnapshot, online: true };
        expect(tutorialStepComplete('online', online, { ...emptySurface, process: true })).toBe(
            true,
        );
        expect(
            tutorialStepComplete(
                'online',
                { ...online, online: false },
                { ...emptySurface, process: true },
            ),
        ).toBe(false);
        expect(tutorialStepComplete('online', online, emptySurface)).toBe(false);
        expect(
            tutorialStepComplete('log-filter', online, { ...emptySurface, logFiltered: true }),
        ).toBe(true);
        expect(
            tutorialStepComplete('log-filter', online, { ...emptySurface, logFiltered: false }),
        ).toBe(false);
        api.reset();
    });

    it.each(['清理', 'Clean up'])('locates the one visible logs cleanup control (%s)', (label) => {
        const makeButton = (marker: string | null, hidden = false) => ({
            marker,
            textContent: label,
            closest: () => (hidden ? {} : null),
            ownerDocument: { defaultView: null },
            matches: () => false,
        });
        const logs = makeButton('storage-clean-logs');
        const buttons = [
            makeButton('storage-clean-media'),
            makeButton(null),
            makeButton('storage-clean-logs', true),
            logs,
        ];
        const root = {
            querySelectorAll: (selector: string) =>
                buttons.filter(
                    (button) =>
                        selector === `.demo-console [data-tutorial-control="${button.marker}"]`,
                ),
        } as unknown as ParentNode;
        const step = TUTORIAL_LESSONS['data-backup'].steps.find((item) => item.id === 'cleanup')!;
        expect(findTutorialTarget(step.target, root)).toBe(logs);
    });

    it('requires accepted service, retention, cleanup and export outcomes, and excludes layout-only saves', async () => {
        const { api, client } = session('data-backup');
        const write = (path: string, body: unknown) =>
            client.request(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        await write('/api/ui', { layout: {} });
        expect(tutorialStepComplete('appearance', api.tutorialSnapshot, emptySurface)).toBe(false);
        await write('/api/ui', { appearance: { disableMotion: true } });
        expect(tutorialStepComplete('appearance', api.tutorialSnapshot, emptySurface)).toBe(true);
        await write('/api/system/settings', { webuiPort: 5099 });
        expect(tutorialStepComplete('service-saved', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await write('/api/system/settings', { webuiPort: 5100 });
        expect(tutorialStepComplete('service-saved', api.tutorialSnapshot, emptySurface)).toBe(
            true,
        );
        await write('/api/system/settings', { webuiPort: 5099 });
        expect(tutorialStepComplete('service-saved', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await write('/api/system/storage/settings', {
            logMaxTotalMb: 256,
            logRetainDays: 7,
            logPerUin: true,
        });
        expect(tutorialStepComplete('storage-saved', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await write('/api/system/storage/settings', {
            logMaxTotalMb: 256,
            logRetainDays: 14,
            logPerUin: true,
        });
        expect(tutorialStepComplete('storage-saved', api.tutorialSnapshot, emptySurface)).toBe(
            true,
        );
        expect(tutorialStepComplete('logs-cleaned', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await write('/api/system/storage/cleanup', { scope: 'logs' });
        expect(tutorialStepComplete('logs-cleaned', api.tutorialSnapshot, emptySurface)).toBe(true);
        expect(tutorialStepComplete('backup-export', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.request('/api/system/backup/export');
        expect(tutorialStepComplete('backup-export', api.tutorialSnapshot, emptySurface)).toBe(
            true,
        );
        expect(tutorialStepComplete('trace-export', api.tutorialSnapshot, emptySurface)).toBe(
            false,
        );
        await client.request('/api/logs/export/trace');
        expect(tutorialStepComplete('trace-export', api.tutorialSnapshot, emptySurface)).toBe(true);
        api.resetTutorial('ready');
        expect(api.tutorialSnapshot).toMatchObject({
            appearanceSaved: false,
            serviceSaved: false,
            storageSaved: false,
            backupExported: false,
            traceExported: false,
            cleanupScope: null,
        });
        api.reset();
    });

    it('keeps operational Continue disabled at login and exposes acknowledgement only on reading steps', () => {
        const api = new DemoApi();
        const props = {
            api,
            language: 'en' as const,
            open: true,
            onClose: () => {},
            onRestart: () => {},
            onNavigate: () => {},
        };
        const operational = renderToStaticMarkup(
            <TutorialGuide {...props} lesson={TUTORIAL_LESSONS['first-run']} />,
        );
        expect(operational).toMatch(/disabled=""[^>]*data-tutorial-continue="true"/);
        expect(operational).toContain('data-tutorial-step="login"');
        expect(operational).not.toContain('I understand, continue');
        const reading = renderToStaticMarkup(
            <TutorialGuide {...props} lesson={TUTORIAL_LESSONS['install-native']} />,
        );
        expect(reading).toContain('I understand, continue');
        expect(reading).toContain('does not install software');
        api.reset();
    });
});
