import type { ReactElement, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE_KERNEL_LABEL } from '@nowluma/common/kernel-display';
import { DEFAULT_APPEARANCE } from '@nowluma/common/webui-appearance';
import App from '../src/App';
import { KernelOnboardingStep } from '../src/components/kernel-onboarding-step';
import { KernelChoiceForm } from '../src/components/kernel-choice';
import { Dropdown } from '../src/components/interior/dropdown';
import { DisplayEffectsOnboardingStep } from '../src/components/display-effects';
import { buildRequiredOnboardingStepIds } from '../src/components/pages/onboarding-steps';
import { demoKernelCatalog, demoProcess } from '../src/demo/fixtures';
import type { ApiClient, KernelChoiceInput } from '../src/lib/api/types';
import type * as I18n from '../src/i18n';
import { elements, hookHost } from './helpers/hook-host';

const mocks = vi.hoisted(() => ({
    api: {
        status: vi.fn(),
        mustChangePassword: vi.fn(),
        me: vi.fn(),
        changePassword: vi.fn(),
        logout: vi.fn(),
        agreements: { get: vi.fn(), recordConsent: vi.fn() },
        kernel: { catalog: vi.fn(), get: vi.fn(), save: vi.fn() },
        processes: { list: vi.fn(), load: vi.fn(), refresh: vi.fn() },
    },
    runAction: vi.fn(async (_options: unknown, action: () => Promise<unknown>) => action()),
    next: vi.fn(),
    setAppearancePreview: vi.fn(),
    router: {
        history: {
            subscribe: vi.fn<(listener: () => void) => () => void>(() => vi.fn()),
            replace: vi.fn(),
            location: { pathname: '/', search: '', hash: '' },
        },
        navigate: vi.fn(),
    },
}));
vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()) }));
vi.mock('@/i18n', async (original) => {
    const locale = await original<typeof I18n>();
    return { ...locale, useT: () => locale.defaultTranslate };
});
vi.mock('@/lib/api', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useApi: () => mocks.api,
}));
vi.mock('@/contexts/ActionFeedbackContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useActionFeedback: () => ({ runAction: mocks.runAction }),
}));
vi.mock('@/contexts/ThemeContext', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useTheme: () => ({
        appearance: DEFAULT_APPEARANCE,
        setAppearancePreview: mocks.setAppearancePreview,
    }),
}));
vi.mock('@/components/interior/skeleton-swap', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useSkeletonSwap: () => ({ showSkeleton: false }),
}));
vi.mock('@/components/interior/wizard-steps', async (load) => ({
    ...(await load<Record<string, unknown>>()),
    useWizardNavigation: () => ({ next: mocks.next }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useFinePointer: () => false }));
vi.mock('@/router', () => ({ appRouter: mocks.router }));

const catalog = demoKernelCatalog();
const input: KernelChoiceInput = {
    kernel: 'compat',
    riskAccepted: true,
    riskVersion: catalog.riskVersion,
};
const selection = { ...input, acceptedAt: '2026-11-15T12:00:00.000Z' };
const agreements = {
    version: 'fixture-document-version',
    documents: [],
    consentRequired: false,
    consent: null,
};
let authHost: ReturnType<typeof hookHost>;
let gateHost: ReturnType<typeof hookHost>;
let stepHost: ReturnType<typeof hookHost>;
const named = (tree: ReactNode, name: string) =>
    elements(tree).find(
        (element) => typeof element.type === 'function' && element.type.name === name,
    );
const invoke = (element: ReactElement<Record<string, unknown>>) =>
    (element.type as (props: Record<string, unknown>) => ReactNode)(element.props);
const auth = () =>
    authHost.render(() =>
        invoke(named(App({ client: mocks.api as unknown as ApiClient }), 'AuthBoundary')!),
    );
const gate = (element: ReactElement<Record<string, unknown>>) =>
    gateHost.render(() => invoke(element)) as ReactElement<Record<string, unknown>>;
const step = (replay = false) => stepHost.render(() => KernelOnboardingStep({ replay }));

const settleCatalog = async (replay = false) => {
    step(replay);
    await vi.waitFor(() =>
        expect(
            elements(step(replay)).some(
                (element) =>
                    (element.props.catalog as { riskVersion?: string } | undefined)?.riskVersion ===
                    catalog.riskVersion,
            ),
        ).toBe(true),
    );
};

const form = () => elements(step()).find((element) => element.type === KernelChoiceForm)!;

const selectAccount = (uin: string) => {
    const dropdown = elements(step()).find((element) => element.type === Dropdown)!;
    (dropdown.props.onChange as (uin: string) => void)(uin);
    step();
};

beforeEach(() => {
    vi.clearAllMocks();
    authHost = hookHost();
    gateHost = hookHost();
    stepHost = hookHost();
    vi.stubGlobal('window', {
        location: { pathname: '/', search: '', hash: '', href: 'https://fixture.invalid/' },
        history: { state: null, replaceState: vi.fn() },
        sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    mocks.api.status.mockResolvedValue(true);
    mocks.api.mustChangePassword.mockResolvedValue(false);
    mocks.api.me.mockResolvedValue({ status: '已授权' });
    mocks.api.agreements.get.mockResolvedValue(agreements);
    mocks.api.kernel.catalog.mockResolvedValue(catalog);
    mocks.api.kernel.get.mockResolvedValue({
        selection: null,
        options: catalog.options,
        canLoad: false,
    });
    mocks.api.kernel.save.mockResolvedValue({ success: true, selection, canLoad: true });
    mocks.api.processes.list.mockResolvedValue([]);
});
afterEach(() => {
    authHost.unmount();
    gateHost.unmount();
    stepHost.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('AuthBoundary kernel onboarding activation', () => {
    it('does not append a wizard on an already configured authenticated tab', async () => {
        auth();
        await vi.waitFor(() => expect(named(auth(), 'RouterProvider')).toBeDefined());
        expect(named(auth(), 'OnboardingGate')).toBeUndefined();
        expect(mocks.api.kernel.catalog).not.toHaveBeenCalled();
        expect(mocks.api.processes.list).not.toHaveBeenCalled();
    });

    it('retains all four setup stages in order through document/password completion', async () => {
        mocks.api.agreements.get.mockResolvedValue({ ...agreements, consentRequired: true });
        mocks.api.mustChangePassword.mockResolvedValue(true);
        auth();
        await vi.waitFor(() => expect(named(auth(), 'OnboardingGate')).toBeDefined());
        let active = named(auth(), 'OnboardingGate')!;
        expect(active.props.needsConsent).toBe(true);
        expect(active.props.mustChangePassword).toBe(true);
        const wizard = gate(active);
        const additional = wizard.props.additionalSteps as {
            id: string;
            canSkip: boolean;
            hideAdvance: boolean;
            content: ReactElement;
        }[];
        expect(additional).toMatchObject([
            { id: 'display-effects', canSkip: false, hideAdvance: true },
            { id: 'kernel-choice', canSkip: false, hideAdvance: true },
        ]);
        expect([
            ...buildRequiredOnboardingStepIds({ needsConsent: true, mustChangePassword: true }),
            ...additional.map((entry) => entry.id),
        ]).toEqual(['agreements', 'password', 'display-effects', 'kernel-choice']);
        expect(additional[0].content.type).toBe(DisplayEffectsOnboardingStep);
        expect(additional[1].content.type).toBe(KernelOnboardingStep);
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        expect(mocks.api.processes.list).not.toHaveBeenCalled();

        (active.props.onConsentComplete as () => void)();
        active = named(auth(), 'OnboardingGate')!;
        (active.props.onPasswordComplete as () => void)();
        active = named(auth(), 'OnboardingGate')!;
        expect(active.props.needsConsent).toBe(false);
        expect(active.props.mustChangePassword).toBe(false);
        expect(gate(active).props.additionalSteps).toBe(additional);
        (active.props.onComplete as () => void)();
        expect(named(auth(), 'OnboardingGate')).toBeUndefined();
    });

    it('exiting a read-only replay does not clear real instruction/password requirements', async () => {
        Object.assign(window.location, {
            pathname: '/onboarding',
            search: '?mode=developer',
            href: 'https://fixture.invalid/onboarding?mode=developer',
        });
        mocks.api.agreements.get.mockResolvedValue({ ...agreements, consentRequired: true });
        mocks.api.mustChangePassword.mockResolvedValue(true);
        auth();
        await vi.waitFor(() => expect(named(auth(), 'OnboardingGate')).toBeDefined());
        (named(auth(), 'OnboardingGate')!.props.onComplete as () => void)();
        Object.assign(window.location, {
            pathname: '/',
            search: '',
            href: 'https://fixture.invalid/',
        });
        mocks.router.history.subscribe.mock.calls[0][0]();
        const live = named(auth(), 'OnboardingGate')!;
        expect(live.props.replay).toBe(false);
        expect(live.props.needsConsent).toBe(true);
        expect(live.props.mustChangePassword).toBe(true);
        expect(named(auth(), 'RouterProvider')).toBeUndefined();
        expect(mocks.api.processes.list).not.toHaveBeenCalled();
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
    });

    it('developer replay uses the existing rehearsal actions and a read-only kernel preview', async () => {
        Object.assign(window.location, {
            pathname: '/onboarding',
            search: '?mode=developer',
            href: 'https://fixture.invalid/onboarding?mode=developer',
        });
        auth();
        await vi.waitFor(() => expect(named(auth(), 'OnboardingGate')).toBeDefined());
        const active = named(auth(), 'OnboardingGate')!;
        expect(active.props.replay).toBe(true);
        const wizard = gate(active);
        const additional = wizard.props.additionalSteps as {
            content: ReactElement<{ replay: boolean }>;
        }[];
        expect(additional[0].content.props.replay).toBe(true);
        expect(additional[1].content.props.replay).toBe(true);
        expect(mocks.setAppearancePreview).toHaveBeenCalledWith({});
        expect(await (wizard.props.onAccept as () => Promise<unknown>)()).toEqual({
            success: true,
        });
        expect(
            await (
                wizard.props.submitPassword as (
                    oldPassword: string,
                    newPassword: string,
                ) => Promise<unknown>
            )('fixture-old', 'fixture-new'),
        ).toEqual({ success: true });
        await settleCatalog(true);
        expect(
            elements(step(true)).find((element) => element.type === KernelChoiceForm),
        ).toBeUndefined();
        expect(mocks.api.agreements.recordConsent).not.toHaveBeenCalled();
        expect(mocks.api.changePassword).not.toHaveBeenCalled();
        expect(mocks.api.processes.list).not.toHaveBeenCalled();
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
    });

    it('restores setup/replay presentation when the gate unmounts', async () => {
        Object.assign(window.location, { pathname: '/onboarding', search: '?mode=developer' });
        auth();
        await vi.waitFor(() => expect(named(auth(), 'OnboardingGate')).toBeDefined());
        gate(named(auth(), 'OnboardingGate')!);
        expect(mocks.setAppearancePreview).toHaveBeenLastCalledWith({});
        gateHost.unmount();
        expect(mocks.setAppearancePreview).toHaveBeenLastCalledWith(null);
        gateHost = hookHost();
    });
});

describe('KernelOnboardingStep account choice', () => {
    it('an accountless first run displays a catalog and continues without an implicit acknowledgment', async () => {
        await settleCatalog();
        expect(
            elements(step()).find((element) => element.type === KernelChoiceForm),
        ).toBeUndefined();
        expect(
            elements(step()).some((element) =>
                String(element.props.children).includes('QQ 登录后再为该账号选择'),
            ),
        ).toBe(true);
        const advance = elements(step()).find((element) => element.props.onClick === mocks.next)!;
        (advance.props.onClick as () => void)();
        expect(mocks.next).toHaveBeenCalledTimes(1);
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
    });

    it('stores an explicit detected account choice without loading or refreshing QQ', async () => {
        mocks.api.processes.list.mockResolvedValue([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
        ]);
        await settleCatalog();
        await vi.waitFor(() => expect(form()).toBeDefined());
        expect(form().props.uin).toBe('10001');
        await (form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>)(input);
        expect(mocks.api.kernel.save).toHaveBeenCalledWith('10001', input, expect.any(AbortSignal));
        expect(mocks.next).toHaveBeenCalledTimes(1);
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.processes.refresh).not.toHaveBeenCalled();
    });

    it('preserves a saved account selection instead of invalidating it on setup', async () => {
        mocks.api.processes.list.mockResolvedValue([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
        ]);
        mocks.api.kernel.get.mockResolvedValue({
            selection,
            options: catalog.options,
            canLoad: true,
        });
        await settleCatalog();
        await vi.waitFor(() =>
            expect(elements(step()).some((element) => element.props.onClick === mocks.next)).toBe(
                true,
            ),
        );
        expect(form()).toBeUndefined();
        expect(
            elements(step()).some((element) =>
                String(element.props.children).includes(NATIVE_KERNEL_LABEL),
            ),
        ).toBe(true);
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
    });

    it('does not let a late account A policy response preselect or authorize account B', async () => {
        mocks.api.processes.list.mockResolvedValue([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
            { ...demoProcess(), pid: 4243, account: { uin: '20002', nickname: 'B' } },
        ]);
        let finishA!: (value: unknown) => void;
        mocks.api.kernel.get.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishA = resolve;
                }),
        );
        await settleCatalog();
        expect(mocks.api.kernel.get).not.toHaveBeenCalled();
        selectAccount('10001');
        selectAccount('20002');
        finishA({ selection, options: catalog.options, canLoad: true });
        await vi.waitFor(() => expect(form()?.props.uin).toBe('20002'));
        expect(form().key).toContain('20002');
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.next).not.toHaveBeenCalled();
    });

    it.each([
        new Error('策略存储失败'),
        { success: false },
        { success: true, canLoad: true, selection: { ...selection, riskVersion: 'old' } },
    ])('does not complete on a failed/unconfirmed save (%j)', async (failure) => {
        mocks.api.processes.list.mockResolvedValue([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
        ]);

        if (failure instanceof Error) {
            mocks.api.kernel.save.mockRejectedValueOnce(failure);
        } else {
            mocks.api.kernel.save.mockResolvedValueOnce(failure);
        }

        await settleCatalog();
        await vi.waitFor(() => expect(form()).toBeDefined());
        await expect(
            (form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>)(input),
        ).rejects.toThrow();
        expect(mocks.next).not.toHaveBeenCalled();
        expect(mocks.api.processes.load).not.toHaveBeenCalled();
        expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
    });

    it.each(['unmount', 'account switch'])(
        'a captured form callback after %s cannot start a save',
        async (change) => {
            mocks.api.processes.list.mockResolvedValue([
                { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
                { ...demoProcess(), pid: 4243, account: { uin: '20002', nickname: 'B' } },
            ]);
            await settleCatalog();
            selectAccount('10001');
            await vi.waitFor(() => expect(form()).toBeDefined());
            const confirm = form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>;
            mocks.api.processes.list.mockClear();

            if (change === 'unmount') {
                stepHost.unmount();
            } else {
                selectAccount('20002');
            }

            await expect(confirm(input)).rejects.toMatchObject({ status: 400 });
            expect(mocks.api.processes.list).not.toHaveBeenCalled();
            expect(mocks.api.kernel.save).not.toHaveBeenCalled();
            expect(mocks.next).not.toHaveBeenCalled();
        },
    );

    it('a stale save exposes explicit reload and resets the form to the fresh risk version without another POST', async () => {
        mocks.api.processes.list.mockResolvedValue([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
        ]);
        mocks.api.kernel.save.mockRejectedValueOnce(
            new Error('风险说明版本已更新，请重新阅读并确认'),
        );
        await settleCatalog();
        await vi.waitFor(() => expect(form()).toBeDefined());
        await expect(
            (form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>)(input),
        ).rejects.toThrow('风险说明版本已更新');
        expect(
            elements(step()).find((element) => element.props.role === 'alert')?.props.children,
        ).toContain('风险说明版本已更新');
        const reload = elements(step()).find((element) => element.props.children === '重新加载')!;
        mocks.api.kernel.catalog.mockResolvedValue({ ...catalog, riskVersion: 'fixture-new-risk' });
        (reload.props.onClick as () => void)();
        step();
        await vi.waitFor(() =>
            expect(
                (form()?.props.catalog as { riskVersion?: string } | undefined)?.riskVersion,
            ).toBe('fixture-new-risk'),
        );
        expect(form().key).toContain('fixture-new-risk');
        expect(mocks.api.kernel.save).toHaveBeenCalledTimes(1);
        expect(mocks.next).not.toHaveBeenCalled();
    });

    it('rechecks the detected account before a save and stops after an account disappears', async () => {
        mocks.api.processes.list
            .mockResolvedValueOnce([{ ...demoProcess(), account: { uin: '10001', nickname: 'A' } }])
            .mockResolvedValue([]);
        await settleCatalog();
        await vi.waitFor(() => expect(form()).toBeDefined());
        await expect(
            (form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>)(input),
        ).rejects.toThrow('QQ 账号已变化');
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.next).not.toHaveBeenCalled();
    });

    it('unmount aborts the fresh account check so its late result never saves or advances', async () => {
        mocks.api.processes.list.mockResolvedValueOnce([
            { ...demoProcess(), account: { uin: '10001', nickname: 'A' } },
        ]);
        await settleCatalog();
        await vi.waitFor(() => expect(form()).toBeDefined());
        let finish!: (value: unknown) => void;
        mocks.api.processes.list.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const saving = (form().props.onConfirm as (input: KernelChoiceInput) => Promise<void>)(
            input,
        );
        stepHost.unmount();
        finish([{ ...demoProcess(), account: { uin: '10001', nickname: 'A' } }]);
        await expect(saving).rejects.toMatchObject({ name: 'AbortError' });
        expect(mocks.api.kernel.save).not.toHaveBeenCalled();
        expect(mocks.next).not.toHaveBeenCalled();
    });
});
