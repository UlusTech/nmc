// ============================================
// FILE: src/main.ts
// ============================================

import type { Socket } from "bun";
import { decodePacket } from "./protocol/codec/decode.ts";
import { encodePacket } from "./protocol/codec/encode.ts";
import type { OutgoingPacket } from "./protocol/types.ts";
import {
    addConnection,
    createInitialState,
    removeConnection,
    type ServerState,
    updateConnection,
} from "./server-logic/state.ts";
import { type EffectInterpreter, runEffects } from "./server-logic/effects.ts";
import { handlePacket } from "./server-logic/events/handlePacket.ts";

const PORT = 25565;

function createServer() {
    // Mutable state (only place in entire codebase)
    let state: ServerState = createInitialState();

    // Socket registry for sending packets
    const sockets = new Map<string, Socket>();

    // Effect interpreter (performs side effects)
    const interpreter: EffectInterpreter = {
        sendPacket: (connId: string, packet: OutgoingPacket) => {
            const socket = sockets.get(connId);
            if (socket) {
                const bytes = encodePacket(packet);
                socket.write(bytes);
            }
        },
        disconnect: (connId: string, reason: string) => {
            const socket = sockets.get(connId);
            if (socket) {
                socket.end();
                sockets.delete(connId);
            }
            console.log(`Disconnected ${connId}: ${reason}`);
        },
        log: (level: string, message: string) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
        },
    };

    // Process accumulated bytes in connection buffer
    const processBuffer = (connId: string) => {
        // We must retrieve the connection object within the loop
        // to ensure we always have the latest state.
        // Start by getting the connection and buffer.
        let conn = state.connections.get(connId);
        if (!conn) return;

        let buffer = conn.readBuffer;

        while (buffer.length > 0) {
            // Use the LATEST state from the conn object
            const result = decodePacket(buffer, conn.state);

            if (!result.success) {
                if (result.reason === "incomplete") {
                    break; // Wait for more data
                } else if (result.reason === "invalid") {
                    // Disconnect on invalid packet (best practice)
                    // Ensure your handler logic from previous steps is still here.
                    runEffects([
                        {
                            type: "disconnect",
                            connId,
                            reason: "Invalid packet received",
                        },
                        {
                            type: "log",
                            level: "error",
                            message: `Invalid packet received from ${connId}`,
                        },
                    ], interpreter);
                    return; // Stop processing
                }
            }

            // TypeScript knows result.success === true here
            if (result.success) {
                const ctx = {
                    state,
                    connId,
                    packet: result.packet,
                };
                const handlerResult = handlePacket(ctx);

                // 1. Update the global state
                state = handlerResult.newState;

                // 2. 💥 CRITICAL FIX: Update the local 'conn' object with the new state
                //    before the loop starts its next iteration.
                const newConn = state.connections.get(connId);
                if (!newConn) {
                    // Connection was likely removed by a disconnect effect
                    return;
                }
                conn = newConn; // Use the updated conn object for the next loop iteration

                // Run effects
                runEffects(handlerResult.effects, interpreter);

                // Continue with remaining bytes
                buffer = result.remaining;
            }
        }

        // Update connection buffer one final time outside the loop
        state = updateConnection(state, connId, (c) => ({
            ...c,
            readBuffer: buffer,
        }));
    };

    // Start TCP server
    const server = Bun.listen({
        hostname: "0.0.0.0",
        port: PORT,
        socket: {
            open(socket) {
                const connId = crypto.randomUUID();
                sockets.set(connId, socket);

                state = addConnection(state, {
                    id: connId,
                    state: "handshaking",
                    readBuffer: new Uint8Array(0),
                });

                console.log(`[INFO] New connection: ${connId}`);
            },

            data(socket, data) {
                const connId = Array.from(sockets.entries()).find(
                    ([_, s]) => s === socket,
                )?.[0];

                if (!connId) return;

                // Append new data to buffer
                state = updateConnection(state, connId, (conn) => {
                    const newBuffer = new Uint8Array(
                        conn.readBuffer.length + data.length,
                    );
                    newBuffer.set(conn.readBuffer, 0);
                    newBuffer.set(data, conn.readBuffer.length);
                    return { ...conn, readBuffer: newBuffer };
                });

                // Process accumulated data
                processBuffer(connId);
            },

            close(socket) {
                const connId = Array.from(sockets.entries()).find(
                    ([_, s]) => s === socket,
                )?.[0];

                if (connId) {
                    state = removeConnection(state, connId);
                    sockets.delete(connId);
                    console.log(`[INFO] Connection closed: ${connId}`);
                }
            },

            error(socket, error) {
                console.error("[ERROR] Socket error:", error);
            },
        },
    });

    console.log(`\n🚀 NeoMinecraft server started on port ${PORT}`);
    console.log(`📊 Add server in Minecraft: localhost:${PORT}\n`);

    return server;
}

createServer();
