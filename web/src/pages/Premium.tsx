import { useEffect, useState } from "react";
import { api, type Template } from "../api";
import type { Ctx } from "../App";

export function Premium({ ctx }: { ctx: Ctx }) {
  const { me, cfg } = ctx;
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => { api<Template[]>("GET", "/catalog/characters").then(setTemplates).catch(() => {}); }, []);

  const buy = async () => {
    try {
      const r = await api<{ url: string }>("POST", "/billing/checkout", {});
      window.location.href = r.url;
    } catch (e: any) { ctx.toast(e.message); }
  };
  const start = async (id: string) => {
    try {
      await api("POST", "/characters/start", { templateId: id });
      await ctx.refresh();
      ctx.go("profile");
    } catch (e: any) { ctx.toast(e.message); }
  };

  const premiumTemplates = templates.filter((t) => t.tier === "premium");
  return (
    <div className="stack">
      <section>
        <h2>{me.premium ? "You are premium" : "Go premium for $" + (cfg.priceCents / 100).toFixed(0)}</h2>
        <div className="panel">
          <ul className="checks">
            <li>A second character with 30 new parts</li>
            <li>Premium-only end-of-stream drops</li>
            <li>No ads in the app</li>
            <li>The clock starts on your free regional tournament ticket ({cfg.tenureDays} days)</li>
          </ul>
          {!me.premium && (
            <>
              <button className="btn" onClick={buy}>Buy for ${(cfg.priceCents / 100).toFixed(2)}</button>
              <p className="muted small">{cfg.stripe ? "You will pay on Stripe's secure page." : "Stripe is not configured, so this uses a local mock checkout."}</p>
            </>
          )}
        </div>
      </section>
      {me.premium && (
        <section>
          <h2>Second characters</h2>
          <div className="grid">
            {premiumTemplates.map((t) => {
              const have = me.characters.some((c) => c.template_id === t.id);
              return (
                <div key={t.id} className="card" style={{ borderTopColor: t.color }}>
                  <span className="tag">{t.game === "cod" ? "Call of Duty" : "Fortnite"}</span>
                  <h3>{t.name}</h3>
                  <p className="muted small">{t.theme}</p>
                  <button className="btn" disabled={have} onClick={() => start(t.id)}>{have ? "Started" : "Start building"}</button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
