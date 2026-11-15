import { useCallback, useEffect, useState } from "react";
import { api, closeSocket, getSocket, type AppConfig, type Me } from "./api";
import { Landing } from "./pages/Landing";
import { Home } from "./pages/Home";
import { Profile } from "./pages/Profile";
import { WatchStream } from "./pages/WatchStream";
import { WatchVideo } from "./pages/WatchVideo";
import { Premium } from "./pages/Premium";
import { Call } from "./pages/Call";
import { Streamer } from "./pages/Streamer";

export type View = "home" | "profile" | "stream" | "video" | "call" | "premium" | "streamer";
export interface Ctx {
  me: Me;
  cfg: AppConfig;
  refresh: () => Promise<void>;
  go: (v: "home" | "profile" | "call" | "premium" | "streamer") => void;
  watchStream: (id: string) => void;
  watchVideo: (id: string) => void;
  toast: (msg: string) => void;
  fresh: Set<string>;
  streamTick: number;
}

export function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [view, setView] = useState<View>("home");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [streamTick, setStreamTick] = useState(0);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg((cur) => (cur === m ? null : cur)), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", "/me"));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    api<AppConfig>("GET", "/config").then(setCfg).catch(() => {});
    void refresh();
    if (new URLSearchParams(location.search).get("paid") === "1") {
      history.replaceState(null, "", "/");
      toast("Payment received. Your second character is unlocked.");
      setView("premium");
    }
  }, [refresh, toast]);

  // Socket events that matter on every page.
  const userId = me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const s = getSocket();
    const onPart = (p: { parts: { id: string; slot: string }[]; owned: number; total: number; source?: { kind: string; title?: string } }) => {
      setFresh(new Set(p.parts.map((x) => x.id)));
      window.setTimeout(() => setFresh(new Set()), 8000);
      toast(`Relic unlocked: ${p.parts.map((x) => x.slot).join(", ")} (${p.owned}/${p.total})${p.source?.title ? ` for finishing "${p.source.title}"` : ""}`);
      void refresh();
    };
    const onComplete = () => toast("Hero complete! Your live call with a partner streamer is unlocked.");
    const onLive = (p: { title: string }) => { toast(`Live now: ${p.title}`); setStreamTick((t) => t + 1); };
    const onEnded = () => setStreamTick((t) => t + 1);
    s.on("part:unlocked", onPart);
    s.on("character:complete", onComplete);
    s.on("stream:live", onLive);
    s.on("stream:ended", onEnded);
    return () => {
      s.off("part:unlocked", onPart);
      s.off("character:complete", onComplete);
      s.off("stream:live", onLive);
      s.off("stream:ended", onEnded);
    };
  }, [userId, refresh, toast]);

  useEffect(() => {
    if (me?.user.role === "streamer") setView((v) => (v === "home" ? "streamer" : v));
  }, [me?.user.role]);

  if (me === undefined || !cfg) return <div className="boot">Loading…</div>;
  if (me === null) return <Landing onDone={refresh} cfg={cfg} />;

  const ctx: Ctx = {
    me, cfg, refresh, toast, fresh, streamTick,
    go: setView,
    watchStream: (id) => { setTargetId(id); setView("stream"); window.scrollTo(0, 0); },
    watchVideo: (id) => { setTargetId(id); setView("video"); window.scrollTo(0, 0); },
  };
  const isStreamer = me.user.role === "streamer";
  const nav: [View, string][] = [
    ["home", "Home"],
    ["profile", "Profile"],
    ["call", "Live call"],
    ["premium", me.premium ? "Premium" : "Go premium"],
    ...(isStreamer ? ([["streamer", "Studio"]] as [View, string][]) : []),
  ];
  const relics = me.characters.reduce((n, c) => n + c.owned, 0);

  return (
    <div className="shell">
      <header className="top">
        <button className="brand" onClick={() => setView("home")}><span className="logo">F</span> Odyssey</button>
        <nav>
          {nav.map(([v, label]) => (
            <button key={v} className={view === v ? "tab on" : "tab"} onClick={() => setView(v)}>{label}</button>
          ))}
        </nav>
        <div className="who">
          <span className="chip" title="Relics on your heroes">◈ {relics}</span>
          <span className="chip" title="Consecutive days with a finished video or stream">🔥 {me.streak}</span>
          <span className="chip" title="Credits">◆ {me.user.credits}</span>
          <button className="name" onClick={() => setView("profile")}>{me.user.display_name}</button>
          <button className="link" onClick={async () => { await api("POST", "/auth/logout"); closeSocket(); setMe(null); }}>Sign out</button>
        </div>
      </header>
      <main className="page">
        {view === "home" && <Home ctx={ctx} />}
        {view === "profile" && <Profile ctx={ctx} />}
        {view === "stream" && targetId && <WatchStream ctx={ctx} streamId={targetId} />}
        {view === "video" && targetId && <WatchVideo ctx={ctx} videoId={targetId} />}
        {view === "call" && <Call ctx={ctx} />}
        {view === "premium" && <Premium ctx={ctx} />}
        {view === "streamer" && isStreamer && <Streamer ctx={ctx} />}
      </main>
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
