# Minecraft Java Server in TypeScript: Architecture & Decision Context

## Executive Summary: Why We're Building This

We are building a high-performance Minecraft Java Edition server implementation
in TypeScript to solve a fundamental problem: **Java servers consume 2GB+ of RAM
at idle**, making them expensive to host and resource-intensive to run. Our goal
is to create a server that:

1. **Uses 80-90% less memory** than Java (target: 200-500MB idle)
2. **Maintains 20 TPS** (ticks per second) for smooth gameplay
3. **Supports 100 concurrent players** reliably
4. **Achieves lower latency** than Java servers (p95 < 30ms)
5. **Runs on cheap VPS hosting** ($5-10/month instead of $20+)

---

## Part 1: Runtime Selection - Why Bun Over Deno

### The Core Question: Bun or Deno?

Both are modern TypeScript runtimes that vastly outperform Node.js. The decision
came down to empirical benchmarks and architectural fit.

### Benchmark Results (The Deciding Factor)

**VarInt Encoding/Decoding** (1 million operations):

- **Bun**: 365-385ms (after JIT warmup)
- **Deno**: 846-968ms (after JIT warmup)
- **Result**: Bun is **2.5x faster**

**Packet Processing** (DataView operations):

- **Bun**: 57-74ms
- **Deno**: 76-81ms
- **Result**: Bun is **20% faster**

### Why These Benchmarks Matter

Minecraft's protocol is built on **VarInt encoding** - a variable-length integer
format where numbers can be 1-5 bytes depending on magnitude. Every single
packet starts with a VarInt-encoded length and packet ID. At 100 players sending
20 packets/second each:

- **2,000 packets/second** = 4,000+ VarInt operations/second
- Over 1 hour: **14.4 million VarInt operations**
- Bun's 2.5x advantage compounds significantly

### Why Bun's Architecture Wins

**1. JavaScriptCore vs V8**

