# Overview

This project is a **functional TypeScript Minecraft server** built on **Bun**.
Its goal is to be **modular**, **hot-reloadable**, and **data-driven**, while
keeping close to the official **Minecraft protocol**.

The system is split into **four layers**:

```
network → protocol → server-logic → game-logic
```

Each layer focuses on a specific problem domain:

| Layer           | Purpose                                 |
| --------------- | --------------------------------------- |
| `network/`      | Raw TCP/UDP sockets — pure transport    |
| `protocol/`     | Minecraft packet encoding/decoding      |
| `server-logic/` | Simulation and scheduling — the "brain" |
| `game-logic/`   | Rules and behaviors — the "soul"        |

These layers form a **data pipeline**, not a class hierarchy. Everything
communicates through **typed data**, not shared state.

---

# Design Principles

## 🧩 1. Layer Isolation

Each layer is replaceable and testable. For example, you can rewrite
`game-logic` entirely without touching networking code.

## 🔁 2. Data over Objects

Players, worlds, entities, and packets are **plain data** (`struct-like` types),
not classes. Behavior is defined by **functions**, not methods.

## ⚙️ 3. Hot Reloadable

Because logic layers are stateless or referentially transparent, they can be
reloaded at runtime.

## 🧠 4. Controlled State Flow

Not everything is passed around (like a giant `world` object). Each function
gets only what it needs — e.g., block state, player inventory, or a subset of
chunk data.

## ⏱ 5. Clear Responsibilities

- **Game logic:** decides what _should happen_.
- **Server logic:** executes what _does happen_.
- **Protocol:** defines _how it’s communicated_.
- **Network:** actually sends/receives bytes.

---

# Directory Structure

```
src/
├─ main.ts                      # Entrypoint: Real server here, we use the pipeline here!
│
├─ network/                     # Bun networking (TCP/UDP)
│  ├─ tcp.ts                    # Minecraft TCP server (main transport)
│  ├─ udp.ts                    # (optional) future Bedrock support
│  └─ types.ts                  # Connection, SocketData, etc.
│
├─ protocol/                    # Minecraft protocol (encoding/decoding, states)
│  ├─ codec/
│  │  ├─ decode.ts              # Packet → structured object
│  │  └─ encode.ts              # Object → packet bytes
│  ├─ packets/
│  │  ├─ handshake.ts
│  │  ├─ status.ts
│  │  ├─ login.ts
│  │  ├─ play.ts
│  │  └─ ...
│  ├─ states.ts                 # Connection state machine (handshake, login, play)
│  ├─ constants.ts              # Protocol version, IDs, etc.
│  └─ types.ts                  # Packet types and shared protocol structs
│
├─ server-logic/                # The engine brain — ticks, scheduling, simulation
│  ├─ tick.ts                   # Main tick runner (world + logic update)
│  ├─ scheduler.ts              # Manages tick intervals and deferred tasks
│  ├─ state.ts                  # Server-wide data: players, worlds, queues
│  ├─ actions/                  # Server decisions triggered by events
│  │  ├─ blockInteraction.ts
│  │  ├─ playerMovement.ts
│  │  └─ ...
│  ├─ events/                   # Entry points for protocol events
│  │  ├─ playerJoin.ts
│  │  ├─ playerLeave.ts
│  │  ├─ blockDig.ts
│  │  └─ ..
│  └─ types.ts                  # Core server state types
│
└─ game-logic/                  # Defines how the world behaves
   ├─ rules/
   │  ├─ redstone.ts            # Can turn into a folder.
   │  ├─ blockPhysics.ts        # Can turn into a folder.
   │  ├─ environment.ts        
   │  ├─ entityAI/
   │  │  ├─ villager.ts
   │  │  ├─ zombie.ts
   │  │  └─ ...
   │  └─ ...
   ├─ data/
   │  ├─ blocks.ts              # Block definitions (hardness, drops, etc.)
   │  ├─ items.ts               # Tool data (durability, speed, etc.)
   │  ├─ biomes.ts              # Biome data and modifiers
   │  └─ ...
   └─ types.ts
```

---

# Layer Explanations

## 🧮 network/

**Purpose:** Raw socket communication (TCP/UDP). Handles encryption,
compression, and stream management.

**Why:** Keeps runtime-dependent logic (Bun’s socket API) separate. Switching to
Node or Deno later will only require swapping this layer.

**Interaction:**

- Emits events like `{ connection, data, close }`.
- Passes binary packets upward to `protocol`.
- Sends encoded packets back to the client.

---

## 🔡 protocol/

**Purpose:** Decode and encode Minecraft protocol packets.

**Why:** The Minecraft protocol changes frequently. Keeping this isolated allows
updates or version swaps without touching game logic.

**Interaction:**

