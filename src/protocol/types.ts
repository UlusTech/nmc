// ============================================
// FILE: src/protocol/types.ts
// ============================================

/** 3D position vector */
export type Vector3 = {
    x: number;
    y: number;
    z: number;
};

/** Connection state in protocol state machine */
export type ConnectionState = "handshaking" | "status" | "login" | "play";

/** Base packet structure */
export type BasePacket = {
    type: string;
};

// ============================================
// Handshaking packets
// ============================================

export type HandshakePacket = BasePacket & {
    type: "handshake";
    protocolVersion: number;
    serverAddress: string;
    serverPort: number;
    nextState: 1 | 2; // 1 = status, 2 = login
};

// ============================================
// Status packets (server list ping)
// ============================================

export type StatusRequestPacket = BasePacket & {
    type: "status_request";
};

export type StatusResponsePacket = BasePacket & {
    type: "status_response";
    response: StatusResponse;
};

export type PingRequestPacket = BasePacket & {
    type: "ping_request";
    payload: bigint;
};

export type PingResponsePacket = BasePacket & {
    type: "ping_response";
    payload: bigint;
};

/** Server status response (what client sees in multiplayer list) */
export type StatusResponse = {
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
    favicon?: string; // base64 encoded PNG
    enforcesSecureChat?: boolean;
    previewsChat?: boolean;
};

// ============================================
// Incoming packets (from client)
// ============================================

export type IncomingPacket =
    | HandshakePacket
    | StatusRequestPacket
    | PingRequestPacket;

// ============================================
// Outgoing packets (to client)
// ============================================

export type OutgoingPacket = StatusResponsePacket | PingResponsePacket;

/** Result of packet decode attempt */
export type DecodeResult =
    | { success: true; packet: IncomingPacket; remaining: Uint8Array }
    | {
        success: false;
        reason: "incomplete" | "invalid";
        remaining: Uint8Array;
    };
