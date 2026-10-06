/**
 * Shared quote shape used by every market-data provider. Mirrors the Finnhub
 * /quote fields so existing consumers (watchlist, stock header, alerts) keep
 * working unchanged.
 */
export type ProviderQuote = {
    c?: number;  // current / last price
    d?: number;  // change
    dp?: number; // change percent
    h?: number;  // day high
    l?: number;  // day low
    o?: number;  // open
    pc?: number; // previous close
    t?: number;  // unix seconds of the last update
};

export type QuoteProvider = {
    /** Stable id, used to key the fail-over cooldown. */
    id: string;
    /** True when the provider has the credentials/config it needs. */
    isConfigured(): boolean;
    /**
     * One attempt, no retries. Return null when the provider does not cover the
     * symbol (the chain continues); throw on transport/HTTP errors so the chain
     * fails over to the next provider.
     */
    fetchQuote(symbol: string, revalidateSeconds: number): Promise<ProviderQuote | null>;
};
