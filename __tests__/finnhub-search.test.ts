import { describe, expect, it } from 'vitest';

import { toSearchResults } from '@/lib/actions/finnhub.helpers';

const row = (symbol: string, description: string, type = 'Common Stock') => ({ symbol, description, type });

describe('toSearchResults', () => {
    it('collapses a symbol Finnhub returns more than once, keeping the first row', () => {
        // Finnhub really answers a search for INTU with both of these records.
        const results = toSearchResults([
            row('INTU', 'INTUIT INC'),
            row('ISRG', 'Intuitive Surgical Inc'),
            row('INTU', 'Intuit Inc'),
        ], 15);

        expect(results.map((stock) => stock.symbol)).toEqual(['INTU', 'ISRG']);
        expect(results[0].name).toBe('INTUIT INC');
    });

    it('counts only unique symbols against the limit', () => {
        const duplicates = Array.from({ length: 20 }, () => row('INTU', 'Intuit Inc'));
        const results = toSearchResults([...duplicates, row('AAPL', 'Apple Inc')], 2);

        expect(results.map((stock) => stock.symbol)).toEqual(['INTU', 'AAPL']);
    });

    it('uppercases the symbol and falls back for a missing name or type', () => {
        const [stock] = toSearchResults([row('intu', '', '')], 15);

        expect(stock).toMatchObject({ symbol: 'INTU', name: 'INTU', type: 'Stock' });
    });

    it('drops rows without a symbol', () => {
        expect(toSearchResults([row('', 'Mystery Corp')], 15)).toEqual([]);
    });

    it('labels the exchange from the symbol suffix when Finnhub gives none', () => {
        expect(toSearchResults([row('INTU.TO', 'Intuit Inc')], 15)[0].exchange).toBe('TO');
        expect(toSearchResults([row('AAPL', 'Apple Inc')], 15)[0].exchange).toBe('US');
    });
});
