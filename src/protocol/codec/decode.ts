// ============================================
// FILE: src/protocol/codec/decode.ts
// ============================================

import type {
    ConnectionState,
    DecodeResult,
    IncomingPacket,
} from "../types.ts";
import { decodeString, decodeVarInt } from "./varint.ts";

// NOTE: decodeHandshake and decodePingRequest are also in this file.
// I am including them here for completeness based on the provided context.

/**
 * Decodes a Minecraft protocol packet from a buffer based on the current connection state.
 *
 * This function addresses the critical decoding ambiguity where Packet ID 0x00 is reused:
 * - In 'handshaking' state: It's the complex **Handshake** packet.
 * - In 'status' state: It's the simple **Status Request** packet (zero bytes of data).
 *
 * The fix ensures that `decodeHandshake` is *only* called when `state === 'handshaking'`,
 * preventing the zero-data Status Request from being incorrectly processed by the handshake
 * decoder, which was causing the "Invalid handshake: server address" error.
 *
 * @param buffer The raw bytes to decode from.
 * @param state The current connection state ('handshaking', 'status', 'login', 'play').
 * @returns The result of the decoding attempt.
 */
export function decodePacket(
    buffer: Uint8Array,
    state: ConnectionState,
): DecodeResult {
    // Need at least 2 bytes (length + packet ID)
    if (buffer.length < 2) {
        return { success: false, reason: "incomplete", remaining: buffer };
    }

    // 1. Read packet length (Frame length)
    const lengthResult = decodeVarInt(buffer, 0);
    if (!lengthResult) {
        return { success: false, reason: "incomplete", remaining: buffer };
    }
    const packetLength = lengthResult.value;
    const packetStart = lengthResult.bytesRead;
    const packetEnd = packetStart + packetLength;

    // Check if we have complete packet frame
    if (packetEnd > buffer.length) {
        return { success: false, reason: "incomplete", remaining: buffer };
    }

    // 2. Read packet ID
    const idResult = decodeVarInt(buffer, packetStart);
    if (!idResult) {
        return {
            success: false,
            reason: "invalid",
            remaining: buffer.slice(packetEnd),
        };
    }
    const packetId = idResult.value;
    const dataStart = packetStart + idResult.bytesRead;
    const data = buffer.slice(dataStart, packetEnd);

    // 3. Decode based on state and packet ID
    let packet: IncomingPacket | null = null;
    try {
        if (state === "handshaking") {
            // ONLY allow Handshake (ID 0x00) here
            if (packetId === 0x00) {
                packet = decodeHandshake(data);
            } else {
                throw new Error(
                    `Invalid packet ID ${packetId} for handshaking state`,
                );
            }
        } else if (state === "status") {
            // Status Request (0x00) and Ping Request (0x01) allowed here
            if (packetId === 0x00) {
                // Status Request MUST have no data. (data.length should be 0)
                if (data.length > 0) {
                    throw new Error(
                        `Invalid Status Request: unexpected data length ${data.length}`,
                    );
                }
                packet = { type: "status_request" };
            } else if (packetId === 0x01) {
                packet = decodePingRequest(data);
            } else {
                throw new Error(
                    `Invalid packet ID ${packetId} for status state`,
                );
            }
        }
        // Add logic for 'login' state here when you implement it
        // else if (state === 'login') { ... }
    } catch (error) {
        console.error("Decode error:", error);
        console.error(
            `[DEBUG] Error occurred while decoding packet. State: ${state}, ID: ${packetId}`,
        );
        return {
            success: false,
            reason: "invalid",
            remaining: buffer.slice(packetEnd),
        };
    }

    if (!packet) {
        console.warn(`Unknown packet: state=${state}, id=${packetId}`);
        return {
            success: false,
            reason: "invalid",
            remaining: buffer.slice(packetEnd),
        };
    }

    // 4. Return result
    return {
        success: true,
        packet,
        remaining: buffer.slice(packetEnd),
    };
}

function decodeHandshake(data: Uint8Array): IncomingPacket {
    let offset = 0;

    // Debug: log packet data
    console.log(`[DEBUG] Handshake packet data length: ${data.length}`);

    // 1. Protocol Version (VarInt)
    const protocolResult = decodeVarInt(data, offset);
    if (!protocolResult) throw new Error("Invalid handshake: protocol version");
    console.log(`[DEBUG] Protocol version: ${protocolResult.value}`);
    offset += protocolResult.bytesRead;

    // 2. Server Address (String)
    const addressResult = decodeString(data, offset);
    if (!addressResult) {
        console.log(
            `[DEBUG] Failed to decode address. Remaining bytes: ${
                data.length - offset
            }`,
        );
        console.log(
            `[DEBUG] Hex dump: ${
                Array.from(data.slice(offset, offset + 20)).map((b) =>
                    b.toString(16).padStart(2, "0")
                ).join(" ")
            }`,
        );
        throw new Error("Invalid handshake: server address");
    }
    console.log(`[DEBUG] Server address: ${addressResult.value}`);
    offset += addressResult.bytesRead;

    // 3. Server Port (Unsigned Short - 2 bytes)
    if (offset + 2 > data.length) {
        console.log(
            `[DEBUG] Not enough bytes for port. Need 2, have ${
                data.length - offset
            }`,
        );
        throw new Error("Invalid handshake: missing port");
    }
    const port = (data[offset]! << 8) | data[offset + 1]!;
    console.log(`[DEBUG] Server port: ${port}`);
    offset += 2;

    // 4. Next State (VarInt)
    const nextStateResult = decodeVarInt(data, offset);
    if (!nextStateResult) throw new Error("Invalid handshake: next state");
    console.log(`[DEBUG] Next state: ${nextStateResult.value}`);

    // 💥 FIX: Advance offset after reading the final VarInt
    offset += nextStateResult.bytesRead;

    // 🚀 NEW SANITY CHECK: Ensure we consumed exactly the entire packet payload
    if (offset !== data.length) {
        throw new Error(
            `Invalid handshake: data length mismatch. Expected ${data.length} bytes, read ${offset} bytes.`,
        );
    }

    return {
        type: "handshake",
        protocolVersion: protocolResult.value,
        serverAddress: addressResult.value,
        serverPort: port,
        nextState: nextStateResult.value as 1 | 2,
    };
}

function decodePingRequest(data: Uint8Array): IncomingPacket {
    // Ping Request data is a BigInt (Long - 8 bytes)
    if (data.length < 8) throw new Error("Invalid ping: too short");

    // We need to use DataView to read a 64-bit integer
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const payload = view.getBigInt64(0, false); // Big-endian

    return {
        type: "ping_request",
        payload,
    };
}
