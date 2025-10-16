// ============================================
// FILE: src/protocol/codec/varint.ts
// ============================================
// Using JSR standard library for VarInt
// https://jsr.io/@std/encoding/doc/~/decodeVarint

import { decodeVarint32, encodeVarint } from "@std/encoding";

/** Decode VarInt from buffer at offset (wrapper around @std/encoding) */
export function decodeVarInt(
    buffer: Uint8Array,
    offset: number = 0,
): { value: number; bytesRead: number } | null {
    try {
        // @std/encoding/varint returns [value, bytesRead]
        const result = decodeVarint32(buffer.subarray(offset));
        return { value: result[0], bytesRead: result[1] };
    } catch {
        // Incomplete or invalid
        return null;
    }
}

/** Encode number as VarInt (wrapper around @std/encoding) */
export function encodeVarInt(value: number): Uint8Array {
    return encodeVarint(value)[0];
}

/** Decode string (VarInt length + UTF-8 bytes) */
export function decodeString(
    buffer: Uint8Array,
    offset: number = 0,
): { value: string; bytesRead: number } | null {
    // Decode string length (VarInt)
    const lengthResult = decodeVarInt(buffer, offset);
    if (!lengthResult) {
        return null; // Incomplete VarInt
    }

    const stringLength = lengthResult.value;
    const stringStart = offset + lengthResult.bytesRead;
    const stringEnd = stringStart + stringLength;

    // Check if we have all the string bytes
    if (stringEnd > buffer.length) {
        return null; // Incomplete string data
    }

    // Decode UTF-8 string
    const stringBytes = buffer.slice(stringStart, stringEnd);
    const value = new TextDecoder().decode(stringBytes);

    return {
        value,
        bytesRead: lengthResult.bytesRead + stringLength,
    };
}

/** Encode string (VarInt length + UTF-8 bytes) */
export function encodeString(value: string): Uint8Array {
    const stringBytes = new TextEncoder().encode(value);
    const length = encodeVarInt(stringBytes.length);

    const result = new Uint8Array(length.length + stringBytes.length);
    result.set(length, 0);
    result.set(stringBytes, length.length);

    return result;
}
