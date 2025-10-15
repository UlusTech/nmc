/**
 * Both TCP servers and sockets can be hot reloaded with new handlers.
 *
 * ```ts
 * //reloads handlers for all active server-side sockets
 * server.reload({
 *   socket: {
 *     data(){
 *       // new 'data' handler
 *     }
 *   }
 * })
 * ```
 */
const tcpServer = Bun.listen({
    hostname: "localhost",
    port: 25565,
    socket: {
        open(socket) {},
        data(socket, data) {
            /**
             * Currently, TCP sockets in Bun do not buffer data. For performance-sensitive code, it's important to consider buffering carefully. For example, this:
             * ```ts
             * socket.write("h");
             * socket.write("e");
             * socket.write("l");
             * socket.write("l");
             * socket.write("o");
             * ```
             * ...performs significantly worse than this:
             * ```ts
             * socket.write("hello");
             * ```
             * To simplify this for now, consider using Bun's ArrayBufferSink with the {stream: true} option:
             * ```ts
             * import { ArrayBufferSink } from "bun";
             *
             * const sink = new ArrayBufferSink();
             * sink.start({ stream: true, highWaterMark: 1024 });
             *
             * sink.write("h");
             * sink.write("e");
             * sink.write("l");
             * sink.write("l");
             * sink.write("o");
             *
             * queueMicrotask(() => {
             *   const data = sink.flush();
             *   const wrote = socket.write(data);
             *   if (wrote < data.byteLength) {
             *     // put it back in the sink if the socket is full
             *     sink.write(data.subarray(wrote));
             *   }
             * });
             * ```
             */
        },
        drain(socket) {},
        close(socket, error) {},
        error(socket, error) {},
    },
});

Bun.udpSocket({
    hostname: "localhost",
    port: 25565,
    socket: {
        /**
         * While UDP does not have a concept of a connection, many UDP communications (especially as a client) involve only one peer. In such cases it can be beneficial to connect the socket to that peer, which specifies to which address all packets are sent and restricts incoming packets to that peer only.
         * ```ts
         * const server = await Bun.udpSocket({
         *   socket: {
         *     data(socket, buf, port, addr) {
         *       console.log(`message from ${addr}:${port}:`);
         *       console.log(buf.toString());
         *     },
         *   },
         * });
         * const client = await Bun.udpSocket({
         *   connect: {
         *     port: server.port,
         *     hostname: "127.0.0.1",
         *   },
         * });
         *
         * client.send("Hello");
         * ```
         */
        data(socket, data) {},
        /**
         * Handle backpressure
         * It may happen that a packet that you're sending does not fit into the operating system's packet buffer. You can detect that this has happened when:
         *
         * send returns false
         * sendMany returns a number smaller than the number of packets you specified In this case, the drain socket handler will be called once the socket becomes writable again:
         * ```ts
         * const socket = await Bun.udpSocket({
         *   socket: {
         *     drain(socket) {
         *       // continue sending data
         *     },
         *   },
         * });
         * ```
         */
        drain(socket) {},
        error(socket, error) {},
    },
});
