import { isInternationalSymbol } from "@/lib/utils";
import { toNumber, toRecord } from "./parse";
import { cachedQuote } from "./quote-cache";
import type { ProviderQuote, QuoteProvider } from "./types";

const DEFAULT_BASE_URL = "https://eodhd.com/api";
const FETCH_TIMEOUT_MS = 5000;

export type EodhdConfig = {
    apiKey?: string;
    baseUrl?: string;
    /** Injectable for tests. */
    fetchImpl?: typeof fetch;
};

// US listings use the bare `<TICKER>.US` form on EODHD. Other markets use exchange
// codes (`.LSE`, `.TO`, ...) we have not verified, and a wrong mapping can return a
// different company, so those are left to another provider until the codes are confirmed.
function toEodhdTicker(symbol: string): string | null {
    const upper = symbol.trim().toUpperCase();
    if (!upper || upper.includes(":") || isInternationalSymbol(upper)) return null;
    return `${upper}.US`;
}

export function normalizeEodhdQuote(raw: unknown): ProviderQuote | null {
    const record = toRecord(raw);
    if (!record) return null;

    const c = toNumber(record.close);
    if (c === undefined || c <= 0) return null;

    return {
        c,
        d: toNumber(record.change),
        dp: toNumber(record.change_p),
        o: toNumber(record.open),
        h: toNumber(record.high),
        l: toNumber(record.low),
        pc: toNumber(record.previousClose),
        t: toNumber(record.timestamp),
    };
}

export function createEodhdQuoteProvider(config: EodhdConfig): QuoteProvider {
    const fetchImpl = config.fetchImpl ?? fetch;
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const apiKey = config.apiKey;

    return {
        id: "eodhd",
        isConfigured: () => Boolean(apiKey),
        async fetchQuote(symbol, revalidateSeconds) {
            const ticker = toEodhdTicker(symbol);
            if (!ticker || !apiKey) return null; // not a symbol we can map confidently

            return cachedQuote(`eodhd:${ticker}`, revalidateSeconds, async () => {
                const url = `${baseUrl}/real-time/${encodeURIComponent(ticker)}?api_token=${encodeURIComponent(apiKey)}&fmt=json`;
                const res = await fetchImpl(url, {
                    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
                });
                // No retry: any HTTP error (401/403/404/429/5xx) fails over to the next provider.
                if (!res.ok) throw new Error(`EODHD request failed: ${res.status}`);

                const payload: unknown = await res.json();
                return normalizeEodhdQuote(payload);
            });
        },
    };
}
