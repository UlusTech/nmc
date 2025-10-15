/**
 * Main packet decoder - bytes → structured packets
 */

import type { ClientboundPacket } from "../types";
import type { ProtocolState } from "../states";
import { ConnectionState, PacketID } from "../constants";
import { PacketReader } from "./reader";
import { decodeHandshake } from "../packets/handshake";
import { decodePing, decodeStatusRequest } from "../packets/status";

/**
 * Decode a packet based on current connection state
 */
export function decodePacket(
    buffer: Uint8Array,
    state: ProtocolState,
): ClientboundPacket {
    const reader = new PacketReader(buffer);
    const packetId = reader.readVarInt();

    switch (state.state) {
        case ConnectionState.HANDSHAKING:
            if (packetId === PacketID.Handshake.HANDSHAKE) {
                return decodeHandshake(reader);
            }
            throw new Error(
                `Unknown handshaking packet: 0x${packetId.toString(16)}`,
            );

        case ConnectionState.STATUS:
            if (packetId === PacketID.Status.REQUEST) {
                return decodeStatusRequest(reader);
            }
            if (packetId === PacketID.Status.PING) {
                return decodePing(reader);
            }
            throw new Error(
                `Unknown status packet: 0x${packetId.toString(16)}`,
            );

        case ConnectionState.LOGIN:
            throw new Error("Login packets not implemented yet");

        case ConnectionState.PLAY:
            throw new Error("Play packets not implemented yet");

        default:
            throw new Error(`Unknown connection state: ${state.state}`);
    }
}
