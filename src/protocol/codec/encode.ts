// ============================================
// FILE: src/protocol/codec/encode.ts
// ============================================

import type { OutgoingPacket } from "../types.ts";
import { encodeString, encodeVarInt } from "./varint.ts";

/** Encode outgoing packet to bytes */
export function encodePacket(packet: OutgoingPacket): Uint8Array {
    let packetId: number;
    let data: Uint8Array;

    if (packet.type === "status_response") {
        packetId = 0x00;
        const json = JSON.stringify(packet.response);
        data = encodeString(json);
    } else if (packet.type === "ping_response") {
        packetId = 0x01;
        data = new Uint8Array(8);
        const view = new DataView(data.buffer);
        view.setBigInt64(0, packet.payload, false); // Big-endian
    } else {
        throw new Error(`Unknown packet type: ${(packet as any).type}`);
    }

    // Build packet: [packet ID][data]
    const packetIdBytes = encodeVarInt(packetId);
    const packetContent = new Uint8Array(packetIdBytes.length + data.length);
    packetContent.set(packetIdBytes, 0);
    packetContent.set(data, packetIdBytes.length);

    // Build frame: [length][packet ID][data]
    const length = encodeVarInt(packetContent.length);
    const frame = new Uint8Array(length.length + packetContent.length);
    frame.set(length, 0);
    frame.set(packetContent, length.length);

    return frame;
}
