import { Router } from "express";
import { z } from "zod";
import { q, redis } from "../db.js";
import { cfg } from "../config.js";
import { requireStreamer } from "../auth.js";
import { HttpError, makeCode, hashCode } from "../util.js";
import { keys, flushHeartbeats, viewersOf, eligibility, getStreamStart } from "../watch.js";
import { emitAll, emitUser } from "../realtime.js";
import { hasEntitlement } from "../auth.js";

export const router = Router();
router.use("/streamer", requireStreamer);

async function ownStream(streamId: string, streamerId: string) {
  const s = (await q(`SELECT * FROM streams WHERE id=$1 AND streamer_id=$2`, [streamId, streamerId])).rows[0];
  if (!s) throw new HttpError(404, "Stream not found");
  return s;
}

router.get("/streamer/me", async (req, res) => {
  const sid = req.user!.streamer_id!;
  const [st, streams, slots] = await Promise.all([
    q(`SELECT * FROM streamers WHERE id=$1`, [sid]),
    q(`SELECT * FROM streams WHERE streamer_id=$1 ORDER BY coalesce(started_at, scheduled_for) DESC LIMIT 10`, [sid]),
    q(`SELECT cs.*, u.display_name AS booked_by_name FROM call_slots cs LEFT JOIN users u ON u.id=cs.booked_by
       WHERE cs.streamer_id=$1 ORDER BY starts_at LIMIT 20`, [sid]),
  ]);
  res.json({ streamer: st.rows[0], streams: streams.rows, slots: slots.rows });
});

router.post("/streamer/streams", async (req, res) => {
  const b = z
    .object({
      title: z.string().min(3).max(80),
      game: z.enum(["cod", "fortnite"]),
      platform: z.enum(["demo", "twitch", "youtube"]).default("demo"),
      embedId: z.string().max(60).optional(),
    })
    .parse(req.body);
  const r = await q(
    `INSERT INTO streams (streamer_id, title, game, platform, embed_id, scheduled_for) VALUES ($1,$2,$3,$4,$5, now()) RETURNING *`,
    [req.user!.streamer_id, b.title, b.game, b.platform, b.embedId ?? null],
  );
  res.json(r.rows[0]);
});

router.post("/streamer/streams/:id/start", async (req, res) => {
  const s = await ownStream(z.string().uuid().parse(req.params.id), req.user!.streamer_id!);
  if (s.status !== "scheduled") throw new HttpError(409, "Stream already started");
  const r = await q(`UPDATE streams SET status='live', started_at=now() WHERE id=$1 RETURNING *`, [s.id]);
  await redis.set(keys.live(s.id), String(new Date(r.rows[0].started_at).getTime()));
  emitAll("stream:live", { streamId: s.id, title: s.title });
  res.json(r.rows[0]);
});

// The end-of-stream moment: create the secret code, tell eligible viewers a drop is open.
router.post("/streamer/streams/:id/drop", async (req, res) => {
  const s = await ownStream(z.string().uuid().parse(req.params.id), req.user!.streamer_id!);
  const { tier } = z.object({ tier: z.enum(["free", "premium"]).default("free") }).parse(req.body ?? {});
  if (s.status !== "live") throw new HttpError(409, "Drops can only be created while the stream is live");
  const startMs = await getStreamStart(s.id);
  const elapsed = Math.floor((Date.now() - (startMs ?? Date.now())) / cfg.minuteMs);
  if (elapsed < 1) throw new HttpError(409, "Wait for at least one full stream minute before dropping the code");

  const code = makeCode();
  const parts = elapsed >= cfg.longStreamMinutes ? 2 : 1;
  const closesAt = new Date(Date.now() + cfg.dropWindowMin * cfg.minuteMs);
  const d = (
    await q(
      `INSERT INTO drops (stream_id, code_hash, opens_at, closes_at, tier, parts_awarded, elapsed_minutes)
       VALUES ($1,$2,now(),$3,$4,$5,$6) RETURNING id`,
      [s.id, hashCode(code), closesAt, tier, parts, elapsed],
    )
  ).rows[0];

  // Push drop:open only to viewers who qualify. The code is not in the payload.
  let eligibleCount = 0;
  for (const userId of await viewersOf(s.id)) {
    const e = await eligibility(s.id, userId, elapsed);
    if (!e.eligible) continue;
    if (tier === "premium" && !(await hasEntitlement(userId, "premium"))) continue;
    eligibleCount++;
    emitUser(userId, "drop:open", { dropId: d.id, streamId: s.id, closesAt, tier, partsAwarded: parts });
  }
  res.json({ dropId: d.id, code, closesAt, partsAwarded: parts, eligibleCount });
});

