import crypto from "node:crypto";
import type { Request, Response } from "express";
import { Router } from "express";
import Stripe from "stripe";
import { z } from "zod";
import { q } from "../db.js";
import { cfg } from "../config.js";
import { requireAuth } from "../auth.js";
import { HttpError } from "../util.js";

export const router = Router();
const stripe = cfg.stripeKey ? new Stripe(cfg.stripeKey) : null;

/** One transaction-ish grant, idempotent on the Stripe session id. */
export async function grantPremium(userId: string, sessionId: string, amountCents: number) {
  const ins = await q(
    `INSERT INTO payments (user_id, stripe_session_id, amount_cents, status) VALUES ($1,$2,$3,'paid') ON CONFLICT DO NOTHING RETURNING id`,
    [userId, sessionId, amountCents],
  );
  if (!ins.rowCount) return false; // already processed
  for (const kind of ["premium", "ad_free"]) {
    await q(
      `INSERT INTO entitlements (user_id, kind, source_ref) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id=$1 AND kind=$2)`,
      [userId, kind, sessionId],
    );
  }
  return true;
}

router.post("/billing/checkout", requireAuth, async (req, res) => {
  z.object({ templateId: z.string().uuid().optional() }).parse(req.body ?? {});
  const user = req.user!;
  if (stripe) {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        { quantity: 1, price_data: { currency: "usd", unit_amount: cfg.priceCents, product_data: { name: "FaZe Odyssey: second character" } } },
      ],
      metadata: { userId: user.id },
      success_url: `${cfg.webOrigin}/?paid=1`,
      cancel_url: `${cfg.webOrigin}/?paid=0`,
    });
    return res.json({ url: session.url, mock: false });
  }
  // No Stripe key: a local mock so the whole flow can be demoed.
  const sessionId = `mock_${crypto.randomUUID()}`;
  res.json({ url: `/api/billing/mock-complete?session=${sessionId}`, mock: true });
});

router.get("/billing/mock-complete", requireAuth, async (req, res) => {
  if (stripe) throw new HttpError(404, "Not available when Stripe is configured");
  const sessionId = z.string().startsWith("mock_").parse(req.query.session);
  await grantPremium(req.user!.id, sessionId, cfg.priceCents);
  res.redirect("/?paid=1");
});

// Mounted with express.raw in index.ts so the signature can be verified.
export async function stripeWebhook(req: Request, res: Response) {
  if (!stripe || !cfg.stripeWebhookSecret) return res.status(404).end();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"] as string, cfg.stripeWebhookSecret);
  } catch {
    return res.status(400).send("bad signature");
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.metadata?.userId && s.payment_status === "paid") await grantPremium(s.metadata.userId, s.id, s.amount_total ?? cfg.priceCents);
  }
  res.json({ received: true });
}

// ---- tenure and ticket ----
router.post("/me/ticket/claim", requireAuth, async (req, res) => {
  const u = req.user!;
  const since = (await q(`SELECT min(valid_from) AS since FROM entitlements WHERE user_id=$1 AND kind='premium'`, [u.id])).rows[0]?.since;
  const days = since ? Math.floor((Date.now() - new Date(since).getTime()) / 86400000) : 0;
  if (days < cfg.tenureDays) throw new HttpError(403, `Tickets unlock after ${cfg.tenureDays} days as a paying member (you are at ${days})`, "too_early");
  const code = `TKT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  await q(
    `INSERT INTO entitlements (user_id, kind, source_ref) SELECT $1,'ticket_voucher',$2 WHERE NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id=$1 AND kind='ticket_voucher')`,
    [u.id, code],
  );
  const row = (await q(`SELECT source_ref FROM entitlements WHERE user_id=$1 AND kind='ticket_voucher'`, [u.id])).rows[0];
  res.json({ code: row.source_ref });
});

// Demo helper: make the premium membership look older so the 2-year ticket can be shown.
router.post("/demo/fast-forward-tenure", requireAuth, async (req, res) => {
  if (!cfg.demoMode) throw new HttpError(404, "Demo mode is off");
  const { days } = z.object({ days: z.number().int().min(1).max(1000) }).parse(req.body);
  await q(`UPDATE entitlements SET valid_from = valid_from - ($2 || ' days')::interval WHERE user_id=$1 AND kind='premium'`, [req.user!.id, String(days)]);
  res.json({ ok: true });
});
