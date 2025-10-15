/**
 * Status packets codec
 */

import type {
    PingPacket,
    PongPacket,
    StatusRequestPacket,
    StatusResponsePacket,
} from "../types";
import { ConnectionState, PacketID } from "../constants";
import { PacketReader } from "../codec/reader";
import { PacketWriter } from "../codec/writer";

/**
 * Decode status request packet (empty packet)
 */
export function decodeStatusRequest(reader: PacketReader): StatusRequestPacket {
    return {
        state: ConnectionState.STATUS,
        id: PacketID.Status.REQUEST,
    };
}

/**
 * Decode ping packet
 */
export function decodePing(reader: PacketReader): PingPacket {
    const payload = reader.readLong();

    return {
        state: ConnectionState.STATUS,
        id: PacketID.Status.PING,
        payload,
    };
}

/**
 * Encode status response packet
 */
export function encodeStatusResponse(packet: StatusResponsePacket): Uint8Array {
    const writer = new PacketWriter();
    writer.writeString(packet.json);

    const data = writer.build();

    // Wrap with packet length and ID
    const finalWriter = new PacketWriter();
    finalWriter.writeVarInt(data.length + 1); // +1 for packet ID
    finalWriter.writeVarInt(PacketID.Status.RESPONSE);
    finalWriter.writeBytes(data);

    return finalWriter.build();
}

/**
 * Encode pong packet
 */
export function encodePong(packet: PongPacket): Uint8Array {
    const writer = new PacketWriter();
    writer.writeLong(packet.payload);

    const data = writer.build();

    // Wrap with packet length and ID
    const finalWriter = new PacketWriter();
    finalWriter.writeVarInt(data.length + 1); // +1 for packet ID
    finalWriter.writeVarInt(PacketID.Status.PONG);
    finalWriter.writeBytes(data);

    return finalWriter.build();
}
