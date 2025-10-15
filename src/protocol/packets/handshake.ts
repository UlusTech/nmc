/**
 * Handshake packet codec
 */

import type { HandshakePacket } from "../types";
import { ConnectionState } from "../constants";
import { PacketReader } from "../codec/reader";

/**
 * Decode handshake packet from buffer
 */
export function decodeHandshake(reader: PacketReader): HandshakePacket {
    const protocolVersion = reader.readVarInt();
    const serverAddress = reader.readString();
    const serverPort = reader.readUShort();
    const nextState = reader.readVarInt();

    if (
        nextState !== ConnectionState.STATUS &&
        nextState !== ConnectionState.LOGIN
    ) {
        throw new Error(`Invalid next state: ${nextState}`);
    }

    return {
        state: ConnectionState.HANDSHAKING,
        id: 0x00,
        protocolVersion,
        serverAddress,
        serverPort,
        nextState,
    };
}
