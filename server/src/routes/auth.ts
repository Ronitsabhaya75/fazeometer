import { Router } from "express";
import { z } from "zod";
import { q, mdb } from "../db.js";
import { cfg } from "../config.js";
import { signToken, loadUser, requireAuth, hasEntitlement } from "../auth.js";
import { HttpError, ageOf } from "../util.js";

export const router = Router();

// Browsers send empty strings for untouched fields, so treat "" as missing.
const blank = (v: unknown) => (v === "" ? undefined : v);
const loginSchema = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  displayName: z.preprocess(blank, z.string().min(2).max(24).optional()),
  country: z.preprocess(blank, z.string().length(2).transform((s) => s.toUpperCase()).optional()),
  birthdate: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  game: z.preprocess(blank, z.enum(["cod", "fortnite"]).optional()),
});

// Hackathon sign-in: email only, no password. Production swaps this for Google / Twitch OAuth.
router.post("/auth/login", async (req, res) => {
  const b = loginSchema.parse(req.body);
  let { rows } = await q(`SELECT id FROM users WHERE email=$1`, [b.email]);
  let id: string;
  if (rows[0]) {
    id = rows[0].id;
  } else {
    if (!b.displayName || !b.country || !b.birthdate) throw new HttpError(400, "New accounts need a name, country and birthdate");
    if (ageOf(b.birthdate) < 13) throw new HttpError(403, "You must be 13 or older to join", "too_young");
    const r = await q(
      `INSERT INTO users (email, display_name, country, birthdate, game_pref) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [b.email, b.displayName, b.country, b.birthdate, b.game ?? null],
    );
    id = r.rows[0].id;
  }
  res.cookie("token", signToken(id), { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ user: await loadUser(id) });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

export async function computeStreak(userId: string): Promise<number> {
  const { rows } = await q(`SELECT to_char(day,'YYYY-MM-DD') AS d FROM watch_daily WHERE user_id=$1 ORDER BY day DESC LIMIT 400`, [userId]);
  const days = new Set(rows.map((r) => r.d as string));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date();
  if (!days.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1); // today not watched yet, streak still alive
  let n = 0;
  while (days.has(iso(cursor))) {
    n++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}

router.get("/config", (_req, res) => {
  res.json({
    minuteMs: cfg.minuteMs,
    hbMs: cfg.hbMs,
    priceCents: cfg.priceCents,
    tenureDays: cfg.tenureDays,
    demoMode: cfg.demoMode,
    videoHbMs: cfg.videoHbMs,
    videoMinCoverage: cfg.videoMinCoverage,
    videoPartsPerDay: cfg.videoPartsPerDay,
    youtube: Boolean(cfg.youtubeKey),
    stripe: Boolean(cfg.stripeKey),
    gemini: Boolean(cfg.geminiKey),
    livekit: Boolean(cfg.livekitKey),
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const u = req.user!;
  const [premium, adFree, ticket, chars, streak, tenureRow] = await Promise.all([
    hasEntitlement(u.id, "premium"),
    hasEntitlement(u.id, "ad_free"),
    q(`SELECT source_ref FROM entitlements WHERE user_id=$1 AND kind='ticket_voucher' LIMIT 1`, [u.id]),
    q(
      `SELECT uc.id, uc.status, t.id AS template_id, t.name, t.game, t.slot_number, t.tier, t.color, t.total_parts,
              (SELECT count(*)::int FROM user_parts up WHERE up.user_character_id = uc.id) AS owned
       FROM user_characters uc JOIN character_templates t ON t.id = uc.template_id
       WHERE uc.user_id=$1 ORDER BY t.slot_number`,
      [u.id],
    ),
    computeStreak(u.id),
    q(`SELECT min(valid_from) AS since FROM entitlements WHERE user_id=$1 AND kind='premium'`, [u.id]),
  ]);
  const since = tenureRow.rows[0]?.since as Date | null;
  const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : 0;
  res.json({
    user: u,
    premium,
    showAds: !adFree,
    streak,
    characters: chars.rows,
    adult: ageOf(u.birthdate) >= 18,
    tenure: { days, targetDays: cfg.tenureDays, ticketReady: since !== null && days >= cfg.tenureDays, ticketCode: ticket.rows[0]?.source_ref ?? null },
  });
});

// ---- catalog and characters ----
router.get("/catalog/characters", async (req, res) => {
  const game = typeof req.query.game === "string" ? req.query.game : null;
  const t = await q(`SELECT * FROM character_templates WHERE ($1::text IS NULL OR game=$1) ORDER BY game, slot_number`, [game]);
  const ids = t.rows.map((r) => r.id);
  const p = await q(`SELECT id, template_id, position, slot, rarity FROM parts WHERE template_id = ANY($1) ORDER BY position`, [ids]);
  const meta = await mdb.collection("part_meta").find({ partId: { $in: p.rows.map((r) => r.id) } }).toArray();
  const lore = new Map(meta.map((m) => [m.partId as string, m.lore as string]));
  res.json(
    t.rows.map((tpl) => ({
      ...tpl,
      parts: p.rows.filter((x) => x.template_id === tpl.id).map((x) => ({ ...x, lore: lore.get(x.id) ?? "" })),
    })),
  );
});

router.post("/characters/start", requireAuth, async (req, res) => {
  const { templateId } = z.object({ templateId: z.string().uuid() }).parse(req.body);
  const u = req.user!;
  const t = (await q(`SELECT * FROM character_templates WHERE id=$1`, [templateId])).rows[0];
  if (!t) throw new HttpError(404, "Unknown character");
  if (t.tier === "premium" && !(await hasEntitlement(u.id, "premium"))) throw new HttpError(402, "The second character costs $5", "premium_required");

  const c = await q(`INSERT INTO user_characters (user_id, template_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id`, [u.id, templateId]);
  let characterId: string;
  if (c.rows[0]) {
    characterId = c.rows[0].id;
    if (t.tier === "free") {
      // One part is free at sign-up: the Helm.
      await q(
        `INSERT INTO user_parts (user_character_id, part_id, source_kind, source_title) SELECT $1, id, 'welcome', 'Welcome gift' FROM parts WHERE template_id=$2 AND position=1 ON CONFLICT DO NOTHING`,
        [characterId, templateId],
      );
    }
  } else {
    characterId = (await q(`SELECT id FROM user_characters WHERE user_id=$1 AND template_id=$2`, [u.id, templateId])).rows[0].id;
  }
  if (!u.game_pref) await q(`UPDATE users SET game_pref=$1 WHERE id=$2`, [t.game, u.id]);
  res.json({ characterId });
});

router.get("/me/characters/:id", requireAuth, async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const c = (
    await q(
      `SELECT uc.id, uc.status, t.id AS template_id, t.name, t.game, t.tier, t.color, t.total_parts
       FROM user_characters uc JOIN character_templates t ON t.id=uc.template_id WHERE uc.id=$1 AND uc.user_id=$2`,
      [id, req.user!.id],
    )
  ).rows[0];
  if (!c) throw new HttpError(404, "Character not found");
  const parts = await q(
    `SELECT p.id, p.position, p.slot, p.rarity, up.unlocked_at, (up.part_id IS NOT NULL) AS owned
     FROM parts p LEFT JOIN user_parts up ON up.part_id = p.id AND up.user_character_id = $1
     WHERE p.template_id = $2 ORDER BY p.position`,
    [id, c.template_id],
  );
  res.json({ ...c, parts: parts.rows, owned: parts.rows.filter((p) => p.owned).length });
});