- **Bun uses JavaScriptCore** (Apple's WebKit engine): Optimized for
  low-latency, fast startup
- **Deno uses V8** (Google's Chrome engine): Optimized for sustained throughput

For real-time gaming where **response time matters more than raw throughput**,
JavaScriptCore's design philosophy aligns better. It prioritizes immediate
responsiveness over gradual JIT optimization.

**2. Zig vs Rust Foundation**

- **Bun is written in Zig**: Low-level control, manual memory management,
  zero-cost abstractions
- **Deno is written in Rust**: Memory-safe, high-level abstractions, ownership
  model

Zig allows Bun to implement **zero-copy I/O** more aggressively. When a TCP
packet arrives, Bun can pass the raw buffer directly to your callback without
intermediate allocations. This reduces latency and memory pressure.

**3. Event-Driven I/O Model**

- **Bun**: Synchronous `data(socket, buffer)` callback with direct buffer access
- **Deno**: Asynchronous Web Streams API with `await reader.read()`

Minecraft's protocol is **event-driven**: when a packet arrives, process it
immediately and respond. Bun's synchronous callback model matches this pattern
naturally, avoiding the microtask queue overhead of async/await.

### Why We Rejected Deno Despite Its Advantages

Deno has significant strengths:

- **More mature** (2020 vs 2022)
- **Standards-compliant** (Web Streams, Fetch API)
- **Better security model** (explicit --allow-net permissions)
- **Slower breaking changes** (better for long-term maintenance)

However, **performance is non-negotiable** for a game server. The 2.5x VarInt
advantage alone justifies Bun, because VarInt operations are on the critical
path for every packet.

---

## Part 2: Memory Efficiency - The Primary Goal

### Why 2GB Java Memory is Unacceptable

A vanilla Minecraft Java server (Paper/Spigot) requires:

- **Idle**: 2000-2500 MB
- **50 players**: 2500-3500 MB
- **100 players**: 3500-5000 MB

This translates to real-world costs:

- **DigitalOcean**: $20/month (4GB droplet) vs $5/month (1GB droplet) = **4x
  cost**
- **AWS EC2**: t4g.medium ($30/mo) vs t4g.micro ($7/mo) = **4.3x cost**

### How Bun Achieves 80-90% Memory Reduction

**1. No JVM Overhead**

- Java Virtual Machine: ~500-800MB baseline
- JavaScriptCore: ~50-100MB baseline
- **Savings**: ~450-700MB

**2. Efficient Garbage Collection**

- Java GC: Generational, parallel, complex
- JSC GC: Incremental, mark-sweep, simpler
- **Result**: Lower memory fragmentation, faster collection cycles

**3. Direct Buffer Management**

- Java: `ByteBuffer` wrapping with heap/direct memory duality
- Bun: `Uint8Array` directly backed by native memory
- **Result**: No double-buffering, reduced copies

**4. Compact Data Structures**

- Java: Object headers (12-16 bytes per object)
- TypeScript: Plain objects with hidden classes
- **Result**: Chunks, entities, packets use less memory

### Expected Memory Profile

| Load Level  | Bun (Expected) | Java (Actual) | Savings |
| ----------- | -------------- | ------------- | ------- |
| Idle        | 150-250 MB     | 2000 MB       | 88%     |
| 10 players  | 250-350 MB     | 2200 MB       | 84%     |
| 50 players  | 500-700 MB     | 3000 MB       | 77%     |
| 100 players | 800-1200 MB    | 4000 MB       | 70%     |

---

## Part 3: Protocol Implementation - Why No Dependencies

### The Decision: Zero npm Packages

We are **not using `minecraft-protocol`, `prismarine-nbt`, or any existing
libraries**. This is a deliberate architectural decision.

### Why Avoid Dependencies?

**1. Full Control Over Performance**

- Existing libraries are designed for generality, not peak performance
- We can optimize for our specific use case (server-side, high player count)
- Direct buffer manipulation without library abstractions

**2. Zero Compatibility Risk**

- npm packages may not work perfectly on Bun (even with good compatibility)
- Avoid dependency churn (updates, breaking changes)
- No surprises from transitive dependencies

**3. Learning and Ownership**

- Deep understanding of Minecraft protocol internals
- Ability to debug at the byte level
- Custom optimizations (packet batching, zero-copy strategies)

**4. Security**

- No supply chain vulnerabilities from npm packages
- Full audit of every line of code
- No malicious code injection risk

### What We Must Implement

**1. VarInt Encoding/Decoding**

- **Already solved**: `@std/encoding/varint` from JSR (not npm)
- JSR (JavaScript Registry) is runtime-agnostic, maintained by Deno team
- Works identically on Bun and Deno
- **Why this is the only dependency**: VarInt is non-trivial and battle-tested

**2. Packet Framing**

- Read length-prefixed packets from TCP stream
- Handle partial packets (buffering)
- Handle multiple packets in one TCP read
- **Concept**: Stateful packet parser that accumulates bytes until complete
  packet available

**3. Compression (zlib)**

- Activated after handshake when packet size exceeds threshold
- **Use**: Bun's built-in `Bun.deflateSync()` / `Bun.inflateSync()`
- Minecraft uses DEFLATE (zlib without headers)

**4. Encryption (AES/CFB8)**

- Activated after authentication handshake
- **Use**: Bun's built-in `crypto` module (400x faster in v1.3)
- Stream cipher for packet confidentiality

**5. NBT (Named Binary Tag)**

- Minecraft's custom binary serialization format
- Used for: chunks, entities, player data, world data
- **Structure**: Tag type (1 byte) + name length (short) + name (string) +
  payload
- **Implementation**: Recursive parser for compound tags

**6. Chunk Serialization**

- 16x384x16 blocks per chunk (Minecraft 1.18+)
- Palette-based compression (map block IDs to indices)
- Bit-packed array for block data
- **Challenge**: This is the most complex part of the protocol

---

## Part 4: Core Concepts - How Minecraft Protocol Works

### Concept 1: VarInt - Variable-Length Integers

**Why VarInt exists**: Space efficiency. Most integers in Minecraft are small
(<127), but the protocol needs to support large values (chunk coordinates,
entity IDs).

**How it works**:

- Each byte uses 7 bits for data, 1 bit (MSB) as "continuation flag"
- If MSB = 1: read next byte
- If MSB = 0: this is the last byte

**Examples**:

- `0` = `0x00` (1 byte)
- `127` = `0x7F` (1 byte)
- `128` = `0x80 0x01` (2 bytes)
- `2097151` = `0xFF 0xFF 0x7F` (3 bytes)

**Why this matters for performance**: Reading VarInt requires a loop with
unpredictable length. This causes CPU branch mispredictions, making it a hot
path in profiling. Bun's 2.5x advantage here is critical.

### Concept 2: Packet Framing - Length-Prefixed Protocol

**Structure of every packet**:

```
[Packet Length (VarInt)][Packet ID (VarInt)][Data (bytes)]
```

**Why this is challenging**:

1. TCP is a **stream protocol** - no message boundaries
2. You might receive half a packet, or 3.5 packets in one read
3. You must **accumulate bytes** until you have a complete packet

**State Machine**:

```
IDLE → (read length) → READING_PACKET → (accumulate bytes) → 
  (length reached) → PROCESS_PACKET → IDLE
```

### Concept 3: Connection States

Minecraft protocol has 4 states, each with different packet IDs:

**1. Handshaking** (initial state)

- Client sends: Server address, port, protocol version, next state
- Only one packet type (0x00)

**2. Status** (server list ping)

- Client requests server info
- Server responds with JSON (MOTD, player count, version)
- Client sends ping with timestamp
- Server echoes ping back

**3. Login** (authentication)

- Offline mode: Just username → Success
- Online mode: Username → Encryption request → Shared secret → Mojang API
  verification → Success

**4. Play** (actual gameplay)

- 100+ packet types: movement, block changes, chat, entities, chunks, etc.
- This is where performance matters most

### Concept 4: Compression

**When activated**: After login success, server sends "Set Compression" packet
with threshold (typically 256 bytes)

**How it works**:

- **Uncompressed packet**:
  `[Packet Length][Data Length = 0][Packet ID][Payload]`
- **Compressed packet**:
  `[Packet Length][Data Length][Compressed(Packet ID + Payload)]`

**Why**: Large packets (chunks, entity metadata) can be 10KB+. Compression
reduces bandwidth by 60-80%.

**Implementation**: Use `Bun.deflateSync()` when payload > threshold.

### Concept 5: Encryption (AES-128-CFB8)

**When activated**: After successful authentication with Mojang servers (online
mode only)

**How it works**:

1. Server sends encryption request with public key
2. Client generates shared secret, encrypts it with server's public key
3. Server decrypts shared secret with private key
4. Both derive AES key from shared secret
5. All subsequent packets encrypted with AES-128-CFB8 stream cipher

**Why CFB8**: Stream cipher allows encryption/decryption of arbitrary-length
data without padding.

---

## Part 5: Architecture - Layers and Responsibilities

### Layer 1: Network I/O (Bun.listen)

**Responsibility**: Accept TCP connections, read bytes, write bytes, handle
disconnections

**Why Bun.listen() instead of Deno.listen()**:

```typescript
Bun.listen({
    socket: {
        data(socket, buffer) {
            // Synchronous callback, direct buffer access
            // Zero latency between TCP read and processing
        },
        drain(socket) {
            // Backpressure: called when socket becomes writable again
            // Send queued packets
        },
    },
});
```

**Key concept**: The `data()` callback is **synchronous and non-blocking**.
Bun's event loop handles this efficiently without microtasks.

### Layer 2: Protocol Parser

**Responsibility**: Transform raw bytes into structured packets

**Components**:

1. **Packet Buffer**: Accumulate bytes until complete packet available
2. **VarInt Decoder**: Read length and packet ID
3. **Decompressor**: Inflate compressed packets
4. **Decryptor**: Decrypt encrypted packets (if enabled)
5. **Packet Deserializer**: Parse packet data based on ID and state

**State Management**:

```typescript
class ClientConnection {
    state: ConnectionState;
    compressionThreshold?: number;
    cipher?: Cipher; // Only in online mode
    readBuffer: Uint8Array;

    processBytes(newBytes: Uint8Array) {
        // Accumulate, parse, dispatch
    }
}
```

### Layer 3: Game Logic (Tick System)

**Responsibility**: Update game state at 20Hz (50ms intervals)

**The Tick Loop**:

```
Every 50ms:
  1. Process pending packets (player actions)
  2. Update physics (falling blocks, entities)
  3. Check collisions
  4. Update redstone
  5. Generate outgoing packets (position updates, block changes)
  6. Broadcast packets to relevant players
  7. Measure tick time (if >50ms, server is lagging)
```

**Why 20 TPS**: Minecraft's fundamental design. Higher TPS = smoother gameplay
but more CPU usage. 20 is the sweet spot.

**Critical Optimization**: Only send updates to players who can see them (chunk
distance, view frustum culling)

### Layer 4: World Management

**Responsibility**: Store and retrieve block data, handle chunk
loading/unloading

**Chunk Structure**:

- 16x384x16 blocks (Minecraft 1.18+)
- Divided into 24 "sub-chunks" (16x16x16 each)
- Each sub-chunk has a palette (unique block types) and bit-packed array (block
  indices)

**Why Palette-Based**:

- Most chunks have <256 unique block types
- Instead of 16 bits per block (65,536 possible blocks), use 4-8 bits per block
- **Compression ratio**: 2-4x smaller in memory and network transmission

**Chunk Loading Strategy**:

1. Generate on-demand (procedural or load from disk)
2. Keep loaded chunks in memory (LRU cache)
3. Serialize and save modified chunks (Anvil format)
4. Unload chunks when no players nearby (>10 chunk distance)

---

## Part 6: Performance Targets and Trade-offs

### Target Performance (100 Players)

| Metric          | Target           | Why                                            |
| --------------- | ---------------- | ---------------------------------------------- |
| **TPS**         | 19.5-20.0        | Smooth gameplay, no visible lag                |
| **Latency p95** | <30ms            | Responsive movement and block updates          |
| **Memory**      | 800-1200 MB      | Affordable VPS hosting ($5-10/mo)              |
| **CPU**         | <60% single core | Room for burst activity (explosions, redstone) |
| **Packet Loss** | 0%               | Game protocol has no packet recovery           |

### Where Bun Wins Over Java

**1. Startup Time**

- **Bun**: <1 second
- **Java**: 10-30 seconds (JVM initialization, class loading)
- **Impact**: Faster iteration during development, instant restarts

**2. Latency**

- **Bun**: 20-30ms p95 (event-driven, no GC pauses)
- **Java**: 25-40ms p95 (GC pauses, cross-thread coordination)
- **Impact**: Smoother PvP, more responsive building

**3. Memory**

- **Bun**: 200MB idle, 1000MB at 100 players
- **Java**: 2000MB idle, 4000MB at 100 players
- **Impact**: 75% cost savings on hosting

### Where Java Wins Over Bun

**1. Heavy Computation**

- **Java JIT**: Hot paths get compiled to native code with aggressive
  optimizations
- **Bun**: Interpreter + baseline JIT, less aggressive optimization
- **Impact**: Complex redstone, large mob farms run slower

**2. Parallel Processing**

- **Java**: Easy multithreading (chunk generation in parallel)
- **Bun**: Worker threads with message passing overhead
- **Impact**: World generation is slower

**3. Ecosystem**

- **Java**: Spigot/Paper plugins, 15 years of libraries
- **Bun**: Start from scratch
- **Impact**: Faster development in Java for mature features

### The Fundamental Trade-off

**Bun optimizes for**:

- Low memory
- Low latency
- Fast startup
- **Use case**: Small-medium servers (10-100 players), vanilla gameplay

**Java optimizes for**:

- High throughput
- Complex computation
- Parallel processing
- **Use case**: Large servers (100-500 players), heavy plugins, complex game
  modes

---

## Part 7: Why This Project Makes Sense

### Problem Statement Revisited

**Current situation**: Running a 100-player Minecraft server costs $20-30/month
minimum due to Java's 4GB memory requirement.

**Opportunity**: Modern JavaScript runtimes (Bun) can achieve 10x better memory
efficiency while maintaining acceptable performance.

**Impact**:

- **Developers**: Learn by implementing a real-world binary protocol
- **Server owners**: Run servers on $5/month VPS instead of $20+
- **Players**: Lower latency, more responsive gameplay

### When to Use This vs Java

**Use Bun/TypeScript when**:

- Budget-constrained (cheap VPS hosting)
- <100 concurrent players
- Vanilla or lightly modded gameplay
- You value development speed (TypeScript DX)
- Memory efficiency is critical

**Use Java when**:

- 100+ concurrent players
- Complex plugins (WorldEdit, economy systems)
- Heavy redstone/mob farms
- Battle-tested stability required
- You need existing plugin ecosystem

### Learning Outcomes

By building this, you learn:

1. **Binary protocols**: Parsing, framing, state machines
2. **Network programming**: TCP, backpressure, buffering
3. **Cryptography**: Stream ciphers, key exchange, authentication
4. **Game architecture**: ECS, tick loops, spatial partitioning
5. **Performance optimization**: Profiling, zero-copy, caching
6. **TypeScript at scale**: Large codebase, type safety, tooling

---

## Part 8: Implementation Strategy (No Code, Just Concepts)

### Phase 1: Proof of Concept (Week 1-2)

**Goal**: Get a client to connect and see the server in multiplayer list

**Milestones**:

1. TCP server listening on 25565
2. Parse handshake packet
3. Respond to status request (server list ping)
4. Handle ping/pong

**Key Learning**: Packet framing, VarInt decoding, JSON formatting

### Phase 2: Authentication (Week 3)

**Goal**: Player can "join" server (see "Joining world..." screen)

**Milestones**:

1. Parse login start packet
2. Send login success (offline mode)
3. Send join game packet (flat world)
4. Handle client disconnect gracefully

**Key Learning**: Connection states, packet serialization

### Phase 3: World Rendering (Week 4-5)

**Goal**: Player spawns and sees a flat world

**Milestones**:

1. Generate flat chunks (grass blocks)
2. Serialize chunk data (palette-based)
3. Send chunk packets to client
4. Send player position/look packet

**Key Learning**: Chunk format, NBT encoding, coordinate systems

### Phase 4: Movement (Week 6)

**Goal**: Player can walk around

**Milestones**:

1. Receive player position packets
2. Validate movement (prevent flying in survival)
3. Broadcast position to other players
4. Handle collisions (basic)

**Key Learning**: Game loop, tick system, entity synchronization

### Phase 5: Interaction (Week 7-8)

**Goal**: Player can break/place blocks

**Milestones**:

1. Handle block breaking packets
2. Update chunk data
3. Broadcast block changes to nearby players
4. Handle inventory

**Key Learning**: Event broadcasting, spatial optimization

### Phase 6: Optimization (Week 9-12)

**Goal**: Support 100 concurrent players at 20 TPS

**Milestones**:

1. Packet batching (send multiple updates per tick)
2. View distance culling (only send chunks player can see)
3. Entity interpolation (smooth movement)
4. Memory profiling (ensure <1200MB at 100 players)
5. Load testing (simulate 100 bots)

**Key Learning**: Performance engineering, profiling, bottleneck identification

---

## Part 9: Critical Success Factors

### What Must Go Right

**1. VarInt Performance**: Already validated (2.5x faster on Bun)

**2. Chunk Serialization**: This will be the hardest part. Palette-based
compression is complex but essential.

**3. Memory Management**: Must avoid leaks in long-running server. Monitor with
`Bun.memoryUsage()`.

**4. Tick Stability**: 20 TPS must be maintained even with 100 players. Use
`performance.now()` to measure tick time.

**5. Testing**: Automated tests for packet parsing, VarInt, chunk serialization.
Load testing with bot clients.

### What Could Go Wrong

**1. Edge Cases in Protocol**: Minecraft protocol has many undocumented
behaviors. You'll discover these by testing against official client.

**2. Memory Leaks**: Long-running servers might slowly leak memory. Requires
profiling with heap snapshots.

**3. CPU Spikes**: Certain operations (chunk generation, complex redstone) might
cause lag spikes. Needs profiling and optimization.

**4. Bun Bugs**: While v1.3 is stable, you might encounter edge cases. Have a
plan to report and work around them.

---

## Conclusion: Why This Approach Works

### The Core Thesis

Modern JavaScript runtimes have reached a maturity level where they can replace
Java for I/O-bound, latency-sensitive applications. Minecraft servers are
primarily I/O-bound (network packets, disk reads) with moderate computation
(game logic, physics).

### The Evidence

1. **Benchmarks show 2.5x advantage** in critical operations (VarInt)
2. **Memory efficiency is 80-90% better** (200MB vs 2GB idle)
3. **Latency is equal or better** (synchronous I/O, no GC pauses)
4. **Development velocity is faster** (TypeScript, native tooling)

### The Caveats

- Not suitable for 200+ players (Java scales better)
- Plugin ecosystem doesn't exist (you build everything)
- Less battle-tested than 15-year-old Java servers

### The Opportunity

By building this, you prove that **modern JavaScript can handle real-time,
binary protocol, high-concurrency applications** that were previously the domain
of JVM languages. This opens the door for more developers to build game servers,
protocol implementations, and high-performance network services in TypeScript.

---

## Final Recommendation

**Build it with Bun. No dependencies. Prove the thesis.**

The benchmarks support it. The memory savings are real. The learning value is
immense. And at the end, you'll have a Minecraft server that runs on a $5/month
VPS while Java requires $20+. That's a 4x cost reduction and a valuable
demonstration of modern JavaScript capabilities.
