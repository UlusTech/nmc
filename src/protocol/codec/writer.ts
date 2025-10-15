/**
 * Binary writer utilities for packet encoding
 */

import { encodeVarint } from "@std/encoding/varint";

/**
 * Writer for binary packet data
 */
export class PacketWriter {
    private chunks: Uint8Array[] = [];
    private length: number = 0;

    /**
     * Write VarInt using @std/encoding
     */
    writeVarInt(value: number): this {
        const encoded = encodeVarint(value);
        // @ts-expect-error Argument of type '[Uint8Array<ArrayBuffer>, number]' is not assignable to parameter of type 'Uint8Array<ArrayBufferLike>'
        this.chunks.push(encoded); // There is no problem here, this works like this. I dont understand why.
        this.length += encoded.length;
        return this;
    }

    /**
     * Write string (VarInt length + UTF-8 bytes)
     */
    writeString(value: string): this {
        const bytes = new TextEncoder().encode(value);
        this.writeVarInt(bytes.length);
        this.chunks.push(bytes);
        this.length += bytes.length;
        return this;
    }

    /**
     * Write unsigned short (2 bytes, big-endian)
     */
    writeUShort(value: number): this {
        const buffer = new Uint8Array(2);
        const view = new DataView(buffer.buffer);
        view.setUint16(0, value, false); // false = big-endian
        this.chunks.push(buffer);
        this.length += 2;
        return this;
    }

    /**
     * Write long (8 bytes, big-endian)
     */
    writeLong(value: bigint): this {
        const buffer = new Uint8Array(8);
        const view = new DataView(buffer.buffer);
        view.setBigInt64(0, value, false); // false = big-endian
        this.chunks.push(buffer);
        this.length += 8;
        return this;
    }

    /**
     * Write unsigned byte
     */
    writeUByte(value: number): this {
        const buffer = new Uint8Array([value]);
        this.chunks.push(buffer);
        this.length += 1;
        return this;
    }

    /**
     * Write raw bytes
     */
    writeBytes(bytes: Uint8Array): this {
        this.chunks.push(bytes);
        this.length += bytes.length;
        return this;
    }

    /**
     * Get total length
     */
    getLength(): number {
        return this.length;
    }

    /**
     * Build final buffer
     */
    build(): Uint8Array {
        const result = new Uint8Array(this.length);
        let offset = 0;

        for (const chunk of this.chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }
}
