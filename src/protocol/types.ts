/**
 * Protocol packet type definitions
 */

import type { ConnectionState } from "./constants";

/**
 * Base packet structure
 */
export interface Packet {
    state: ConnectionState;
    id: number;
}

/**
 * Handshake packet (C->S)
 */
export interface HandshakePacket extends Packet {
    state: ConnectionState.HANDSHAKING;
    id: 0x00;
    protocolVersion: number;
    serverAddress: string;
    serverPort: number;
    nextState: ConnectionState.STATUS | ConnectionState.LOGIN;
}

/**
 * Status Request packet (C->S)
 */
export interface StatusRequestPacket extends Packet {
    state: ConnectionState.STATUS;
    id: 0x00;
}

/**
 * Status Response packet (S->C)
 */
export interface StatusResponsePacket extends Packet {
    state: ConnectionState.STATUS;
    id: 0x00;
    json: string;
}

/**
 * Ping packet (C->S)
 */
export interface PingPacket extends Packet {
    state: ConnectionState.STATUS;
    id: 0x01;
    payload: bigint;
}

/**
 * Pong packet (S->C)
 */
export interface PongPacket extends Packet {
    state: ConnectionState.STATUS;
    id: 0x01;
    payload: bigint;
}

/**
 * Server status JSON structure
 */
export interface ServerStatusJson {
    version: {
        name: string;
        protocol: number;
    };
    players: {
        max: number;
        online: number;
        sample?: Array<{ name: string; id: string }>;
    };
    description: {
        text: string;
    };
    favicon?: string;
}

/**
 * Union of all clientbound packets (C->S)
 */
export type ClientboundPacket =
    | HandshakePacket
    | StatusRequestPacket
    | PingPacket;

/**
 * Union of all serverbound packets (S->C)
 */
export type ServerboundPacket =
    | StatusResponsePacket
    | PongPacket;
