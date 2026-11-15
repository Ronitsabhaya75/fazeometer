import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import { ZodError } from "zod";
import { cfg } from "./config.js";
import { connectAll, migrate } from "./db.js";
import { seed, seedExtras } from "./seed.js";
import { q } from "./db.js";
import { syncYoutube } from "./youtube.js";
import { attachUser } from "./auth.js";
import { HttpError } from "./util.js";
import { initRealtime } from "./realtime.js";
import { startWorkers } from "./watch.js";
import { router as authRouter } from "./routes/auth.js";
import { router as streamRouter } from "./routes/stream.js";
import { router as streamerRouter } from "./routes/streamer.js";
import { router as billingRouter, stripeWebhook } from "./routes/billing.js";
import { router as callRouter } from "./routes/call.js";
import { router as recsRouter } from "./routes/recs.js";
import { router as videosRouter } from "./routes/videos.js";
import { router as feedRouter } from "./routes/feed.js";
import { router as profileRouter } from "./routes/profile.js";

async function main() {
  await connectAll();
  await migrate();
  await seed();
  await seedExtras(cfg.demoMode);

  // First run: pull real FaZe videos (titles, thumbnails) from YouTube in the background.
  if (cfg.youtubeKey) {
    const n = (await q(`SELECT count(*)::int AS n FROM videos`)).rows[0].n as number;
    if (n === 0) syncYoutube().catch((e) => console.warn("[youtube] first sync failed:", e.message));
  } else {
    console.warn("[youtube] YOUTUBE_API_KEY is not set, so the video catalog stays empty");
  }

  const app = express();
  // Stripe needs the raw body, so this route comes before express.json().
  app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", attachUser);
  app.use("/api", authRouter, streamRouter, streamerRouter, billingRouter, callRouter, recsRouter, videosRouter, feedRouter, profileRouter);
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", issues: err.issues });
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  });

  const server = http.createServer(app);
  initRealtime(server);
  startWorkers();
  server.listen(cfg.port, () => {
    console.log(`[api] http://localhost:${cfg.port}  minute=${cfg.minuteMs}ms  heartbeat=${cfg.hbMs}ms  demo=${cfg.demoMode}`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
