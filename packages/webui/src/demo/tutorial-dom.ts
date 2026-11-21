import { tutorialControl, type TutorialSurface, type TutorialTarget } from './tutorial-lessons';

// Targets are compiled lesson definitions, never supplied by query strings or a parent.
export function findTutorialTarget(
    target: TutorialTarget,
    root: ParentNode = document,
): HTMLElement | null {
    for (const element of root.querySelectorAll<HTMLElement>(target.selector)) {
        if (element.closest('[hidden], [inert], [aria-hidden="true"]')) {
            continue;
        }

        const style = element.ownerDocument.defaultView?.getComputedStyle(element);

        if (style?.display === 'none' || style?.visibility === 'hidden') {
            continue;
        }

        // Sr-only radio/checkbox inputs highlight their real visible label instead.
        return element.matches('input[type="radio"], input[type="checkbox"]')
            ? (element.closest<HTMLElement>('label') ?? element)
            : element;
    }

    return null;
}

export function readTutorialSurface(root: ParentNode = document): TutorialSurface {
    const present = (selector: string) => findTutorialTarget({ selector }, root) !== null;
    const filter = root.querySelector<HTMLInputElement>(tutorialControl('log-search'));
    const logRows = root.querySelector(tutorialControl('log-entries'));
    const logs = present(`${tutorialControl('log-entries')} .cp-log-row`);
    return {
        console: present('.demo-console main .workspace-display-title'),
        process: present(`${tutorialControl('process-detail')} .cp-facts`),
        accountConfig: present('#config-panel-general'),
        httpConfig: present('#config-panel-httpServers'),
        logs,
        logFiltered:
            filter?.value.trim().toUpperCase() === 'DEMO' &&
            logs &&
            (logRows?.textContent?.includes('DEMO') ?? false),
        debug: present(tutorialControl('debug-run')),
        appearance: present(
            tutorialControl('motion-setting', '.demo-console [data-settings-tab="appearance"]'),
        ),
        service: present(tutorialControl('service-port')),
        storage: present(tutorialControl('storage-retention')),
        diagnostics:
            present(tutorialControl('copy-diagnostics')) &&
            present(tutorialControl('diagnostics-home')),
    };
}
