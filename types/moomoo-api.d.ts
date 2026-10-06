// Type surface for the official `moomoo-api` Node SDK (ships no types).
// Only the members the quote provider uses are declared; the SDK is far larger.
declare module "moomoo-api" {
    export interface MoomooClient {
        onlogin: ((ret: number, msg?: string) => void) | null;
        /** Connects to OpenD's WebSocket service. `key` is the plaintext websocket key, if configured. */
        start(host: string, port: number, ssl: boolean, key?: string): void;
        stop(): void;
        /** Qot_GetSecuritySnapshot: `{ c2s: { securityList: [{ market, code }] } }`. */
        GetSecuritySnapshot(req: unknown): Promise<unknown>;
    }

    const MoomooWebsocket: new () => MoomooClient;
    export default MoomooWebsocket;
}
