import type { EventRow, StreamRow, Video } from "../api";

export const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};
export const fmtViews = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
export const gameLabel = (g: string) => (g === "cod" ? "COD" : g === "fortnite" ? "Fortnite" : "Gaming");

export function fmtWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff < 0) return "Now";
  if (diff < 3600e3) return `in ${Math.max(1, Math.round(diff / 60e3))} min`;
  const sameDay = d.toDateString() === new Date().toDateString();
  const tomorrow = d.toDateString() === new Date(Date.now() + 86400e3).toDateString();
  if (sameDay) return `Today ${time}`;
  if (tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function AdBanner() {
  return (
    <div className="ad" aria-label="Advertisement">
      <span className="tag">Ad</span>
      <span>FaZe Gear: 20% off the Odyssey drop hoodie.</span>
      <span className="muted small">Premium members never see ads.</span>
    </div>
  );
}

/** Stand-in artwork for streams and videos that have no thumbnail of their own. */
export function Poster({ color, label }: { color: string; label: string }) {
  return (
    <div className="poster" style={{ ["--c" as string]: color }}>
      <span>{label.slice(0, 1).toUpperCase()}</span>
    </div>
  );
}

export function VideoCard({ v, reason, onOpen }: { v: Video; reason?: string; onOpen: (id: string) => void }) {
  const pct = Math.round((v.coverage ?? 0) * 100);
  return (
    <button className="vcard" onClick={() => onOpen(v.id)}>
      <div className="thumb">
        {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" loading="lazy" /> : <Poster color="#1f6f8b" label={v.title} />}
        <span className="dur">{fmtDur(v.duration_sec)}</span>
        {v.completed && <span className="done-badge" title="Completed">✓ Done</span>}
        {!v.completed && pct > 2 && <div className="prog"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>}
      </div>
      <div className="vmeta">
        <strong className="vtitle">{v.title}</strong>
        <span className="muted small">{v.channel_title} · {fmtViews(v.views)} views</span>
        {reason && <span className="why">{reason}</span>}
      </div>
    </button>
  );
}

export function StreamCard({ s, onOpen }: { s: StreamRow; onOpen: (id: string) => void }) {
  const live = s.status === "live";
  return (
    <button className="vcard" onClick={() => live && onOpen(s.id)} disabled={!live} title={live ? "Watch live" : "Not live yet"}>
      <div className="thumb">
        {s.thumbnail_url ? <img src={s.thumbnail_url} alt="" loading="lazy" /> : <Poster color={s.color} label={s.streamer} />}
        <span className={live ? "badge-live" : "badge-soon"}>{live ? "● LIVE" : fmtWhen(s.scheduled_for)}</span>
      </div>
      <div className="vmeta">
        <strong className="vtitle">{s.title}</strong>
        <span className="muted small">{s.streamer} · {gameLabel(s.game)}{s.is_partner ? " · Partner" : ""}</span>
      </div>
    </button>
  );
}

export function EventRowItem({ e, onRsvp }: { e: EventRow; onRsvp: (id: string) => void }) {
  const d = new Date(e.starts_at);
  return (
    <div className="erow" style={{ ["--c" as string]: e.accent }}>
      <div className="edate">
        <span>{d.toLocaleDateString([], { month: "short" }).toUpperCase()}</span>
        <strong>{d.getDate()}</strong>
      </div>
      <div className="grow">
        <strong className="etitle">{e.title}</strong>
        <div className="muted small">{fmtWhen(e.starts_at)} · {e.location} · {e.kind.replace("_", " ")}</div>
      </div>
      <button className={e.going ? "btn small ghost on" : "btn small"} onClick={() => onRsvp(e.id)}>{e.going ? "✓ Going" : "Remind me"}</button>
    </div>
  );
}
