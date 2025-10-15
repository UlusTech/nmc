/**
 * Protocol constants - version, packet IDs, etc.
 */

/**
 * Minecraft protocol version (1.20.1 = 763)
 */
export const PROTOCOL_VERSION = 763;
export const MINECRAFT_VERSION = "1.20.1";

/**
 * Connection states
 */
export enum ConnectionState {
    HANDSHAKING = 0,
    STATUS = 1,
    LOGIN = 2,
    PLAY = 3,
}

/**
 * Packet IDs by state
 */
export const PacketID = {
    // Handshaking state (C->S)
    Handshake: {
        HANDSHAKE: 0x00,
    },

    // Status state
    Status: {
        // Client -> Server
        REQUEST: 0x00,
        PING: 0x01,

        // Server -> Client
        RESPONSE: 0x00,
        PONG: 0x01,
    },

    // Login state (TODO: Phase 2)
    Login: {},

    // Play state (TODO: Phase 3+)
    Play: {},
} as const;
