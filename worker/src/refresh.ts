import {
  FETCH_TIMEOUT_MS,
  HN_URL,
  KV_ESCAPED,
  KV_META,
  KV_RAW,
  type Meta,
} from "./constants.ts";
import { escapeNews, parseStories } from "./parse.ts";

let inflight: Promise<void> | null = null;
let lastColdStartMs = 0;

// Matches the 503 Retry-After. Keeps a stampede of empty-KV requests from
// each launching their own scrape after the in-flight one finishes empty.
const COLD_START_COOLDOWN_MS = 10_000;

export async function refreshHN(env: Env): Promise<void> {
  try {
    const response = await fetch(HN_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HN responded with ${response.status}`);
    }
    const data = await parseStories(await response.text());
    // Story count on every successful parse, including zero. A zero-story
    // page is usually an error or rate-limit document; keep the last good copy.
    console.log(
      JSON.stringify({
        message:
          data.length === 0
            ? "HN returned no stories, keeping cached data"
            : "Refreshed HN data",
        stories: data.length,
      }),
    );
    if (data.length === 0) return;

    const meta: Meta = {
      timestamp: new Date().toISOString(),
      stories: data.length,
    };
    // Meta is written last so /health only flips to ready after both bodies exist.
    await env.HN_KV.put(KV_RAW, JSON.stringify(data));
    await env.HN_KV.put(KV_ESCAPED, JSON.stringify(data.map(escapeNews)));
    await env.HN_KV.put(KV_META, JSON.stringify(meta));
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "Failed to refresh HN data",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

// One scrape per isolate at a time. Cron and the empty-KV cold start share it.
export function startRefresh(env: Env): Promise<void> {
  if (!inflight) {
    inflight = refreshHN(env).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

// Request path only. Does not await the scrape; the caller returns 503 first.
export function kickoffIfEmpty(env: Env, ctx: ExecutionContext): void {
  if (inflight) {
    ctx.waitUntil(inflight);
    return;
  }
  const now = Date.now();
  if (now - lastColdStartMs < COLD_START_COOLDOWN_MS) return;
  lastColdStartMs = now;
  ctx.waitUntil(startRefresh(env));
}

export function resetRefreshStateForTests(): void {
  inflight = null;
  lastColdStartMs = 0;
}
