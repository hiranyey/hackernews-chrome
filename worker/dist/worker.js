// src/constants.ts
var HN_URL = "https://news.ycombinator.com/";
var FETCH_TIMEOUT_MS = 1e4;
var KV_RAW = "raw";
var KV_ESCAPED = "escaped";
var KV_META = "meta";

// src/parse.ts
function safeURL(href) {
  try {
    const url = new URL(href, HN_URL);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
var NAMED_ENTITIES = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: "\xA0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201C",
  rdquo: "\u201D",
  copy: "\xA9",
  reg: "\xAE",
  trade: "\u2122",
  bull: "\u2022",
  middot: "\xB7",
  times: "\xD7",
  divide: "\xF7"
};
var WINDOWS_1252 = {
  128: "\u20AC",
  130: "\u201A",
  131: "\u0192",
  132: "\u201E",
  133: "\u2026",
  134: "\u2020",
  135: "\u2021",
  136: "\u02C6",
  137: "\u2030",
  138: "\u0160",
  139: "\u2039",
  140: "\u0152",
  142: "\u017D",
  145: "\u2018",
  146: "\u2019",
  147: "\u201C",
  148: "\u201D",
  149: "\u2022",
  150: "\u2013",
  151: "\u2014",
  152: "\u02DC",
  153: "\u2122",
  154: "\u0161",
  155: "\u203A",
  156: "\u0153",
  158: "\u017E",
  159: "\u0178"
};
function decodeNumericReference(body) {
  const hex = body[1] === "x" || body[1] === "X";
  const codePoint = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 1114111) {
    return "\uFFFD";
  }
  if (codePoint === 0 || codePoint >= 55296 && codePoint <= 57343) {
    return "\uFFFD";
  }
  return WINDOWS_1252[codePoint] ?? String.fromCodePoint(codePoint);
}
function decodeHTML(value) {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/g,
    (entity, body) => {
      if (body[0] === "#") return decodeNumericReference(body);
      return NAMED_ENTITIES[body] ?? entity;
    }
  );
}
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
function blankStory(id) {
  return {
    id,
    title: "",
    // Cheerio always runs safeURL(titleLink.attr("href") || ""). With no
    // title anchor that is safeURL(""), which resolves to the HN origin.
    url: safeURL(""),
    points: "",
    user: "",
    comment: "",
    titleCaptured: false,
    scoreCaptured: false,
    userCaptured: false
  };
}
function toNews(story) {
  return {
    id: story.id,
    title: story.title,
    url: story.url,
    points: story.points,
    user: story.user,
    comment: story.comment
  };
}
function classListHas(classAttribute, name) {
  if (!classAttribute) return false;
  return classAttribute.split(/\s+/).includes(name);
}
async function parseStories(html) {
  const stories = [];
  let current = null;
  let awaitingSub = false;
  let titleBuf = "";
  let capturingTitle = false;
  let scoreBuf = "";
  let capturingScore = false;
  let userBuf = "";
  let capturingUser = false;
  let commentBuf = "";
  let capturingComment = false;
  function flush() {
    if (!current) return;
    stories.push(toNews(current));
    current = null;
    awaitingSub = false;
  }
  const rewriter = new HTMLRewriter().on("tr.athing", {
    element(element) {
      if (current) flush();
      current = blankStory(decodeHTML(element.getAttribute("id") || ""));
      awaitingSub = false;
      element.onEndTag(() => {
        awaitingSub = true;
      });
    }
  }).on("tr", {
    element(element) {
      if (!current || !awaitingSub) return;
      if (classListHas(element.getAttribute("class"), "athing")) return;
      awaitingSub = false;
      element.onEndTag(() => {
        flush();
      });
    }
  }).on(".titleline > a", {
    element(element) {
      if (!current || current.titleCaptured) return;
      current.titleCaptured = true;
      current.url = safeURL(decodeHTML(element.getAttribute("href") || ""));
      titleBuf = "";
      capturingTitle = true;
      element.onEndTag(() => {
        if (current) current.title = decodeHTML(titleBuf);
        capturingTitle = false;
      });
    },
    text(text) {
      if (capturingTitle) titleBuf += text.text;
    }
  }).on(".subline .score", {
    element(element) {
      if (!current || current.scoreCaptured) return;
      current.scoreCaptured = true;
      scoreBuf = "";
      capturingScore = true;
      element.onEndTag(() => {
        if (current) current.points = decodeHTML(scoreBuf).split(" ")[0] ?? "";
        capturingScore = false;
      });
    },
    text(text) {
      if (capturingScore) scoreBuf += text.text;
    }
  }).on(".subline .hnuser", {
    element(element) {
      if (!current || current.userCaptured) return;
      current.userCaptured = true;
      userBuf = "";
      capturingUser = true;
      element.onEndTag(() => {
        if (current) current.user = decodeHTML(userBuf);
        capturingUser = false;
      });
    },
    text(text) {
      if (capturingUser) userBuf += text.text;
    }
  }).on(".subline a", {
    element(element) {
      if (!current) return;
      const href = decodeHTML(element.getAttribute("href") || "");
      if (href !== `item?id=${current.id}`) return;
      commentBuf = "";
      capturingComment = true;
      element.onEndTag(() => {
        if (current) current.comment = decodeHTML(commentBuf);
        capturingComment = false;
      });
    },
    text(text) {
      if (capturingComment) commentBuf += text.text;
    }
  }).onDocument({
    end() {
      if (current) flush();
    }
  });
  await rewriter.transform(new Response(html)).arrayBuffer();
  return stories;
}

// src/refresh.ts
var inflight = null;
var lastColdStartMs = 0;
var COLD_START_COOLDOWN_MS = 1e4;
async function refreshHN(env) {
  try {
    const response = await fetch(HN_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`HN responded with ${response.status}`);
    }
    const data = await parseStories(await response.text());
    console.log(
      JSON.stringify({
        message: data.length === 0 ? "HN returned no stories, keeping cached data" : "Refreshed HN data",
        stories: data.length
      })
    );
    if (data.length === 0) return;
    const meta = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      stories: data.length
    };
    await env.HN_KV.put(KV_RAW, JSON.stringify(data));
    await env.HN_KV.put(KV_ESCAPED, JSON.stringify(data.map(escapeNews)));
    await env.HN_KV.put(KV_META, JSON.stringify(meta));
  } catch (err) {
    console.error(
      JSON.stringify({
        message: "Failed to refresh HN data",
        error: err instanceof Error ? err.message : String(err)
      })
    );
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
  const now = Date.now();
  if (now - lastColdStartMs < COLD_START_COOLDOWN_MS) return;
  lastColdStartMs = now;
  ctx.waitUntil(startRefresh(env));
}

// src/index.ts
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
    console.error(
      JSON.stringify({
        message: "KV read failed",
        key,
        error: err instanceof Error ? err.message : String(err)
      })
    );
    return void 0;
  }
}
async function cachedJson(request, env, ctx, key, cacheControl) {
  const stored = await readKey(env, key);
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
  const { pathname } = new URL(request.url);
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
  const run = startRefresh(env);
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
