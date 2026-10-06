import MoomooWebsocket, { type MoomooClient } from "moomoo-api";
import { isInternationalSymbol } from "@/lib/utils";
import { toNumber, toRecord } from "./parse";
import { cachedQuote } from "./quote-cache";
import type { ProviderQuote, QuoteProvider } from "./types";

const REQUEST_TIMEOUT_MS = 5000;
const LOGIN_TIMEOUT_MS = 5000;
// Qot_Common.QotMarket.QotMarket_US_Security
const US_MARKET = 11;

type MoomooSdkModule = { default: new () => MoomooClient };

export type MoomooConfig = {
    host?: string;
    port?: number;
    ssl?: boolean;
    /** Plaintext key for OpenD's WebSocket service; required when its config sets websocket_key_md5. */
    websocketKey?: string;
    /** Injectable for tests; defaults to the official `moomoo-api` SDK. */
    loadSdk?: () => Promise<MoomooSdkModule>;
};

// OpenD answers with `{ s2c: { snapshotList: [{ basic: { curPrice, ... } }] } }`.
export function normalizeMoomooSnapshot(raw: unknown): ProviderQuote | null {
    const snapshotList = toRecord(toRecord(raw)?.s2c)?.snapshotList;
    const basic = toRecord(toRecord(Array.isArray(snapshotList) ? snapshotList[0] : undefined)?.basic);
    if (!basic) return null;

    const c = toNumber(basic.curPrice);
    if (c === undefined || c <= 0) return null;

    const pc = toNumber(basic.lastClosePrice);
    const d = pc !== undefined && pc > 0 ? c - pc : undefined;
    return {
        c,
        d,
        dp: d !== undefined && pc !== undefined && pc > 0 ? (d / pc) * 100 : undefined,
        o: toNumber(basic.openPrice),
        h: toNumber(basic.highPrice),
        l: toNumber(basic.lowPrice),
        pc,
        t: toNumber(basic.updateTimestamp),
    };
}

// OpenD takes the bare ticker plus a market id (`{ market: 11, code: "AAPL" }`). Only US
// listings are mapped here; other markets need a market id the app does not resolve yet.
function toMoomooCode(symbol: string): string | null {
    const upper = symbol.trim().toUpperCase();
    if (!upper || upper.includes(":") || isInternationalSymbol(upper)) return null;
    return upper;
}

// The SDK rejects with the decoded protobuf response for protocol errors (an unknown
// symbol, a missing quote right) and with a string or Error for transport failures. Only
// the latter means the socket is gone.
function isTransportFailure(error: unknown): boolean {
    return typeof error === "string" || error instanceof Error;
}

export function createMoomooQuoteProvider(config: MoomooConfig): QuoteProvider {
    const loadSdk = config.loadSdk ?? (() => Promise.resolve({ default: MoomooWebsocket }));

    // One logged-in connection per provider, reused for every quote. A login per quote
    // costs seconds, and OpenD refuses the burst of clients that a page of quotes
    // produces; the SDK correlates responses per request, so one socket serves many.
    let connection: { client: MoomooClient; ready: Promise<void> } | null = null;
    let connecting: Promise<MoomooClient> | null = null;

    const closeConnection = () => {
        const current = connection;
        connection = null;
        if (!current) return;
        try {
            // stop() only unregisters the push callback; websock.close() also suppresses
            // the SDK's auto-reconnect.
            current.client.stop();
            current.client.websock?.close();
        } catch {
            // Closing a connection that is already gone is not worth surfacing.
        }
    };

    const establish = async (): Promise<MoomooClient> => {
        const { default: MoomooWebsocketClient } = await loadSdk();
        const client = new MoomooWebsocketClient();
        const { promise, resolve, reject } = Promise.withResolvers<void>();
        const timer = setTimeout(
            () => reject(new Error("moomoo: OpenD login timeout")),
            LOGIN_TIMEOUT_MS,
        );
        // The SDK calls onlogin(true, response) on success and onlogin(false, error) on failure.
        client.onlogin = (success) => {
            clearTimeout(timer);
            if (success) resolve();
            else reject(new Error("moomoo: OpenD login failed"));
        };

        connection = { client, ready: promise };
        try {
            client.start(config.host!, config.port!, config.ssl ?? false, config.websocketKey);
            await promise;
        } catch (error) {
            closeConnection();
            throw error;
        }
        return client;
    };

    // Concurrent callers share one login; a failed attempt is not retried here, it just
    // fails the current quote over to the next provider.
    const connect = (): Promise<MoomooClient> => {
        const existing = connection;
        if (existing) return existing.ready.then(() => existing.client);
        connecting ??= establish().finally(() => {
            connecting = null;
        });
        return connecting;
    };

    return {
        id: "moomoo",
        isConfigured: () => Boolean(config.host && config.port),
        async fetchQuote(symbol, revalidateSeconds) {
            const code = toMoomooCode(symbol);
            if (!code || !config.host || !config.port) return null;

            return cachedQuote(`moomoo:${code}`, revalidateSeconds, async () => {
                const client = await connect();
                try {
                    // One attempt, no retries: any error fails over to the next provider.
                    const response = await withTimeout(
                        client.GetSecuritySnapshot({
                            c2s: { securityList: [{ market: US_MARKET, code }] },
                        }),
                    );
                    return normalizeMoomooSnapshot(response);
                } catch (error) {
                    if (isTransportFailure(error)) closeConnection();
                    throw error;
                }
            });
        },
    };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
    const { promise: timedOut, reject } = Promise.withResolvers<never>();
    const timer = setTimeout(
        () => reject(new Error("moomoo: request timeout")),
        REQUEST_TIMEOUT_MS,
    );
    return Promise.race([promise, timedOut]).finally(() => clearTimeout(timer));
}
