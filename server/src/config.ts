const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

const minuteMs = num(process.env.MINUTE_MS, 60000);

export const cfg = {
  port: num(process.env.PORT, 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  pgUrl: process.env.DATABASE_URL ?? "postgres://faze:faze@localhost:55432/faze",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:47017",
  mongoDb: "faze",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:56379",
  jwtSecret: process.env.JWT_SECRET ?? "dev-jwt-secret",
  codeSecret: process.env.CODE_SECRET ?? "dev-code-secret",

  demoMode: process.env.DEMO_MODE === "1",

  // Watch proof settings. See the architecture page, section "Proving someone watched".
  minuteMs,
  hbMs: Math.round(minuteMs / 2),
  minCoverage: num(process.env.MIN_COVERAGE, 0.8),
  finalWindowMin: num(process.env.FINAL_WINDOW_MIN, 5),
  finalWindowShare: 0.6, // at least 3 of the last 5 minutes
  dropWindowMin: num(process.env.DROP_WINDOW_MIN, 10),
  maxRedeemAttempts: 5,
  longStreamMinutes: 60, // a drop on a stream this long awards 2 parts

  priceCents: 500,
  tenureDays: 730,
  creditsPerDrop: 10,

  stripeKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  geminiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite",
  youtubeKey: process.env.YOUTUBE_API_KEY ?? "",

  // Video watch proof: playback is sampled every videoHbMs and credited in buckets of videoBucketSec.
  videoHbMs: num(process.env.VIDEO_HB_MS, 5000),
  videoBucketSec: 5,
  videoMinCoverage: 0.85,
  videoPartsPerDay: num(process.env.VIDEO_PARTS_PER_DAY, 3),
  videoMinSec: 30,
  videoMaxSec: 1800,

  livekitUrl: process.env.LIVEKIT_URL ?? "",
  livekitKey: process.env.LIVEKIT_API_KEY ?? "",
  livekitSecret: process.env.LIVEKIT_API_SECRET ?? "",
};
