import { describe, expect, it } from 'vitest';
import { connectionEndpoint } from '../src/lib/connection-endpoint';
import { translator } from '../src/i18n';

describe('connection endpoint copy', () => {
    const common = {
        name: 'test',
        messageFormat: 'array' as const,
        reportSelfMessage: false,
        accessToken: 'never-copy-this',
    };
    it('uses the browser-visible host for a wildcard listener', () => {
        const endpoint = connectionEndpoint(
            'wsServers',
            { ...common, host: '0.0.0.0', port: 3001, path: '/ws' },
            'https://server.example/settings',
        );
        expect(endpoint).toBe('ws://server.example:3001/ws');
        expect(endpoint).not.toContain(common.accessToken);
    });
    it('keeps explicit loopback bindings and handles IPv6', () => {
        expect(
            connectionEndpoint(
                'httpServers',
                { ...common, host: '::1', port: 3000 },
                'http://server.example/',
            ),
        ).toBe('http://[::1]:3000/');
        expect(
            connectionEndpoint(
                'wsServers',
                { ...common, host: '127.0.0.1', port: 3001 },
                'http://server.example/',
            ),
        ).toBe('ws://127.0.0.1:3001/');
    });
    it('never copies URL credentials or queries from outgoing adapters', () => {
        expect(
            connectionEndpoint(
                'wsClients',
                { ...common, url: 'wss://user:password@bot.example/ws?access_token=secret#x' },
                'http://localhost/',
            ),
        ).toBe('wss://bot.example/ws');
    });

    it('localizes an invalid-protocol error without relaxing protocol validation', () => {
        expect(() =>
            connectionEndpoint(
                'httpClients',
                { ...common, url: 'ftp://bot.example/' },
                'http://localhost/',
                translator('en'),
            ),
        ).toThrow('Invalid connection protocol');
    });
});
