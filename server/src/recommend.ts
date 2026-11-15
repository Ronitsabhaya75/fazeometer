import { q } from "./db.js";
import { geminiJson } from "./gemini.js";
import type { AuthUser } from "./auth.js";

export const TOPICS = ["highlights", "tournaments", "tutorials", "funny", "vlogs", "challenges"] as const;
export const GAMES = ["cod", "fortnite"] as const;
export const INTERESTS = [...GAMES, ...TOPICS] as string[];

const gameLabel = (g: string) => (g === "cod" ? "Call of Duty" : g === "fortnite" ? "Fortnite" : "gaming");

export interface Pick { id: string; reason: string }

const SCHEMA = {
  type: "OBJECT",
  properties: { picks: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, reason: { type: "STRING" } }, required: ["id", "reason"] } } },
  required: ["picks"],
};

interface Cand {
  id: string; title: string; game: string; topics: string[]; channel_title: string; views: number; published_at: Date | null;
  streamer_id: string | null; completed: boolean | null; coverage: number | null;
}

/**
 * Ranks the video catalog for one user from their stated interests and watch history.
 * SQL scoring builds a shortlist. Gemini re-ranks it and writes the reasons. If Gemini is unavailable the SQL order is used.
 */
export async function recommendVideos(user: AuthUser, interests: string[], limit = 12): Promise<{ source: "gemini" | "sql"; picks: Pick[] }> {
  const [hist, cands] = await Promise.all([
    q(
      `SELECT v.game, v.topics, v.channel_title, v.title, vp.completed, vp.coverage
       FROM video_progress vp JOIN videos v ON v.id = vp.video_id WHERE vp.user_id=$1 AND vp.coverage > 0.1 ORDER BY vp.updated_at DESC LIMIT 30`,
      [user.id],
    ),
    q<Cand>(
      `SELECT v.id, v.title, v.game, v.topics, v.channel_title, v.views::float AS views, v.published_at, v.streamer_id, vp.completed, vp.coverage
       FROM videos v LEFT JOIN video_progress vp ON vp.video_id=v.id AND vp.user_id=$1 LIMIT 300`,
      [user.id],
    ),
  ]);

  const gameW = new Map<string, number>();
  const topicW = new Map<string, number>();
  const chanW = new Map<string, number>();
  for (const h of hist.rows) {
    const w = h.completed ? 2 : 1;
    gameW.set(h.game, (gameW.get(h.game) ?? 0) + w);
    chanW.set(h.channel_title, (chanW.get(h.channel_title) ?? 0) + w);
    for (const t of h.topics as string[]) topicW.set(t, (topicW.get(t) ?? 0) + w);
  }
  const likedGames = new Set(interests.filter((i) => (GAMES as readonly string[]).includes(i)));
  if (user.game_pref) likedGames.add(user.game_pref);
  const likedTopics = new Set(interests.filter((i) => (TOPICS as readonly string[]).includes(i)));
  const maxGame = Math.max(1, ...gameW.values());
  const now = Date.now();

  const scored = cands.rows.map((c) => {
    let score = 0;
    let reason = "";
    let best = 0;
    const bump = (pts: number, why: string) => { score += pts; if (pts > best) { best = pts; reason = why; } };
    if (likedGames.has(c.game)) bump(3, `More ${gameLabel(c.game)}, your favorite`);
    const topicLikes = c.topics.filter((t) => likedTopics.has(t));
    if (topicLikes.length) bump(Math.min(4, topicLikes.length * 2 + 1), `You like ${topicLikes[0]}`);
    const gw = gameW.get(c.game) ?? 0;
    if (gw) bump(2.5 * (gw / maxGame), `More ${gameLabel(c.game)}, like what you watched`);
    const tw = c.topics.reduce((a, t) => a + (topicW.get(t) ?? 0), 0);
    if (tw) bump(Math.min(3, tw * 0.8), `Similar to ${c.topics.find((t) => topicW.has(t))} videos you finished`);
    if (chanW.get(c.channel_title)) bump(1.5, `More from ${c.channel_title}`);
    if (c.published_at) score += Math.max(0, 1.5 - (now - new Date(c.published_at).getTime()) / (180 * 86400000) * 1.5);
    score += Math.log10(Math.max(10, c.views)) / 4;
    if (c.completed) score -= 4;
    else if (c.coverage && c.coverage > 0.05) score += 0.5; // unfinished: gentle nudge
    return { c, score, reason: reason || "Popular on FaZe Odyssey" };
  });
  scored.sort((a, b) => b.score - a.score);

  const shortlist = scored.filter((s) => !s.c.completed).slice(0, 24);
  let picks: Pick[] = shortlist.slice(0, limit).map((s) => ({ id: s.c.id, reason: s.reason }));
  let source: "gemini" | "sql" = "sql";

  if (shortlist.length >= 6) {
    const prompt = JSON.stringify({
      task: `Choose the best ${limit} videos for this fan, ordered best first. Mix topics so the feed is not repetitive. For each, write a reason under 12 words that cites a real fact (their interests, a video they watched, the game or the channel). Only use ids from the candidates.`,
      fan: {
        interests,
        favorite_game: user.game_pref,
        recently_watched: hist.rows.slice(0, 8).map((h) => ({ title: h.title, game: h.game, topics: h.topics, finished: h.completed })),
      },
      candidates: shortlist.map((s) => ({ id: s.c.id, title: s.c.title, game: s.c.game, topics: s.c.topics, channel: s.c.channel_title, views: s.c.views })),
    });
    const g = await geminiJson<{ picks: Pick[] }>(prompt, SCHEMA, 7000);
    if (g?.picks?.length) {
      const ok = new Set(shortlist.map((s) => s.c.id));
      const seen = new Set<string>();
      const gp = g.picks.filter((p) => ok.has(p.id) && !seen.has(p.id) && seen.add(p.id) && typeof p.reason === "string");
      if (gp.length >= Math.min(4, limit)) {
        // top up with SQL order if Gemini returned fewer than asked
        for (const s of shortlist) if (gp.length < limit && !seen.has(s.c.id)) { gp.push({ id: s.c.id, reason: s.reason }); seen.add(s.c.id); }
        picks = gp.slice(0, limit);
        source = "gemini";
      }
    }
  }
  return { source, picks };
}
