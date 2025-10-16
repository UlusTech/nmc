import type { Socket } from "bun";
import { ArrayBufferSink } from "bun";
// Assuming the following files exist relative to this file:
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

// Define the shape of the data we attach to the Bun Socket for easy lookup
type SocketData = {
    connId: string;
};

// --- Module-scoped (Root-level) State ---
// This pattern is common for single-process Bun servers
let state: ServerState = createInitialState();
const sockets = new Map<string, Socket>();
const sinks = new Map<string, ArrayBufferSink>();

// --- Helpers ---

/**
 * Safely extracts the connection ID from the socket's attached data.
 */
const getConnId = (socket: Socket): string | undefined => {
    // Bun allows attaching arbitrary data, but we need an 'any' cast for TypeScript
    return (socket as any).data?.connId;
};

/**
 * Flushes the accumulated outgoing buffer (sink) to the socket.
 * Implements backpressure handling by placing unwritten bytes back into the sink.
 */
const flushSink = (connId: string) => {
    const socket = sockets.get(connId);
    const sink = sinks.get(connId);

    if (socket && sink) {
        // flush() returns BufferSource, asserting to Uint8Array for array operations
        const bytes = sink.flush() as Uint8Array;

        // If there are bytes, attempt to write them
        if (bytes.byteLength > 0) {
            const wrote = socket.write(bytes);

            // Backpressure check: If not all bytes were written, put the remainder back.
            if (wrote < bytes.byteLength) {
                // write() handles the BufferSource type correctly
                sink.write(bytes.subarray(wrote));
                // console.log(`[WARN] Backpressure on ${connId}. Re-queued ${bytes.byteLength - wrote} bytes.`);
            }
        }
    }
};

// --- Effect Interpreter (Performs Side Effects) ---

const interpreter: EffectInterpreter = {
    sendPacket: (connId: string, packet: OutgoingPacket) => {
        const sink = sinks.get(connId);

        if (sink) {
            // Encode the packet and write it to the output buffer
            const bytes = encodePacket(packet);
            sink.write(bytes);
            // Immediately attempt to flush the sink to the network
            flushSink(connId);
        }
    },

    disconnect: (connId: string, reason: string) => {
        const socket = sockets.get(connId);

        // Clean up resources first
        if (socket) {
            socket.end();
            sockets.delete(connId);
            sinks.delete(connId);
        }

        console.log(`[INFO] Disconnected ${connId}: ${reason}`);
    },

    log: (level: string, message: string) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    },
};

// --- Processing Logic ---

/**
 * Processes the accumulated read buffer for a connection, attempting to decode and handle
 * as many full packets as possible in a single synchronous loop.
 * This is the core transactional logic.
 */
const processBuffer = (connId: string) => {
    let conn = state.connections.get(connId);

    if (!conn) return;

    let buffer = conn.readBuffer;

    while (buffer.length > 0) {
        // Decode based on the connection's current state (e.g., 'handshaking', 'play')
        const result = decodePacket(buffer, conn.state);

        if (!result.success) {
            if (result.reason === "incomplete") {
                break; // Wait for more data
            } else if (result.reason === "invalid") {
                // Critical failure: Invalid packet format. Disconnect the client.
                runEffects([
                    {
                        type: "disconnect",
                        connId,
                        reason: "Invalid packet received",
                    },
                    {
                        type: "log",
                        level: "error",
                        message:
                            `Invalid packet received from ${connId}. Disconnecting.`,
                    },
                ], interpreter);

                return; // Stop processing
            }
        }

        if (result.success) {
            const ctx = { state, connId, packet: result.packet };
            const handlerResult = handlePacket(ctx);

            // 1. Update the global state
            state = handlerResult.newState;

            // 2. CRITICAL: Re-fetch the connection object to get the latest state
            // (The state might have changed due to the packet, e.g., transitioning from 'handshaking' to 'play')
            const newConn = state.connections.get(connId);

            if (!newConn) {
                // Connection was removed by a disconnect effect (e.g., client sends a Quit packet)
                return;
            }

            // Update the local reference for the next loop iteration
            conn = newConn;

            // 3. Run side effects (send responses, log, etc.)
            runEffects(handlerResult.effects, interpreter);

            // 4. Continue with remaining bytes
            buffer = result.remaining;
        }
    }

    // Update connection buffer one final time outside the loop with any remaining incomplete data
    state = updateConnection(state, connId, (c) => ({
        ...c,
        readBuffer: buffer,
    }));
};

// --- Start TCP server ---

const server = Bun.listen({
    hostname: "0.0.0.0",
    port: PORT,

    socket: {
        /** Called when a new client connects */
        open(socket) {
            const connId = crypto.randomUUID();

            // Store socket and attach ID for easy retrieval
            sockets.set(connId, socket);
            (socket as any).data = { connId };

            // Create and start the output buffer sink
            const sink = new ArrayBufferSink();
            sink.start({ stream: true });
            sinks.set(connId, sink);

            // Add to the application state
            state = addConnection(state, {
                id: connId,
                state: "handshaking", // Initial state for protocol
                readBuffer: new Uint8Array(0),
            });

            console.log(`[INFO] New connection: ${connId}`);
        },

        /** Called when data is received from the client */
        data(socket, data) {
            const connId = getConnId(socket);

            if (!connId) {
                // If we somehow lost the ID, close the socket to prevent leaks
                socket.end();
                return;
            }

            // In a low-level Bun TCP socket, data is usually a BufferSource.
            // Append new data to the connection's read buffer
            state = updateConnection(state, connId, (conn) => {
                const dataArray = new Uint8Array(data);

                // Use Buffer.concat for an optimized operation.
                const newBuffer = Buffer.concat([conn.readBuffer, dataArray]);

                return { ...conn, readBuffer: newBuffer };
            });

            // Process accumulated data
            processBuffer(connId);
        },

        /** Called when the socket is ready for more outgoing data (backpressure relief) */
        drain(socket) {
            const connId = getConnId(socket);
            if (connId) {
                flushSink(connId);
            }
        },

        /** Called when a client disconnects */
        close(socket) {
            const connId = getConnId(socket);

            if (connId) {
                // Clean up state and resources
                state = removeConnection(state, connId);
                sockets.delete(connId);
                sinks.delete(connId);
                console.log(`[INFO] Connection closed: ${connId}`);
            }
        },

        /** Called on socket-level errors */
        error(socket, error) {
            const connId = getConnId(socket) || "unknown";
            console.error(`[ERROR] Socket error for ${connId}:`, error);
            // Error handling usually doesn't need to manually delete the socket/sink,
            // as the 'close' event typically follows an 'error' event.
        },
    },
});

console.log(`\n🚀 NeoMinecraft-like server started on port ${server.port}`);
console.log(`📊 Add server in Minecraft: ${server.hostname}:${server.port}\n`);

// Prevent Bun from exiting immediately
// (Bun will keep the process alive while the listener is active, but this is a good practice)
// This line is often unnecessary in modern Bun versions when a listener is active,
// but included for clarity on what starts the process.
// (async () => {})()
