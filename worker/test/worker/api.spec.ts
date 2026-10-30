import { env } from "cloudflare:workers";
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KV_ESCAPED, KV_META, KV_RAW, type News } from "../../src/constants.ts";
import worker from "../../src/index.ts";
import { escapeNews } from "../../src/parse.ts";
import { resetRefreshStateForTests } from "../../src/refresh.ts";

const originalFetch = globalThis.fetch;

const HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM_PREFIX = "https://hacker-news.firebaseio.com/v0/item/";

const sampleItem = {
  id: 1,
  type: "story",
  by: "alice",
  title: `AT&T says "hi" <ok>`,
  url: "https://example.com/a?b=1&c=2",
  score: 12,
  descendants: 3,
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function firebaseFetch(onCall?: () => Promise<void> | void): typeof fetch {
  return async (input) => {
    await onCall?.();
    const url = requestUrl(input);
    if (url === HN_TOP_URL) {
      return new Response(JSON.stringify([sampleItem.id]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === `${HN_ITEM_PREFIX}${sampleItem.id}.json`) {
      return new Response(JSON.stringify(sampleItem), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected outbound fetch ${url}`);
  };
}

async function emptyKv(): Promise<void> {
  const listed = await env.HN_KV.list();
  await Promise.all(listed.keys.map((key) => env.HN_KV.delete(key.name)));
}

beforeEach(async () => {
  await emptyKv();
  resetRefreshStateForTests();
  globalThis.fetch = async () => {
    throw new Error("unexpected outbound fetch");
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetRefreshStateForTests();
});

function cronController(): ScheduledController {
  return {
    cron: "*/2 * * * *",
    scheduledTime: Date.now(),
    noRetry() {},
  };
}

async function runScheduled(): Promise<string[]> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (message?: unknown, ...rest: unknown[]) => {
    logs.push([message, ...rest].map((part) => String(part)).join(" "));
    original(message, ...rest);
  };
  try {
    const ctx = createExecutionContext();
    await worker.scheduled(cronController(), env, ctx);
    await waitOnExecutionContext(ctx);
    return logs;
  } finally {
    console.log = original;
  }
}

describe("fetch handler", () => {
  it("returns 503 and scrapes in the background when KV is empty", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = firebaseFetch(async () => {
      calls += 1;
      await gate;
    });

    const ctx1 = createExecutionContext();
    const ctx2 = createExecutionContext();
    const first = worker.fetch(
      new Request("https://hn.hiranyey.dev/v2"),
      env,
      ctx1,
    );
    const second = worker.fetch(
      new Request("https://hn.hiranyey.dev/"),
      env,
      ctx2,
    );
    const [rawResponse, legacyResponse] = await Promise.all([first, second]);

    expect(rawResponse.status).toBe(503);
    expect(legacyResponse.status).toBe(503);
    expect(rawResponse.headers.get("Retry-After")).toBe("10");
    expect(rawResponse.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(rawResponse.headers.get("Cache-Control")).toBeNull();
    expect(await rawResponse.json()).toEqual({ error: "Stories not loaded yet" });
    expect(calls).toBe(1);

    release();
    await waitOnExecutionContext(ctx1);
    await waitOnExecutionContext(ctx2);

    const ctx3 = createExecutionContext();
    const ready = await worker.fetch(
      new Request("https://hn.hiranyey.dev/v2"),
      env,
      ctx3,
    );
    expect(ready.status).toBe(200);
    // One topstories request plus one item request, still a single refresh.
    expect(calls).toBe(2);
  });

  it("serves raw and escaped JSON from KV without fetching HN", async () => {
    let calls = 0;
    globalThis.fetch = firebaseFetch(() => {
      calls += 1;
    });
    const logs = await runScheduled();
    expect(logs.some((line) => line.includes('"stories":'))).toBe(true);
    calls = 0;

    const ctx = createExecutionContext();
    const raw = await worker.fetch(
      new Request("https://hn.hiranyey.dev/v2"),
      env,
      ctx,
    );
    const legacy = await worker.fetch(
      new Request("https://hn.hiranyey.dev/"),
      env,
      ctx,
    );
    const health = await worker.fetch(
      new Request("https://hn.hiranyey.dev/health"),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(calls).toBe(0);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(raw.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(raw.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(legacy.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(legacy.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const rawStories = (await raw.json()) as News[];
    const escapedStories = (await legacy.json()) as News[];
    expect(rawStories.length).toBeGreaterThan(0);
    expect(escapedStories).toEqual(rawStories.map(escapeNews));
    expect(rawStories[0]?.title).toBe(`AT&T says "hi" <ok>`);
    expect(escapedStories[0]?.title).toBe("AT&amp;T says &quot;hi&quot; &lt;ok&gt;");
    expect(await env.HN_KV.get(KV_RAW)).toBe(JSON.stringify(rawStories));
    expect(await env.HN_KV.get(KV_ESCAPED)).toBe(JSON.stringify(escapedStories));

    expect(health.status).toBe(200);
    expect(health.headers.get("Cache-Control")).toBe("no-store");
    const meta = (await health.json()) as { timestamp: string; stories: number };
    expect(meta.stories).toBe(rawStories.length);
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
    expect(await env.HN_KV.get(KV_META)).toBe(JSON.stringify(meta));
  });

  it("keeps the last good copy when HN returns no stories", async () => {
    await env.HN_KV.put(KV_RAW, JSON.stringify([{ id: "old" }]));
    await env.HN_KV.put(KV_ESCAPED, JSON.stringify([{ id: "old" }]));
    await env.HN_KV.put(
      KV_META,
      JSON.stringify({ timestamp: "2020-01-01T00:00:00.000Z", stories: 1 }),
    );
    globalThis.fetch = async () =>
      new Response("[]", {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const logs = await runScheduled();
    expect(logs.some((line) => line.includes('"stories":0'))).toBe(true);
    expect(await env.HN_KV.get(KV_RAW)).toBe(JSON.stringify([{ id: "old" }]));
    expect(await env.HN_KV.get(KV_META)).toContain("2020-01-01");
  });

  it("keeps the last good copy when HN responds with an error", async () => {
    await env.HN_KV.put(KV_RAW, "[]");
    const errors: string[] = [];
    const original = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
      original(message);
    };
    try {
      globalThis.fetch = async () => new Response("nope", { status: 503 });
      await runScheduled();
    } finally {
      console.error = original;
    }
    expect(await env.HN_KV.get(KV_RAW)).toBe("[]");
    expect(errors.some((line) => line.includes("HN topstories responded with 503"))).toBe(
      true,
    );
  });

  it("rejects unknown routes and methods", async () => {
    const ctx = createExecutionContext();
    const missing = await worker.fetch(
      new Request("https://hn.hiranyey.dev/nope"),
      env,
      ctx,
    );
    const posted = await worker.fetch(
      new Request("https://hn.hiranyey.dev/v2", { method: "POST" }),
      env,
      ctx,
    );
    const preflight = await worker.fetch(
      new Request("https://hn.hiranyey.dev/v2", { method: "OPTIONS" }),
      env,
      ctx,
    );
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(posted.status).toBe(405);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
