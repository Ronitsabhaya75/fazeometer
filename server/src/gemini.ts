import { cfg } from "./config.js";

// Tried in order. A busy or retired model (503, 429, 404) moves on to the next one.
const FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"];

// After every model fails, skip Gemini for a minute so a busy API never slows page loads.
let blockedUntil = 0;

/**
 * Calls Gemini over REST and asks for JSON matching `schema`. Returns null on any failure
 * (no key, every model busy, timeout, bad JSON) so callers always have a fallback path.
 * `timeoutMs` is the total budget across all attempts.
 */
export async function geminiJson<T>(prompt: string, schema: object, timeoutMs = 8000): Promise<T | null> {
  if (!cfg.geminiKey || Date.now() < blockedUntil) return null;
  const deadline = Date.now() + timeoutMs;
  const models = [...new Set([cfg.geminiModel, ...FALLBACK_MODELS])];

  for (const model of models) {
    const left = deadline - Date.now();
    if (left < 500) break;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), left);
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": cfg.geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.4 },
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        console.warn(`[gemini] ${model} returned HTTP ${r.status}`);
        if ([429, 500, 503, 404].includes(r.status)) continue; // try the next model
        return null;
      }
      const data: any = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.text === "string")?.text;
      if (text) {
        blockedUntil = 0;
        return JSON.parse(text) as T;
      }
    } catch (err) {
      console.warn(`[gemini] ${model} failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  blockedUntil = Date.now() + 60_000;
  return null;
}
