import { describe, expect, it } from "vitest";
import edgeHtml from "../../fixtures/edge-cases.html?raw";
import edgeExpected from "../../fixtures/edge-cases.expected.json";
import frontHtml from "../../fixtures/frontpage.html?raw";
import frontExpected from "../../fixtures/frontpage.expected.json";
import type { News } from "../../src/constants.ts";
import { escapeHTML, escapeNews, parseStories } from "../../src/parse.ts";

function byId(stories: News[]): Record<string, News> {
  return Object.fromEntries(stories.map((story) => [story.id, story]));
}

describe("HTMLRewriter parser", () => {
  it("matches cheerio on the saved HN front page", async () => {
    const stories = await parseStories(frontHtml);
    expect(stories).toEqual(frontExpected);

    const storiesById = byId(stories);
    // Launch HN relative link on the saved front page.
    expect(storiesById["50291116"]?.url).toBe(
      "https://news.ycombinator.com/item?id=50291116",
    );
    // &#x27; and &nbsp; decode the same way cheerio does.
    expect(storiesById["50289418"]?.title.startsWith("We're")).toBe(true);
    expect(storiesById["50289418"]?.comment).toBe("154\u00a0comments");
    expect(storiesById["50292233"]?.comment).toBe("discuss");
  });

  it("matches cheerio on jobs, Ask HN links, and dropped URLs", async () => {
    const stories = await parseStories(edgeHtml);
    expect(stories).toEqual(edgeExpected);

    const storiesById = byId(stories);
    expect(storiesById["1"]).toMatchObject({
      title: `AT&T says "hi" <ok>`,
      url: "https://example.com/a?b=1&c=2",
      points: "12",
      user: "alice",
      comment: "3\u00a0comments",
    });
    expect(storiesById["2"]).toMatchObject({
      title: `Ask HN: What's a good "editor"?`,
      url: "https://news.ycombinator.com/item?id=2",
      comment: "discuss",
    });
    // Job row copied from /jobs: age link is outside .subline.
    expect(storiesById["50280824"]).toMatchObject({
      title: "Nango (YC W23) Is Hiring Across Eng, FDE, Marketing, DevRel",
      url: "https://nango.dev/careers",
      points: "",
      user: "",
      comment: "",
    });
    expect(storiesById["4"]?.url).toBe("");
    expect(storiesById["5"]?.url).toBe("");
    expect(storiesById["6"]?.url).toBe("https://news.ycombinator.com/");
  });

  it("escapes parsed fields the way the legacy endpoint does", async () => {
    const stories = await parseStories(edgeHtml);
    const escaped = stories.map(escapeNews);
    expect(escaped[0]?.title).toBe(escapeHTML(stories[0]?.title ?? ""));
    expect(escaped[0]?.title).toBe("AT&amp;T says &quot;hi&quot; &lt;ok&gt;");
    expect(escaped[1]?.title).toContain("&#39;");
    expect(escaped[1]?.title).not.toContain("'");
  });
});
