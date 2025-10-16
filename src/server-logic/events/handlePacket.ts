// ============================================
// FILE: src/server-logic/events/handlePacket.ts
// ============================================

import type { ServerState } from "../state.ts";
import type { IncomingPacket, StatusResponse } from "../../protocol/types.ts";
import type { Effect } from "../effects.ts";
import { updateConnection } from "../state.ts";

export type HandlerContext = {
    state: ServerState;
    connId: string;
    packet: IncomingPacket;
};

export type HandlerResult = {
    newState: ServerState;
    effects: Effect[];
};

/** Route packet to appropriate handler */
export function handlePacket(ctx: HandlerContext): HandlerResult {
    const { packet } = ctx;

    if (packet.type === "handshake") {
        return handleHandshake(ctx);
    } else if (packet.type === "status_request") {
        return handleStatusRequest(ctx);
    } else if (packet.type === "ping_request") {
        return handlePingRequest(ctx);
    }

    return {
        newState: ctx.state,
        effects: [
            {
                type: "log",
                level: "warn",
                //@ts-expect-error
                message: `Unknown packet: ${packet.type}`,
            },
        ],
    };
}

function handleHandshake(ctx: HandlerContext): HandlerResult {
    const packet = ctx.packet as Extract<IncomingPacket, { type: "handshake" }>;

    const newState = updateConnection(ctx.state, ctx.connId, (conn) => ({
        ...conn,
        state: packet.nextState === 1 ? "status" : "login",
    }));

    return {
        newState,
        effects: [
            {
                type: "log",
                level: "info",
                message: `Handshake: protocol=${packet.protocolVersion}, next=${
                    packet.nextState === 1 ? "status" : "login"
                }`,
            },
        ],
    };
}

function handleStatusRequest(ctx: HandlerContext): HandlerResult {
    const response: StatusResponse = {
        version: {
            name: "NeoMinecraft 1.21.3",
            protocol: 768, // 1.21.3 protocol version
        },
        players: {
            max: 100,
            online: 0,
            sample: [],
        },
        description: {
            text:
                "§6NeoMinecraft §7- §bFunctional TypeScript Server\n§7Built with Bun 🚀",
        },
    };

    return {
        newState: ctx.state,
        effects: [
            {
                type: "send_packet",
                connId: ctx.connId,
                packet: { type: "status_response", response },
            },
            {
                type: "log",
                level: "info",
                message: "Status request handled",
            },
        ],
    };
}

function handlePingRequest(ctx: HandlerContext): HandlerResult {
    const packet = ctx.packet as Extract<
        IncomingPacket,
        { type: "ping_request" }
    >;

    return {
        newState: ctx.state,
        effects: [
            {
                type: "send_packet",
                connId: ctx.connId,
                packet: { type: "ping_response", payload: packet.payload },
            },
            {
                type: "log",
                level: "info",
                message: `Ping responded: ${packet.payload}`,
            },
        ],
    };
}
