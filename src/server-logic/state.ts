// ============================================
// FILE: src/server-logic/state.ts
// ============================================

import type { ConnectionState } from "../protocol/types.ts";

/** Connection info (no player attached yet) */
export type Connection = {
    id: string;
    state: ConnectionState;
    readBuffer: Uint8Array;
};

/** Server-wide state */
export type ServerState = {
    connections: Map<string, Connection>;
    currentTick: number;
};

/** Create initial server state */
export function createInitialState(): ServerState {
    return {
        connections: new Map(),
        currentTick: 0,
    };
}

/** Add new connection */
export function addConnection(
    state: ServerState,
    conn: Connection,
): ServerState {
    return {
        ...state,
        connections: new Map(state.connections).set(conn.id, conn),
    };
}

/** Update connection */
export function updateConnection(
    state: ServerState,
    connId: string,
    updater: (conn: Connection) => Connection,
): ServerState {
    const conn = state.connections.get(connId);
    if (!conn) return state;

    return {
        ...state,
        connections: new Map(state.connections).set(connId, updater(conn)),
    };
}

/** Remove connection */
export function removeConnection(
    state: ServerState,
    connId: string,
): ServerState {
    const newConnections = new Map(state.connections);
    newConnections.delete(connId);
    return {
        ...state,
        connections: newConnections,
    };
}
