// ============================================
// FILE: src/server-logic/effects.ts
// ============================================

import type { OutgoingPacket } from "../protocol/types.ts";

/** Side effects that handlers can request */
export type Effect =
    | { type: "send_packet"; connId: string; packet: OutgoingPacket }
    | { type: "disconnect"; connId: string; reason: string }
    | { type: "log"; level: "info" | "warn" | "error"; message: string };

/** Interpreter that performs side effects */
export type EffectInterpreter = {
    sendPacket: (connId: string, packet: OutgoingPacket) => void;
    disconnect: (connId: string, reason: string) => void;
    log: (level: string, message: string) => void;
};

/** Run list of effects using interpreter */
export function runEffects(
    effects: Effect[],
    interpreter: EffectInterpreter,
): void {
    for (const effect of effects) {
        switch (effect.type) {
            case "send_packet":
                interpreter.sendPacket(effect.connId, effect.packet);
                break;
            case "disconnect":
                interpreter.disconnect(effect.connId, effect.reason);
                break;
            case "log":
                interpreter.log(effect.level, effect.message);
                break;
        }
    }
}