router.post("/streamer/streams/:id/end", async (req, res) => {
  const s = await ownStream(z.string().uuid().parse(req.params.id), req.user!.streamer_id!);
  if (s.status !== "live") throw new HttpError(409, "Stream is not live");
  await flushHeartbeats();
  const ended = (await q(`UPDATE streams SET status='ended', ended_at=now() WHERE id=$1 RETURNING started_at, ended_at`, [s.id])).rows[0];
  const total = Math.max(1, Math.ceil((new Date(ended.ended_at).getTime() - new Date(ended.started_at).getTime()) / cfg.minuteMs));
  const n = Math.min(cfg.finalWindowMin, total);

  // Wrap-up: the permanent coverage record comes from the Tiger Data hypertable.
  const agg = await q(
    `SELECT user_id, count(DISTINCT minute_index)::int AS minutes,
            count(DISTINCT minute_index) FILTER (WHERE minute_index >= $2)::int AS final_minutes
     FROM heartbeats WHERE stream_id=$1 AND player_state='playing' GROUP BY user_id`,
    [s.id, total - n],
  );
  for (const r of agg.rows) {
    const minutes = Math.min(r.minutes, total);
    await q(
      `INSERT INTO watch_sessions (user_id, stream_id, minutes_watched, coverage, in_final_window) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, stream_id) DO UPDATE SET minutes_watched=EXCLUDED.minutes_watched, coverage=EXCLUDED.coverage, in_final_window=EXCLUDED.in_final_window`,
      [r.user_id, s.id, minutes, minutes / total, r.final_minutes >= Math.ceil(n * cfg.finalWindowShare)],
    );
    await q(`UPDATE users SET credits = credits + $1 WHERE id=$2`, [Math.min(minutes, 120), r.user_id]);
  }
  await redis.del(keys.live(s.id));
  emitAll("stream:ended", { streamId: s.id });
  res.json({ ended: true, viewers: agg.rows.length, totalMinutes: total });
});

router.post("/streamer/slots", async (req, res) => {
  const b = z.object({ startsAt: z.string().datetime(), durationMin: z.number().int().min(5).max(60).default(15) }).parse(req.body);
  const st = (await q(`SELECT is_partner FROM streamers WHERE id=$1`, [req.user!.streamer_id])).rows[0];
  if (!st?.is_partner) throw new HttpError(403, "Only partner streamers (30,000+ followers) can offer calls", "not_partner");
  const r = await q(`INSERT INTO call_slots (streamer_id, starts_at, duration_min) VALUES ($1,$2,$3) RETURNING *`, [req.user!.streamer_id, b.startsAt, b.durationMin]);
  res.json(r.rows[0]);
});

// ---- posting videos and events ----
import { extractVideoId, fetchVideos, insertVideo } from "../youtube.js";

router.post("/streamer/videos", async (req, res) => {
  const b = z.object({ url: z.string().min(11).max(300), game: z.enum(["cod", "fortnite", "other"]).optional() }).parse(req.body);
  const id = extractVideoId(b.url);
  if (!id) throw new HttpError(400, "That does not look like a YouTube link");
  if (!cfg.youtubeKey) throw new HttpError(400, "YOUTUBE_API_KEY is not set on the server");
  const [v] = await fetchVideos([id]);
  if (!v) throw new HttpError(404, "YouTube has no public video with that id");
  if (!v.embeddable) throw new HttpError(400, "The owner has turned off embedding for this video");
  if (v.durationSec < cfg.videoMinSec || v.durationSec > cfg.videoMaxSec) {
    throw new HttpError(400, `Videos must be between ${cfg.videoMinSec} seconds and ${Math.round(cfg.videoMaxSec / 60)} minutes so viewers can finish them`);
  }
  const row = await insertVideo(v, req.user!.streamer_id, b.game);
  res.json(row);
});

router.get("/streamer/videos", async (req, res) => {
  const { rows } = await q(
    `SELECT v.*, (SELECT count(*)::int FROM video_progress p WHERE p.video_id=v.id AND p.completed) AS completions,
            (SELECT count(*)::int FROM video_progress p WHERE p.video_id=v.id) AS viewers
     FROM videos v WHERE v.streamer_id=$1 ORDER BY v.created_at DESC LIMIT 30`,
    [req.user!.streamer_id],
  );
  res.json(rows);
});

router.post("/streamer/events", async (req, res) => {
  const b = z
    .object({
      title: z.string().min(3).max(80),
      kind: z.enum(["tournament", "watch_party", "meetup", "drop"]),
      game: z.enum(["cod", "fortnite", "other"]).default("other"),
      startsAt: z.string().datetime(),
      location: z.string().max(80).default("Online"),
      description: z.string().max(400).default(""),
    })
    .parse(req.body);
  const r = await q(
    `INSERT INTO events (title, kind, game, starts_at, location, description, streamer_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.title, b.kind, b.game, b.startsAt, b.location, b.description, req.user!.streamer_id],
  );
  res.json(r.rows[0]);
});
