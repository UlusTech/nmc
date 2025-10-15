/**
 * NeoMinecraft - Main entry point
 * Pipeline: network → protocol → server-logic → game-logic
 */

import type { ServerWebSocket } from "bun";
import type { Connection, NetworkData } from "./network/types";
import type { ProtocolState } from "./protocol/states";
import type { HandshakePacket, ServerStatusJson } from "./protocol/types";
import { createProtocolState, transitionState } from "./protocol/states";
import { decodePacket } from "./protocol/codec/decode";
import { encodePacket } from "./protocol/codec/encode";
import {
    ConnectionState,
    MINECRAFT_VERSION,
    PROTOCOL_VERSION,
} from "./protocol/constants";
import { decodeVarint32 } from "@std/encoding/varint";

// Server configuration
const CONFIG = {
    hostname: "0.0.0.0",
    port: 25565,
    motd: "§6Neo§fMinecraft §8- §7Built with Bun & TypeScript",
    maxPlayers: 100,
} as const;

// Connection state tracking
interface ClientState {
    socket: ServerWebSocket<ClientData>;
    connection: Connection;
    protocol: ProtocolState;
    buffer: Uint8Array;
    bufferLength: number;
}

interface ClientData {
    state: ClientState;
}

const clients = new Map<string, ClientState>();

console.log("🎮 NeoMinecraft - Starting server...");
console.log(`📍 Port: ${CONFIG.port}`);
console.log(`📦 Protocol: ${PROTOCOL_VERSION} (MC ${MINECRAFT_VERSION})\n`);

// Start TCP server using Bun.listen
const server = Bun.listen<ClientData>({
    hostname: CONFIG.hostname,
    port: CONFIG.port,
    socket: {
        /**
         * New connection opened
         */
        open(socket) {
            const connection: Connection = {
                id: crypto.randomUUID(),
                address: socket.remoteAddress,
                connectedAt: Date.now(),
            };

            const state: ClientState = {
                socket,
                connection,
                protocol: createProtocolState(connection.id),
                buffer: new Uint8Array(4096),
                bufferLength: 0,
            };

            socket.data = { state };
            clients.set(connection.id, state);

            console.log(
                `🔌 [${
                    connection.id.slice(0, 8)
                }] Connected from ${connection.address}`,
            );
        },

        /**
         * Data received - PIPELINE STARTS HERE
         */
        data(socket, chunk) {
            const { state } = socket.data;

            try {
                // Step 1: NETWORK LAYER - accumulate bytes
                const incomingData = new Uint8Array(chunk);

                // Expand buffer if needed
                if (
                    state.bufferLength + incomingData.length >
                        state.buffer.length
                ) {
                    const newBuffer = new Uint8Array(state.buffer.length * 2);
                    newBuffer.set(state.buffer.subarray(0, state.bufferLength));
                    state.buffer = newBuffer;
                }

                state.buffer.set(incomingData, state.bufferLength);
                state.bufferLength += incomingData.length;

                // Step 2: Process complete packets
                processPackets(state);
            } catch (error) {
                console.error(
                    `❌ [${state.connection.id.slice(0, 8)}] Error:`,
                    error,
                );
                socket.end();
            }
        },

        /**
         * Connection closed
         */
        close(socket) {
            const { state } = socket.data;
            clients.delete(state.connection.id);

            const duration =
                ((Date.now() - state.connection.connectedAt) / 1000).toFixed(2);
            console.log(
                `🔌 [${
                    state.connection.id.slice(0, 8)
                }] Disconnected (${duration}s)`,
            );
        },

        /**
         * Socket error
         */
        error(socket, error) {
            const { state } = socket.data;
            console.error(
                `❌ [${state.connection.id.slice(0, 8)}] Socket error:`,
                error.message,
            );
        },
    },
});

console.log(`✅ Server listening on ${CONFIG.hostname}:${CONFIG.port}`);
console.log("🔌 Waiting for connections...\n");

/**
 * Process accumulated buffer into complete packets
 * PIPELINE: raw bytes → protocol decoding
 */
function processPackets(state: ClientState): void {
    while (state.bufferLength > 0) {
        // Try to read packet length
        if (state.bufferLength < 1) return;

        let packetLength: number;
        let lengthSize: number;

        try {
            [packetLength, lengthSize] = decodeVarint32(
                state.buffer.subarray(0, state.bufferLength),
            );
        } catch {
            return; // Incomplete VarInt
        }

        // Check if we have complete packet
        const totalSize = lengthSize + packetLength;
        if (state.bufferLength < totalSize) return;

        // Extract packet data (without length prefix)
        const packetData = state.buffer.slice(lengthSize, totalSize);

        // PIPELINE: protocol decode → handle packet
        handlePacket(state, packetData);

        // Remove processed packet from buffer
        const remaining = state.bufferLength - totalSize;
        if (remaining > 0) {
            state.buffer.copyWithin(0, totalSize, state.bufferLength);
        }
        state.bufferLength = remaining;
    }
}

/**
 * Handle a complete packet
 * PIPELINE: protocol → (future: server-logic → game-logic)
 */
function handlePacket(state: ClientState, data: Uint8Array): void {
    // PROTOCOL LAYER: decode packet
    const packet = decodePacket(data, state.protocol);

    const id = state.connection.id.slice(0, 8);

    // Handle based on packet type
    // (In Phase 1, we handle directly. Later: pass to server-logic)
    switch (packet.state) {
        case ConnectionState.HANDSHAKING: {
            const handshake = packet as HandshakePacket;
            console.log(
                `📋 [${id}] Handshake: protocol=${handshake.protocolVersion}, next=${handshake.nextState}`,
            );

            transitionState(state.protocol, handshake.nextState);
            console.log(
                `→  [${id}] Transitioned to ${
                    ConnectionState[handshake.nextState]
                }`,
            );
            break;
        }

        case ConnectionState.STATUS: {
            if (packet.id === 0x00) {
                // Status Request
                console.log(`📊 [${id}] Status request`);

                const statusJson: ServerStatusJson = {
                    version: {
                        name: MINECRAFT_VERSION,
                        protocol: PROTOCOL_VERSION,
                    },
                    players: {
                        max: CONFIG.maxPlayers,
                        online: clients.size - 1, // -1 to exclude this connection
                    },
                    description: {
                        text: CONFIG.motd,
                    },
                };

                const response = encodePacket({
                    state: ConnectionState.STATUS,
                    id: 0x00,
                    json: JSON.stringify(statusJson),
                });

                state.socket.write(response);
                console.log(`✅ [${id}] Sent status response`);
            } else if (packet.id === 0x01) {
                // Ping
                console.log(`🏓 [${id}] Ping: ${packet.payload}`);

                const pong = encodePacket({
                    state: ConnectionState.STATUS,
                    id: 0x01,
                    payload: packet.payload,
                });

                state.socket.write(pong);
                console.log(`✅ [${id}] Sent pong`);
            }
            break;
        }

        default:
            console.error(`❌ [${id}] Unhandled state: ${packet.state}`);
            state.socket.end();
    }
}

// Graceful shutdown
process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down...");
    server.stop();
    process.exit(0);
});
