type Entry = { value: unknown; freshUntil: number };

const MAX_ENTRIES = 1000;
const store = new Map<string, Entry>();

/**
 * Tiny per-instance TTL cache for providers that don't have their own (moomoo,
 * EODHD). `ttlSeconds <= 0` disables caching. Failures are never cached, so the
 * next call tries again (subject to the chain's cooldown). Like the Finnhub
 * cache, this is per serverless instance, not shared.
 */
export async function cachedQuote<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
): Promise<T> {
    if (ttlSeconds <= 0) return load();

    const hit = store.get(key);
    if (hit && hit.freshUntil > Date.now()) return hit.value as T;

    const value = await load();
    if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value!);
    store.set(key, { value, freshUntil: Date.now() + ttlSeconds * 1000 });
    return value;
}
