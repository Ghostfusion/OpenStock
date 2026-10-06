import type { MoomooClient } from "moomoo-api";
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
    /** Injectable for tests; defaults to importing the official `moomoo-api` SDK. */
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

// OpenD needs a market-qualified code. Only US (`US.AAPL`) is resolved here; other
// markets use a different prefix (HK., SG., ...) the app does not map yet.
function toMoomooCode(symbol: string): string | null {
    const upper = symbol.trim().toUpperCase();
    if (!upper || upper.includes(":") || isInternationalSymbol(upper)) return null;
    return upper;
}

export function createMoomooQuoteProvider(config: MoomooConfig): QuoteProvider {
    const loadSdk = config.loadSdk ?? (() => import("moomoo-api"));

    return {
        id: "moomoo",
        isConfigured: () => Boolean(config.host && config.port),
        async fetchQuote(symbol, revalidateSeconds) {
            const code = toMoomooCode(symbol);
            if (!code || !config.host || !config.port) return null;

            return cachedQuote(`moomoo:${code}`, revalidateSeconds, () =>
                fetchMoomooSnapshot(loadSdk, config.host!, config.port!, config.ssl ?? false, code),
            );
        },
    };
}

async function fetchMoomooSnapshot(
    loadSdk: () => Promise<MoomooSdkModule>,
    host: string,
    port: number,
    ssl: boolean,
    code: string,
): Promise<ProviderQuote | null> {
    const { default: MoomooWebsocket } = await loadSdk();
    const client = new MoomooWebsocket();
    try {
        const loggedIn = waitForLogin(client);
        client.start(host, port, ssl);
        await loggedIn;

        // One attempt, no retries: any error fails over to the next provider.
        const response = await withTimeout(
            client.GetSecuritySnapshot({
                c2s: { securityList: [{ market: US_MARKET, code }] },
            }),
        );
        return normalizeMoomooSnapshot(response);
    } finally {
        try {
            client.stop();
        } catch {
            // Closing a connection that may already be gone is not worth surfacing.
        }
    }
}

function waitForLogin(client: MoomooClient): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const timer = setTimeout(
        () => reject(new Error("moomoo: OpenD login timeout")),
        LOGIN_TIMEOUT_MS,
    );
    client.onlogin = (ret) => {
        clearTimeout(timer);
        if (ret === 0) resolve();
        else reject(new Error(`moomoo: OpenD login failed (${ret})`));
    };
    return promise;
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
    const { promise: timedOut, reject } = Promise.withResolvers<never>();
    const timer = setTimeout(
        () => reject(new Error("moomoo: request timeout")),
        REQUEST_TIMEOUT_MS,
    );
    return Promise.race([promise, timedOut]).finally(() => clearTimeout(timer));
}