- Converts between raw bytes and structured packet data.
- Holds constants, version numbers, and state machines.
- Never makes gameplay decisions.

Example conceptual flow:

```
network (bytes)
→ protocol.decode(...)
→ { type: "block_dig", position, face, status }
→ server-logic
```

_Note: Changes in protocol(version change) does should not mean we let go of the
old protocol version. Rigt now, dont think about this but note this. Protocol
layer should be Multi-version i think._

---

## 🧠 server-logic/

**Purpose:** The “brain” of the server — simulation, ticking, state updates, and
player/world management.

**Why:** Defines **how to think** — scheduling, processing inputs, and feeding
data to game-logic.

**Responsibilities:**

- Run tick loops
- Manage server state and tasks
- Handle events (player join/leave, block dig, etc.)
- Collect decisions from game-logic and turn them into actions

**Example Flow:**

1. Receives packet `{ type: "block_dig" }` from `protocol`.
2. Calls into `game-logic` for rule evaluation:

   ```
   const progress = gameLogic.rules.block.breakProgress(player, block, tool); //the code should not look like this. This is an oversimplified and abstracted example of usage.
   ```
3. If progress completes, triggers:

   ```
   const newState = gameLogic.rules.block.break(world, pos); //the code should not look like this. This is an oversimplified and abstracted example of usage.
   ```
4. Aggregates state changes, queues outgoing packets for affected players.

---

## 🌍 game-logic/

**Purpose:** The behavior of the server — rules of the world, entities, and
physics.

**Why:** Developers often want to change Minecraft’s behavior (AI, redstone,
physics). This layer defines those rules while staying within protocol limits.

**Responsibilities:**

- Define how entities, blocks, and environments behave.
- Return pure data describing _what should happen_, not how it’s executed.
- Never talk to the network or protocol directly.

Example conceptual rule:

```
player uses tool → breakProgress = f(tool.speed, block.hardness)
if progress >= 1 → return [{ type: "block_break", pos }]
```

---

# How Layers Communicate

| From           | To             | Data                         | Description               |
| -------------- | -------------- | ---------------------------- | ------------------------- |
| `network`      | `protocol`     | raw bytes → packet           | Input from clients        |
| `protocol`     | `server-logic` | structured packet            | Game event data           |
| `server-logic` | `game-logic`   | context (player, world part) | Evaluate rules            |
| `game-logic`   | `server-logic` | behavior results             | Return changes            |
| `server-logic` | `protocol`     | packet                       | Prepare outgoing messages |
| `protocol`     | `network`      | bytes                        | Write to socket           |

The flow is **one-directional per event**, but data can loop naturally (e.g., a
tick triggers updates).

---

# Data Passing Philosophy

Avoid passing the entire `world` object through every function. Instead, use
**minimal context slices**:

- For block events: pass block and its releted params(ex: surroundings).
- For entities: pass the entity and releted data(ex: nearby environment).
- For global ticks: pass a reference to the simulation state.

This makes data movement predictable, reduces coupling, and enables caching or
worker-based parallelism later.

---

# Example Conceptual Flow (No Code)

> Player breaks a block.

1. `network` captures raw packet → hands it to `protocol`.
2. `protocol` decodes → `{ type: "block_dig", pos, status }`.
3. `server-logic` receives event:

   - Looks up `player`, `block`, and relevant chunk.
   - Calls `game-logic.rules.block.breakProgress(...)`. (the code should not
     look like this. This is an oversimplified and abstracted example of usage.)
4. `game-logic` calculates progress → returns a result (not a new world).
5. `server-logic` uses that result:

   - If not finished, sends “progress” packet.
   - If finished, calls `game-logic.rules.block.break(...)`.
6. `game-logic` says “block breaks” → returns actions.
7. `server-logic` applies those, queues world updates for nearby players.

Every layer only does its own job. No layer knows the internals of another.

---

# Why This Architecture

| Principle                 | Benefit                                             |
| ------------------------- | --------------------------------------------------- |
| **Isolation of concerns** | Each part can evolve independently                  |
| **Data-oriented**         | Simpler reasoning, faster testing                   |
| **Functional behavior**   | Deterministic results and hot reload possible       |
| **Low coupling**          | Easier to extend (AI, blocks, new rules)            |
| **Realistic performance** | Avoids heavy world and data copies                  |
| **Protocol flexibility**  | Supports custom or future Minecraft versions easily |

---

# Summary

- **No `index.ts` entry files**, everything is explicit.
- **Functional, but pragmatic** — we use simple data and clear logic.
- **Composable layers** — replaceable without rewriting the system.
- **Server logic is the thinker**, **game logic is the behavior**.
- **World slices**, not whole world objects, are passed around.
- Designed for **clarity, performance, and modification**.
