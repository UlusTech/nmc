/**
 * Protocol state management
 * Tracks connection state for each client
 */

import { ConnectionState } from "./constants";

/**
 * Per-connection protocol state
 */
export interface ProtocolState {
    connectionId: string;
    state: ConnectionState;
    compressionThreshold?: number;
    username?: string;
}

/**
 * Create initial protocol state for new connection
 */
export function createProtocolState(connectionId: string): ProtocolState {
    return {
        connectionId,
        state: ConnectionState.HANDSHAKING,
    };
}

/**
 * Transition to new state
 */
export function transitionState(
    state: ProtocolState,
    newState: ConnectionState,
): void {
    state.state = newState;
}
