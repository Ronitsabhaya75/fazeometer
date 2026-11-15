import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { parse } from "cookie";
import { cfg } from "./config.js";
import { verifyToken } from "./auth.js";
import { handleHeartbeat } from "./watch.js";
import { handleVideoBeat } from "./videoWatch.js";

let io: Server | undefined;

export function initRealtime(http: HttpServer) {
  io = new Server(http, { cors: { origin: cfg.webOrigin, credentials: true } });

  io.use((socket, next) => {
    const cookies = parse(socket.handshake.headers.cookie ?? "");
    const uid = cookies.token ? verifyToken(cookies.token) : null;
    if (!uid) return next(new Error("unauthenticated"));
    socket.data.userId = uid;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    // Heartbeats ride the open socket. The REST redeem call, not a socket event, is what grants parts.
    socket.on("hb", (payload, ack) => {
      handleHeartbeat(userId, payload)
        .then((r) => typeof ack === "function" && ack(r))
        .catch(() => typeof ack === "function" && ack({ ok: false, reason: "error" }));
    });
    socket.on("vhb", (payload, ack) => {
      handleVideoBeat(userId, payload)
        .then((r) => typeof ack === "function" && ack(r))
        .catch((e) => { console.error("[vhb]", e); typeof ack === "function" && ack({ ok: false, reason: "error" }); });
    });
  });
  return io;
}

export const emitUser = (userId: string, event: string, payload: unknown) => io?.to(`user:${userId}`).emit(event, payload);
export const emitAll = (event: string, payload: unknown) => io?.emit(event, payload);
