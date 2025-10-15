/**
 * Main packet encoder - structured packets → bytes
 */

import type { ServerboundPacket } from "../types";
import { ConnectionState } from "../constants";
import { encodePong, encodeStatusResponse } from "../packets/status";

/**
 * Encode a packet to bytes
 */
export function encodePacket(packet: ServerboundPacket): Uint8Array {
    switch (packet.state) {
        case ConnectionState.STATUS:
            if (packet.id === 0x00) {
                return encodeStatusResponse(packet);
            }
            if (packet.id === 0x01) {
                return encodePong(packet);
            }
            throw new Error(
                //@ts-expect-error its says id not exist
                `Unknown status packet: 0x${packet.id.toString(16)}`,
            );

            //@ts-expect-error Type 'ConnectionState.LOGIN' is not comparable to type 'ConnectionState.STATUS'.ts(2678) because Login packets not implemented yet
        case ConnectionState.LOGIN:
            throw new Error("Login packets not implemented yet");
            //@ts-expect-error
        case ConnectionState.PLAY:
            throw new Error("Play packets not implemented yet");

        default:
            throw new Error(`Unknown connection state: ${packet.state}`);
    }
}
