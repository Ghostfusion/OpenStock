// Shared guards for provider payloads, which arrive as unvalidated JSON.

/** Narrows an unknown JSON value to a plain object; null for anything else. */
export function toRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object"
        ? (value as Record<string, unknown>)
        : null;
}

/** Parses a numeric field that may arrive as a number or a numeric string. */
export function toNumber(value: unknown): number | undefined {
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
