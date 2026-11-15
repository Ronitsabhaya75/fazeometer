import { useCallback, useEffect, useState } from "react";
import { api, type EventRow, type Feed, type Video } from "../api";
import type { Ctx } from "../App";
import { AdBanner, EventRowItem, StreamCard, VideoCard, fmtWhen, gameLabel } from "../components/cards";

const CHIPS: { key: string; label: string; param: string }[] = [
  { key: "all", label: "All", param: "" },
  { key: "cod", label: "COD", param: "game=cod" },
  { key: "fortnite", label: "Fortnite", param: "game=fortnite" },
  { key: "highlights", label: "Highlights", param: "topic=highlights" },
  { key: "tournaments", label: "Tournaments", param: "topic=tournaments" },
  { key: "tutorials", label: "Tutorials", param: "topic=tutorials" },
  { key: "funny", label: "Funny", param: "topic=funny" },
  { key: "challenges", label: "Challenges", param: "topic=challenges" },
];
const INTEREST_CHIPS = ["cod", "fortnite", "highlights", "tournaments", "tutorials", "funny", "vlogs", "challenges"];
const interestLabel = (k: string) => (k === "cod" ? "COD" : k === "fortnite" ? "Fortnite" : k[0].toUpperCase() + k.slice(1));

function Row({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="row-sec">
      <div className="between"><h2>{title}</h2>{hint}</div>
      {children}
    </section>
  );
}

