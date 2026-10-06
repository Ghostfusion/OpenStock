// Pure helpers behind the Finnhub actions. They live in a plain module because a
// 'use server' module may only export async functions.

const FINNHUB_EXCHANGE_SUFFIXES = new Set([
    'AS', 'AT', 'AX', 'BA', 'BK', 'BO', 'BR', 'CO', 'DE', 'F', 'HE', 'HK',
    'IL', 'IS', 'JK', 'JO', 'KL', 'KQ', 'KS', 'L', 'LS', 'MC', 'MI', 'MX',
    'NS', 'NZ', 'OL', 'PA', 'PR', 'SA', 'SI', 'SS', 'ST', 'SW', 'SZ', 'T',
    'TA', 'TO', 'TW', 'TWO', 'V', 'VI', 'WA',
]);

export type SearchStockCandidate = FinnhubSearchResult & {
    __exchange?: string;
};

function getExchangeLabel(symbol: string, exchange?: string) {
    if (exchange?.trim()) {
        return exchange.trim();
    }

    const parts = symbol.split('.');
    const suffix = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';

    if (!suffix) {
        return 'US';
    }

    return FINNHUB_EXCHANGE_SUFFIXES.has(suffix) ? suffix : 'US';
}

// Finnhub returns one row per record it holds for a symbol, so a symbol can repeat (INTU
// comes back twice, the first carrying a legacy ALL-CAPS name). The search palette keys
// its rows on the symbol, so keep the first row of each and let only unique symbols count
// against the limit, otherwise duplicates both break the keys and eat result slots.
export function toSearchResults(
    results: SearchStockCandidate[],
    limit: number,
): StockWithWatchlistStatus[] {
    const mapped: StockWithWatchlistStatus[] = [];
    const seen = new Set<string>();

    for (const result of results) {
        const symbol = (result.symbol || '').toUpperCase();
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);

        mapped.push({
            symbol,
            name: result.description || symbol,
            exchange: getExchangeLabel(symbol, result.__exchange),
            type: result.type || 'Stock',
            isInWatchlist: false,
        });

        if (mapped.length === limit) break;
    }

    return mapped;
}
