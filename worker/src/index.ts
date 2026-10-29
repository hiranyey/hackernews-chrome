import { KV_ESCAPED, KV_META, KV_RAW } from "./constants.ts";
import { kickoffIfEmpty, startRefresh } from "./refresh.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
};

function notReady(): Response {
  return new Response(JSON.stringify({ error: "Stories not loaded yet" }), {
    status: 503,
    headers: {
      ...JSON_HEADERS,
      "Retry-After": "10",
    },
  });
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

async function readKey(env: Env, key: string): Promise<string | null | undefined> {
  try {
    return await env.HN_KV.get(key);
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "KV read failed",
        key,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return undefined;
  }
}

async function cachedJson(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string,
  cacheControl: string,
): Promise<Response> {
  const stored = await readKey(env, key);
  if (stored === undefined) return notReady();
  if (stored === null) {
    kickoffIfEmpty(env, ctx);
    return notReady();
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": cacheControl,
      },
    });
  }
  return new Response(stored, {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": cacheControl,
    },
  });
}

async function handleFetch(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...JSON_HEADERS,
        Allow: "GET, HEAD, OPTIONS",
      },
    });
  }

  if (pathname === "/health") {
    return cachedJson(request, env, ctx, KV_META, "no-store");
  }
  if (pathname === "/") {
    return cachedJson(request, env, ctx, KV_ESCAPED, "public, max-age=60");
  }
  if (pathname === "/v2") {
    return cachedJson(request, env, ctx, KV_RAW, "public, max-age=60");
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: JSON_HEADERS,
  });
}

async function handleScheduled(
  _controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const run = startRefresh(env);
  ctx.waitUntil(run);
  await run;
}

export default {
  fetch: handleFetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;
