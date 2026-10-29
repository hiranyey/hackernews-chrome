import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import escapeHtml from "escape-html";
import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { decodeHTML, escapeHTML, escapeNews, safeURL } from "../../src/parse.ts";
import { parseWithCheerio, safeURL as serverSafeURL } from "./cheerio-reference.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "../../fixtures");

function readHtml(name: string): string {
  return readFileSync(join(fixtures, `${name}.html`), "utf8");
}

function readExpected(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, `${name}.expected.json`), "utf8"));
}

describe("escapeHTML matches escape-html", () => {
  const samples = [
    "",
    "plain",
    "a&b<c>d\"e'f",
    "AT&T says \"hi\" <ok>",
    "Ask HN: What's a good \"editor\"?",
    "already &amp; escaped",
    "quote's",
    "<<<>>>",
    "100%",
    "line\nbreak",
    "emoji ✨",
    "slash / and backtick `",
  ];

  it.each(samples)("escapes %j", (sample) => {
    expect(escapeHTML(sample)).toBe(escapeHtml(sample));
  });

  it("escapes every field of a story", () => {
    const story = {
      id: "1",
      title: `AT&T <"ok"> it's fine`,
      url: "https://example.com/a?b=1&c=2",
      points: "12",
      user: "alice",
      comment: "3\u00a0comments",
    };
    expect(escapeNews(story)).toEqual({
      id: escapeHtml(story.id),
      title: escapeHtml(story.title),
      url: escapeHtml(story.url),
      points: escapeHtml(story.points),
      user: escapeHtml(story.user),
      comment: escapeHtml(story.comment),
    });
  });
});

describe("decodeHTML matches cheerio", () => {
  const samples = [
    "plain",
    "AT&amp;T",
    "&quot;hi&quot;",
    "&lt;ok&gt;",
    "What&#x27;s",
    "&#39;",
    "ANSI&#x2F;ASCII",
    "3&nbsp;comments",
    "a&amp;amp;b",
    "&apos;",
    "&mdash;",
    "&rsquo;",
    "&#128;",
    "&#0;",
  ];

  it.each(samples)("decodes %j", (sample) => {
    const text = cheerio.load(`<span>${sample}</span>`)("span").text();
    expect(decodeHTML(sample)).toBe(text);
  });
});

describe("safeURL matches the Fastify server", () => {
  const hrefs = [
    "",
    "https://example.com/a?b=1&c=2",
    "http://example.com",
    "item?id=50291116",
    "/item?id=2",
    "javascript:alert(1)",
    "mailto:hn@ycombinator.com",
    "data:text/html,hi",
    "//example.com/path",
    "not a url \u0000",
  ];

  it.each(hrefs)("resolves %j", (href) => {
    expect(safeURL(href)).toBe(serverSafeURL(href));
  });
});

describe("cheerio oracle matches the saved fixtures", () => {
  it("parses the saved HN front page", () => {
    const stories = parseWithCheerio(readHtml("frontpage"));
    expect(stories.length).toBeGreaterThan(0);
    expect(stories).toEqual(readExpected("frontpage"));
  });

  it("parses jobs, Ask HN links, and non-http URLs", () => {
    const stories = parseWithCheerio(readHtml("edge-cases"));
    expect(stories).toEqual(readExpected("edge-cases"));
    const byId = Object.fromEntries(stories.map((story) => [story.id, story]));
    expect(byId["2"]?.url).toBe("https://news.ycombinator.com/item?id=2");
    expect(byId["50280824"]).toMatchObject({ points: "", user: "", comment: "" });
    expect(byId["4"]?.url).toBe("");
    expect(byId["5"]?.url).toBe("");
  });
});
