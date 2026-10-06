import type { ProviderQuote, QuoteProvider } from "./types";

const PROVIDER_COOLDOWN_MS = 60_000;

/**
 * Single fail-safe chain over the configured quote providers.
 *
 * Each provider gets exactly one attempt, in order. A provider that returns null
 * does not cover the symbol, so the chain moves on without penalty. A provider
 * that throws (HTTP 4xx/5xx such as 401/403/404/429, a timeout, or a transport
 * error) is skipped for the next minute so one outage does not cost every request
 * the full timeout. There is no retry inside a provider: on failure we always
 * fail over to the next one, and only return null when every provider declined.
 */
export function createQuoteChain(
    providers: QuoteProvider[],
    cooldownMs: number = PROVIDER_COOLDOWN_MS,
) {
    const cooldownUntil = new Map<string, number>();

    return async function getQuote(
        symbol: string,
        revalidateSeconds = 0,
    ): Promise<ProviderQuote | null> {
        for (const provider of providers) {
            if (!provider.isConfigured()) continue;
            if ((cooldownUntil.get(provider.id) ?? 0) > Date.now()) continue;

            try {
                const quote = await provider.fetchQuote(symbol, revalidateSeconds);
                if (quote) return quote;
            } catch (error) {
                cooldownUntil.set(provider.id, Date.now() + cooldownMs);
                console.error(
                    `[quote] ${provider.id} failed for ${symbol}; failing over`,
                    error,
                );
            }
        }
        return null;
    };
}
