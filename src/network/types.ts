/**
 * Network layer types - pure transport abstractions
 * No protocol knowledge here
 */

/**
 * Connection metadata for tracking clients
 */
export interface Connection {
    id: string;
    address: string;
    connectedAt: number;
}

/**
 * Raw data received from network
 */
export interface NetworkData {
    connection: Connection;
    buffer: Uint8Array;
}

/**
 * Network event handlers
 */
export interface NetworkHandlers {
    onConnect: (connection: Connection) => void;
    onData: (data: NetworkData) => void;
    onDisconnect: (connection: Connection) => void;
    onError: (connection: Connection, error: Error) => void;
}
