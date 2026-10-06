import { describe, it, expect, vi } from 'vitest';

import { createQuoteChain } from '@/lib/providers/chain';
import { createEodhdQuoteProvider, normalizeEodhdQuote } from '@/lib/providers/eodhd';
import { createMoomooQuoteProvider, normalizeMoomooSnapshot } from '@/lib/providers/moomoo';
import type { MoomooClient } from 'moomoo-api';
import type { QuoteProvider } from '@/lib/providers/types';

function provider(
    id: string,
    fetchQuote: QuoteProvider['fetchQuote'],
    configured = true,
): QuoteProvider {
    return { id, isConfigured: () => configured, fetchQuote };
}

function silentConsoleError() {
    return vi.spyOn(console, 'error').mockImplementation(() => {});
}

describe('quote provider chain', () => {
    it('returns the first provider that can price the symbol', async () => {
        const getQuote = createQuoteChain([
            provider('a', async () => null),
            provider('b', async () => ({ c: 42 })),
            provider('c', async () => ({ c: 99 })),
        ]);

        expect(await getQuote('AAPL')).toEqual({ c: 42 });
    });

    it('fails over to the next provider on an HTTP error, without retrying', async () => {
        const failing = vi.fn().mockRejectedValue(new Error('failed: 429'));
        const getQuote = createQuoteChain([
            provider('a', failing),
            provider('b', async () => ({ c: 7 })),
        ]);

        const spy = silentConsoleError();
        expect(await getQuote('AAPL')).toEqual({ c: 7 });
        expect(failing).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it('skips unconfigured providers', async () => {
        const skipped = vi.fn();
        const getQuote = createQuoteChain([
            provider('a', skipped, false),
            provider('b', async () => ({ c: 3 })),
        ]);

        expect(await getQuote('AAPL')).toEqual({ c: 3 });
        expect(skipped).not.toHaveBeenCalled();
    });

    it('returns null when every provider declines', async () => {
        const getQuote = createQuoteChain([provider('a', async () => null)]);
        expect(await getQuote('NOPE')).toBeNull();
    });

    it('skips a provider that just failed until the cooldown passes', async () => {
        const failing = vi.fn().mockRejectedValue(new Error('boom'));
        const getQuote = createQuoteChain([provider('a', failing)], 60_000);

        const spy = silentConsoleError();
        expect(await getQuote('AAPL')).toBeNull();
        expect(await getQuote('AAPL')).toBeNull();
        expect(failing).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});

describe('normalizeEodhdQuote', () => {
    it('maps an EODHD real-time payload to the shared quote shape', () => {
        expect(normalizeEodhdQuote({
            code: 'AAPL.US',
            timestamp: 1729888080,
            open: 229.74,
            high: 233.22,
            low: 229.57,
            close: 231.41,
            previousClose: 230.57,
            change: 0.84,
            change_p: 0.3643,
        })).toEqual({
            c: 231.41,
            d: 0.84,
            dp: 0.3643,
            o: 229.74,
            h: 233.22,
            l: 229.57,
            pc: 230.57,
            t: 1729888080,
        });
    });

    it('returns null when the close price is missing or zero', () => {
        expect(normalizeEodhdQuote({})).toBeNull();
        expect(normalizeEodhdQuote({ close: 0 })).toBeNull();
        expect(normalizeEodhdQuote(null)).toBeNull();
        expect(normalizeEodhdQuote('not-json')).toBeNull();
    });
});

describe('EODHD provider', () => {
    const jsonFetch = (body: unknown, status = 200) => {
        const mock = vi.fn<typeof fetch>();
        // Only the parts of Response the provider reads are implemented.
        mock.mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
        return mock;
    };

    it('requests the .US ticker and parses the quote', async () => {
        const fetchImpl = jsonFetch({ close: 100, previousClose: 99, change: 1, change_p: 1.01 });
        const eodhd = createEodhdQuoteProvider({ apiKey: 'k', fetchImpl });

        expect(await eodhd.fetchQuote('AAPL', 0)).toEqual({
            c: 100, d: 1, dp: 1.01, o: undefined, h: undefined, l: undefined, pc: 99, t: undefined,
        });
        expect(String(fetchImpl.mock.calls[0][0])).toContain('/real-time/AAPL.US');
    });

    it('throws on an HTTP error instead of retrying, so the chain fails over', async () => {
        const fetchImpl = jsonFetch({}, 429);
        const eodhd = createEodhdQuoteProvider({ apiKey: 'k', fetchImpl });

        await expect(eodhd.fetchQuote('AAPL', 0)).rejects.toThrow('429');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('declines symbols it cannot map confidently, without a request', async () => {
        const fetchImpl = jsonFetch({ close: 1 });
        const eodhd = createEodhdQuoteProvider({ apiKey: 'k', fetchImpl });

        expect(await eodhd.fetchQuote('RELIANCE.NS', 0)).toBeNull();
        expect(await eodhd.fetchQuote('BINANCE:BTCUSDT', 0)).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('reports whether it is configured', () => {
        expect(createEodhdQuoteProvider({}).isConfigured()).toBe(false);
        expect(createEodhdQuoteProvider({ apiKey: 'k' }).isConfigured()).toBe(true);
    });
});

describe('normalizeMoomooSnapshot', () => {
    it('maps an OpenD snapshot to the shared quote shape', () => {
        expect(normalizeMoomooSnapshot({
            s2c: {
                snapshotList: [{
                    basic: {
                        curPrice: 189.5,
                        lastClosePrice: 188,
                        openPrice: 188.2,
                        highPrice: 190,
                        lowPrice: 187.5,
                        updateTimestamp: 1729888080,
                    },
                }],
            },
        })).toEqual({
            c: 189.5,
            d: 1.5,
            dp: (1.5 / 188) * 100,
            o: 188.2,
            h: 190,
            l: 187.5,
            pc: 188,
            t: 1729888080,
        });
    });

    it('returns null for an empty or malformed snapshot', () => {
        expect(normalizeMoomooSnapshot({ s2c: { snapshotList: [] } })).toBeNull();
        expect(normalizeMoomooSnapshot(null)).toBeNull();
        expect(normalizeMoomooSnapshot({ s2c: {} })).toBeNull();
    });
});

describe('moomoo provider', () => {
    const sdkReturning = (response: unknown, loginOk = true, seen: string[] = []) => async () => {
        class FakeWebsocket {
            onlogin: ((success: boolean, message?: unknown) => void) | null = null;
            start(host: string, port: number, ssl: boolean, key?: string) {
                seen.push([host, port, ssl, key].join('|'));
                queueMicrotask(() => this.onlogin?.(loginOk));
            }
            stop() {}
            async GetSecuritySnapshot() {
                return response;
            }
        }
        return { default: FakeWebsocket as unknown as new () => MoomooClient };
    };

    it('connects to OpenD and normalizes the snapshot', async () => {
        const moomoo = createMoomooQuoteProvider({
            host: '127.0.0.1',
            port: 11111,
            loadSdk: sdkReturning({ s2c: { snapshotList: [{ basic: { curPrice: 10, lastClosePrice: 9 } }] } }),
        });

        const quote = await moomoo.fetchQuote('AAPL', 0);
        // (loginOk defaults to true)
        expect(quote?.c).toBe(10);
        expect(quote?.pc).toBe(9);
    });

    it('connects with the configured host, port and websocket key', async () => {
        const seen: string[] = [];
        const moomoo = createMoomooQuoteProvider({
            host: '127.0.0.1',
            port: 33333,
            websocketKey: 'ws-key',
            loadSdk: sdkReturning({ s2c: { snapshotList: [{ basic: { curPrice: 10 } }] } }, true, seen),
        });

        await moomoo.fetchQuote('AAPL', 0);
        expect(seen[0]).toBe('127.0.0.1|33333|false|ws-key');
    });

    it('rejects when OpenD login fails, so the chain fails over', async () => {
        const moomoo = createMoomooQuoteProvider({
            host: '127.0.0.1',
            port: 11111,
            loadSdk: sdkReturning({}, false),
        });

        await expect(moomoo.fetchQuote('AAPL', 0)).rejects.toThrow('login failed');
    });

    it('declines symbols it cannot map confidently, without loading the SDK', async () => {
        const moomoo = createMoomooQuoteProvider({
            host: '127.0.0.1',
            port: 11111,
            loadSdk: () => {
                throw new Error('SDK must not load');
            },
        });

        expect(await moomoo.fetchQuote('RELIANCE.NS', 0)).toBeNull();
    });

    it('reports whether it is configured', () => {
        expect(createMoomooQuoteProvider({}).isConfigured()).toBe(false);
        expect(createMoomooQuoteProvider({ host: 'h', port: 1 }).isConfigured()).toBe(true);
    });
});
