# NeoMinecraft

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## The Data Flow(pipeline)

1. TCP Data (Buffer)
2. network.decode(buffer)
3. mprotocol.decode(packet)
4. serverLogic.input(event)
5. gameLogic.react(event)
6. serverLogic.apply(actions)
7. mprotocol.encode(packets)
8. network.send(buffers)

### Example

1. Client sends BlockDig packet
2. network → raw bytes
3. mprotocol.decode → { type: 'BlockDig', position }
4. server-logic receives → create GameEvent: 'PlayerDigBlock'
5. game-logic.rules.block.break(world, pos, player)
6. returns actions: [ { setBlock: 'air' }, { dropItem: 'cobblestone' } ]
7. server-logic applies world diff, triggers outbound packets
8. mprotocol.encode → [BlockUpdate, SpawnEntity]
9. network.send → to all nearby players

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com)
is a fast all-in-one JavaScript runtime.
