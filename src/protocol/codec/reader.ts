/**
 * Binary reader utilities for packet decoding
 */

import { decodeVarint32 } from "@std/encoding/varint";

/**
 * Reader for binary packet data
 */
export class PacketReader {
    private view: DataView;
    private offset: number;
    private buffer: Uint8Array;

    constructor(buffer: Uint8Array) {
        this.buffer = buffer;
        this.view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength,
        );
        this.offset = 0;
    }

    /**
     * Get current offset
     */
    getOffset(): number {
        return this.offset;
    }

    /**
     * Check if can read n bytes
     */
    canRead(n: number = 1): boolean {
        return this.offset + n <= this.buffer.length;
    }

    /**
     * Read VarInt using @std/encoding
     */
    readVarInt(): number {
        const [value, length] = decodeVarint32(
            this.buffer.subarray(this.offset),
        );
        this.offset += length;
        return value;
    }

    /**
     * Read string (VarInt length + UTF-8 bytes)
     */
    readString(): string {
        const length = this.readVarInt();
        if (!this.canRead(length)) {
            throw new Error("String length exceeds buffer");
        }

        const bytes = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return new TextDecoder().decode(bytes);
    }

    /**
     * Read unsigned short (2 bytes, big-endian)
     */
    readUShort(): number {
        if (!this.canRead(2)) {
            throw new Error("Cannot read UShort");
        }

        const value = this.view.getUint16(this.offset, false); // false = big-endian
        this.offset += 2;
        return value;
    }

    /**
     * Read long (8 bytes, big-endian)
     */
    readLong(): bigint {
        if (!this.canRead(8)) {
            throw new Error("Cannot read Long");
        }

        const value = this.view.getBigInt64(this.offset, false); // false = big-endian
        this.offset += 8;
        return value;
    }

    /**
     * Read unsigned byte
     */
    readUByte(): number {
        if (!this.canRead(1)) {
            throw new Error("Cannot read UByte");
        }

        const value = this.view.getUint8(this.offset);
        this.offset += 1;
        return value;
    }

    /**
     * Read raw bytes
     */
    readBytes(length: number): Uint8Array {
        if (!this.canRead(length)) {
            throw new Error("Cannot read bytes");
        }

        const bytes = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }
}
