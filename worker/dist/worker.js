// HN Worker — Firebase API refresh (HTML scrape blocked with 419 from CF egress)
var FETCH_TIMEOUT_MS = 1e4;
var KV_RAW = "raw";
var KV_ESCAPED = "escaped";
var KV_META = "meta";
var HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
var HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/";
var HN_ITEM_PAGE = "https://news.ycombinator.com/item?id=";
var STORY_LIMIT = 30;

var ESCAPE_HTML_PATTERN = /[&<>"']/g;
var ESCAPE_HTML_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHTML(value) {
  return value.replace(ESCAPE_HTML_PATTERN, (char) => ESCAPE_HTML_MAP[char] ?? char);
}
function escapeNews(news) {
  return {
    id: escapeHTML(news.id),
    title: escapeHTML(news.title),
    url: escapeHTML(news.url),
    points: escapeHTML(news.points),
    user: escapeHTML(news.user),
    comment: escapeHTML(news.comment)
  };
}

/** Match HN subline comment link text: "discuss" | "1\u00a0comment" | "N\u00a0comments" */
function formatComment(descendants) {
  var n = typeof descendants === "number" ? descendants : 0;
  if (n <= 0) return "discuss";
  if (n === 1) return "1\u00a0comment";
  return String(n) + "\u00a0comments";
}

function storyUrl(item) {
  var url = item.url;
  if (typeof url === "string" && /^https?:/i.test(url)) return url;
  return HN_ITEM_PAGE + item.id;
}

/** Map a Firebase item to the News shape (all fields strings). */
function mapItem(item) {
  if (!item || item.deleted || item.dead) return null;
  // Skip non-story types that can appear in topstories (e.g. job without score)
  if (item.type && item.type !== "story" && item.type !== "job") return null;
  var id = String(item.id);
  var points = item.score == null ? "" : String(item.score);
  var user = item.by == null ? "" : String(item.by);
  var comment = item.type === "job" ? "" : formatComment(item.descendants);
  // Jobs on the front page have no subline in the HTML scrape.
  if (item.type === "job") {
    points = "";
    user = "";
    comment = "";
  }
  return {
    id,
    title: item.title == null ? "" : String(item.title),
    url: storyUrl(item),
    points,
    user,
    comment
  };
}

async function fetchStories() {
  var topRes = await fetch(HN_TOP_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!topRes.ok) {
    var topBody = (await topRes.text()).slice(0, 200);
    console.error(JSON.stringify({
      message: "HN topstories non-2xx",
      status: topRes.status,
      body: topBody
    }));
    throw new Error("HN topstories responded with " + topRes.status);
  }
  var ids = await topRes.json();
  if (!Array.isArray(ids)) throw new Error("HN topstories returned non-array");
  var first = ids.slice(0, STORY_LIMIT);
  var items = await Promise.all(first.map(async (id) => {
    var r = await fetch(HN_ITEM_URL + id + ".json", {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!r.ok) {
      var body = (await r.text()).slice(0, 200);
      console.error(JSON.stringify({
        message: "HN item non-2xx",
        id,
        status: r.status,
        body
      }));
      return null;
    }
    return r.json();
  }));
  var stories = [];
  for (var i = 0; i < items.length; i++) {
    var mapped = mapItem(items[i]);
    if (mapped) stories.push(mapped);
  }
  return stories;
}

var inflight = null;
var lastColdStartMs = 0;
var COLD_START_COOLDOWN_MS = 1e4;

async function refreshHN(env) {
  try {
    var data = await fetchStories();
    console.log(JSON.stringify({
      message: data.length === 0 ? "HN returned no stories, keeping cached data" : "Refreshed HN data",
      stories: data.length
    }));
    if (data.length === 0) return;
    var meta = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      stories: data.length
    };
    await env.HN_KV.put(KV_RAW, JSON.stringify(data));
    await env.HN_KV.put(KV_ESCAPED, JSON.stringify(data.map(escapeNews)));
    await env.HN_KV.put(KV_META, JSON.stringify(meta));
  } catch (err) {
    console.error(JSON.stringify({
      message: "Failed to refresh HN data",
      error: err instanceof Error ? err.message : String(err)
    }));
  }
}

function startRefresh(env) {
  if (!inflight) {
    inflight = refreshHN(env).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

function kickoffIfEmpty(env, ctx) {
  if (inflight) {
    ctx.waitUntil(inflight);
    return;
  }
  var now = Date.now();
  if (now - lastColdStartMs < COLD_START_COOLDOWN_MS) return;
  lastColdStartMs = now;
  ctx.waitUntil(startRefresh(env));
}

var JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*"
};
function notReady() {
  return new Response(JSON.stringify({ error: "Stories not loaded yet" }), {
    status: 503,
    headers: {
      ...JSON_HEADERS,
      "Retry-After": "10"
    }
  });
}
function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400"
    }
  });
}
async function readKey(env, key) {
  try {
    return await env.HN_KV.get(key);
  } catch (err) {
    console.error(JSON.stringify({
      message: "KV read failed",
      key,
      error: err instanceof Error ? err.message : String(err)
    }));
    return void 0;
  }
}
async function cachedJson(request, env, ctx, key, cacheControl) {
  var stored = await readKey(env, key);
  if (stored === void 0) return notReady();
  if (stored === null) {
    kickoffIfEmpty(env, ctx);
    return notReady();
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        ...JSON_HEADERS,
        "Cache-Control": cacheControl
      }
    });
  }
  return new Response(stored, {
    status: 200,
    headers: {
      ...JSON_HEADERS,
      "Cache-Control": cacheControl
    }
  });
}
async function handleFetch(request, env, ctx) {
  var { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") return corsPreflight();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        ...JSON_HEADERS,
        Allow: "GET, HEAD, OPTIONS"
      }
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
    headers: JSON_HEADERS
  });
}
async function handleScheduled(_controller, env, ctx) {
  var run = startRefresh(env);
  ctx.waitUntil(run);
  await run;
}
var index_default = {
  fetch: handleFetch,
  scheduled: handleScheduled
};
export {
  index_default as default
};