export function Home({ ctx }: { ctx: Ctx }) {
  const { me } = ctx;
  const [feed, setFeed] = useState<Feed | null>(null);
  const [chip, setChip] = useState("all");
  const [browse, setBrowse] = useState<Video[]>([]);

  const load = useCallback(() => api<Feed>("GET", "/feed").then(setFeed).catch(() => {}), []);
  useEffect(() => { void load(); }, [load, ctx.streamTick, me.characters.reduce((n, c) => n + c.owned, 0)]);

  useEffect(() => {
    const param = CHIPS.find((c) => c.key === chip)?.param ?? "";
    api<Video[]>("GET", `/videos?limit=24&${param}`).then(setBrowse).catch(() => {});
  }, [chip]);

  const rsvp = async (id: string) => {
    const r = await api<{ going: boolean }>("POST", `/events/${id}/rsvp`);
    setFeed((f) => f && { ...f, events: f.events.map((e: EventRow) => (e.id === id ? { ...e, going: r.going, rsvps: e.rsvps + (r.going ? 1 : -1) } : e)) });
    ctx.toast(r.going ? "We will remind you before it starts." : "Reminder removed.");
  };
  const setInterests = async (list: string[]) => {
    const r = await api<{ interests: string[] }>("PUT", "/me/interests", { interests: list });
    setFeed((f) => f && { ...f, interests: r.interests });
    await load();
  };

  const active = me.characters.find((c) => c.status === "building") ?? me.characters[0];
  const pct = active ? (active.owned / active.total_parts) * 100 : 0;

  return (
    <div className="feed">
      {me.showAds && <AdBanner />}

      {/* Continue the voyage: the one place progress shows on the home page */}
      <div className="strip">
        <div className="strip-main">
          <span className="eyebrow">Continue the voyage</span>
          {active ? (
            <>
              <strong>{active.name}</strong>
              <div className="bar slim"><div style={{ width: `${pct}%` }} /></div>
              <span className="muted small">{active.owned} of {active.total_parts} relics · finish any video or live stream to earn the next</span>
            </>
          ) : (
            <span>Start your hero to begin collecting relics.</span>
          )}
        </div>
        <button className="btn small" onClick={() => ctx.go("profile")}>{active ? "Open profile" : "Start your hero"}</button>
      </div>

      {feed && feed.interests.length === 0 && (
        <div className="nudge">
          <span>Tune your feed: pick what you like.</span>
          <div className="chips">
            {INTEREST_CHIPS.map((i) => <button key={i} className="chip-btn" onClick={() => setInterests([...feed.interests, i])}>{interestLabel(i)}</button>)}
          </div>
        </div>
      )}

      {feed && feed.live.length > 0 && (
        <Row title="Live now" hint={<span className="tag live">{feed.live.length} live</span>}>
          <div className="hrow">{feed.live.map((s) => <StreamCard key={s.id} s={s} onOpen={ctx.watchStream} />)}</div>
        </Row>
      )}

      {feed && (
        <div className="duo">
          <Row title="Coming up">
            <div className="lrows">
              {feed.upcoming.slice(0, 6).map((s) => (
                <div key={s.id} className="lrow">
                  <span className="when">{fmtWhen(s.scheduled_for)}</span>
                  <div className="grow"><strong className="etitle">{s.title}</strong><div className="muted small">{s.streamer} · {gameLabel(s.game)}</div></div>
                </div>
              ))}
              {feed.upcoming.length === 0 && <p className="muted small">No streams scheduled yet.</p>}
            </div>
          </Row>
          <Row title="Events">
            <div className="lrows">
              {feed.events.slice(0, 5).map((e) => <EventRowItem key={e.id} e={e} onRsvp={rsvp} />)}
              {feed.events.length === 0 && <p className="muted small">No events yet.</p>}
            </div>
          </Row>
        </div>
      )}

      {feed && feed.continueWatching.length > 0 && (
        <Row title="Continue watching">
          <div className="hrow">{feed.continueWatching.map((v) => <VideoCard key={v.id} v={v} onOpen={ctx.watchVideo} />)}</div>
        </Row>
      )}

      {feed && feed.forYou.length > 0 && (
        <Row
          title="For you"
          hint={<span className="tag" title={feed.source === "gemini" ? "Ranked by Gemini from your interests and what you watched" : "Ranked by rules from your interests and what you watched"}>{feed.source === "gemini" ? "Picked by Gemini" : "Picked by rules"}</span>}
        >
          <div className="vgrid">{feed.forYou.map((r) => <VideoCard key={r.video.id} v={r.video} reason={r.reason} onOpen={ctx.watchVideo} />)}</div>
        </Row>
      )}

      <Row title="Browse videos">
        <div className="chips">
          {CHIPS.map((c) => <button key={c.key} className={chip === c.key ? "chip-btn on" : "chip-btn"} onClick={() => setChip(c.key)}>{c.label}</button>)}
        </div>
        <div className="vgrid">{browse.map((v) => <VideoCard key={v.id} v={v} onOpen={ctx.watchVideo} />)}</div>
        {browse.length === 0 && <p className="muted small">{ctx.cfg.youtube ? "No videos match that filter." : "No videos yet. Add a YOUTUBE_API_KEY to load the catalog."}</p>}
      </Row>

      {me.premium && <Tenure ctx={ctx} />}
    </div>
  );
}

function Tenure({ ctx }: { ctx: Ctx }) {
  const { tenure } = ctx.me;
  const claim = async () => {
    try {
      const r = await api<{ code: string }>("POST", "/me/ticket/claim");
      ctx.toast(`Ticket voucher: ${r.code}`);
      await ctx.refresh();
    } catch (e: any) { ctx.toast(e.message); }
  };
  const ff = async () => { await api("POST", "/demo/fast-forward-tenure", { days: 365 }); await ctx.refresh(); };
  return (
    <section className="row-sec">
      <h2>Free regional ticket</h2>
      <div className="strip">
        <div className="strip-main">
          <div className="bar slim"><div style={{ width: `${Math.min(100, (tenure.days / tenure.targetDays) * 100)}%` }} /></div>
          <span className="muted small">{tenure.days} of {tenure.targetDays} days as a paying member.</span>
        </div>
        {tenure.ticketCode ? <span>Voucher: <code>{tenure.ticketCode}</code></span> : <button className="btn small" disabled={!tenure.ticketReady} onClick={claim}>Claim ticket</button>}
        {ctx.cfg.demoMode && <button className="btn small ghost" onClick={ff}>Demo: +1 year</button>}
      </div>
    </section>
  );
}
