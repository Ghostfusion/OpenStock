// Type surface for the official `moomoo-api` Node SDK (ships no types).
// Only the members the quote provider uses are declared; the SDK is far larger.
declare module "moomoo-api" {
    export interface MoomooClient {
        /** The SDK calls this with `true` and the init response on success, `false` and the error otherwise. */
        onlogin: ((success: boolean, message?: unknown) => void) | null;
        /** Connects to OpenD's WebSocket service. `key` is the plaintext websocket key, if configured. */
        start(host: string, port: number, ssl: boolean, key?: string): void;
        stop(): void;
        /** Qot_GetSecuritySnapshot: `{ c2s: { securityList: [{ market, code }] } }`. */
        GetSecuritySnapshot(req: unknown): Promise<unknown>;
        /**
         * The internal transport. `stop()` only unregisters the push callback, so the
         * socket must be closed through here or the connection leaks.
         */
        websock?: { close(): void } | null;
    }

    const MoomooWebsocket: new () => MoomooClient;
    export default MoomooWebsocket;
}
