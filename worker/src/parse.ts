import { HN_URL, type News } from "./constants.ts";

// Resolve relative links (e.g. "item?id=123" for Ask HN) and drop anything
// that isn't http(s), such as javascript: URLs. Same rules as index.ts.
export function safeURL(href: string): string {
  try {
    const url = new URL(href, HN_URL);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

// HTMLRewriter on the current Workers runtime returns entity source text
// (`&#x27;`, `&nbsp;`, `&amp;`) instead of decoded characters. Cheerio/parse5
// decodes them, so we do the same before comparing fields or resolving URLs.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: "\u00a0",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  bull: "\u2022",
  middot: "\u00b7",
  times: "\u00d7",
  divide: "\u00f7",
};

// HTML5 numeric character reference replacements for Windows-1252 bytes.
const WINDOWS_1252: Record<number, string> = {
  0x80: "\u20ac",
  0x82: "\u201a",
  0x83: "\u0192",
  0x84: "\u201e",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02c6",
  0x89: "\u2030",
  0x8a: "\u0160",
  0x8b: "\u2039",
  0x8c: "\u0152",
  0x8e: "\u017d",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201c",
  0x94: "\u201d",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02dc",
  0x99: "\u2122",
  0x9a: "\u0161",
  0x9b: "\u203a",
  0x9c: "\u0153",
  0x9e: "\u017e",
  0x9f: "\u0178",
};

function decodeNumericReference(body: string): string {
  const hex = body[1] === "x" || body[1] === "X";
  const codePoint = hex
    ? Number.parseInt(body.slice(2), 16)
    : Number.parseInt(body.slice(1), 10);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return "\uFFFD";
  }
  if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return "\uFFFD";
  }
  return WINDOWS_1252[codePoint] ?? String.fromCodePoint(codePoint);
}

export function decodeHTML(value: string): string {
  return value.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/g,
    (entity, body: string) => {
      if (body[0] === "#") return decodeNumericReference(body);
      return NAMED_ENTITIES[body] ?? entity;
    },
  );
}

// Matches escape-html@1.0.3: &, <, >, ", ' -> &amp; &lt; &gt; &quot; &#39;.
// Other characters, including already-escaped text, are left alone except
// that a literal "&" is always escaped.
const ESCAPE_HTML_PATTERN = /[&<>"']/g;
const ESCAPE_HTML_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHTML(value: string): string {
  return value.replace(ESCAPE_HTML_PATTERN, (char) => ESCAPE_HTML_MAP[char] ?? char);
}

// Extension versions before 1.6 insert these fields with innerHTML,
// so the legacy endpoint keeps serving HTML-escaped values.
export function escapeNews(news: News): News {
  return {
    id: escapeHTML(news.id),
    title: escapeHTML(news.title),
    url: escapeHTML(news.url),
    points: escapeHTML(news.points),
    user: escapeHTML(news.user),
    comment: escapeHTML(news.comment),
  };
}

interface StoryDraft extends News {
  titleCaptured: boolean;
  scoreCaptured: boolean;
  userCaptured: boolean;
}

function blankStory(id: string): StoryDraft {
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
    userCaptured: false,
  };
}

function toNews(story: StoryDraft): News {
  return {
    id: story.id,
    title: story.title,
    url: story.url,
    points: story.points,
    user: story.user,
    comment: story.comment,
  };
}

function classListHas(classAttribute: string | null, name: string): boolean {
  if (!classAttribute) return false;
  return classAttribute.split(/\s+/).includes(name);
}

// Mirrors the cheerio loop in index.ts:
//   $(".athing") -> id, first ".titleline > a", next tr's ".subline"
//   points: first ".score" text, first whitespace-separated token
//   user: first ".hnuser"
//   comment: last a[href="item?id=<id>"] inside that subline
// Job posts have no .subline, so points/user/comment stay empty even though
// the following row links to item?id=....
export async function parseStories(html: string): Promise<News[]> {
  const stories: News[] = [];
  let current: StoryDraft | null = null;
  let awaitingSub = false;

  let titleBuf = "";
  let capturingTitle = false;
  let scoreBuf = "";
  let capturingScore = false;
  let userBuf = "";
  let capturingUser = false;
  let commentBuf = "";
  let capturingComment = false;

  function flush(): void {
    if (!current) return;
    stories.push(toNews(current));
    current = null;
    awaitingSub = false;
  }

  const rewriter = new HTMLRewriter()
    .on("tr.athing", {
      element(element) {
        // A previous story with no following row still counts.
        if (current) flush();
        current = blankStory(decodeHTML(element.getAttribute("id") || ""));
        awaitingSub = false;
        element.onEndTag(() => {
          awaitingSub = true;
        });
      },
    })
    .on("tr", {
      element(element) {
        // .next("tr") is the immediate next row, and it is not itself an athing.
        if (!current || !awaitingSub) return;
        if (classListHas(element.getAttribute("class"), "athing")) return;
        awaitingSub = false;
        element.onEndTag(() => {
          flush();
        });
      },
    })
    .on(".titleline > a", {
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
      },
    })
    .on(".subline .score", {
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
      },
    })
    .on(".subline .hnuser", {
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
      },
    })
    .on(".subline a", {
      element(element) {
        if (!current) return;
        const href = decodeHTML(element.getAttribute("href") || "");
        // Exact match, same as cheerio's a[href="item?id=<id>"]. The age
        // link matches too; the comments link comes last and overwrites it.
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
      },
    })
    .onDocument({
      end() {
        if (current) flush();
      },
    });

  // Handlers run as the transformed body is consumed. The page is small.
  await rewriter.transform(new Response(html)).arrayBuffer();
  return stories;
}
