import { defaultTranslate, type Translate } from '@/i18n';
import type { NetworkKind, OneBotNetworks } from '@/types';

/** Endpoint-only copy: never include an access token, credentials or URL query parameters. */
export function connectionEndpoint(
    kind: NetworkKind,
    item: OneBotNetworks[NetworkKind][number],
    pageUrl: string,
    t: Translate = defaultTranslate,
): string {
    let url: URL;

    if ('port' in item) {
        const bindHost = item.host?.trim() || '0.0.0.0';
        const host = ['0.0.0.0', '::', '[::]'].includes(bindHost)
            ? new URL(pageUrl).hostname
            : bindHost;
        const formattedHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
        const protocol = kind === 'wsServers' ? 'ws' : 'http';
        url = new URL(`${protocol}://${formattedHost}:${item.port}${item.path || '/'}`);
    } else {
        url = new URL(item.url);
    }

    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
        throw new Error(t('无效的连接协议', 'Invalid connection protocol'));
    }

    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.href;
}
