import { describe, expect, it } from "vitest";
import { formatComment, mapItem } from "../src/hn-api.ts";

describe("formatComment", () => {
  it("matches HN subline text", () => {
    expect(formatComment(undefined)).toBe("discuss");
    expect(formatComment(0)).toBe("discuss");
    expect(formatComment(1)).toBe("1\u00a0comment");
    expect(formatComment(2)).toBe("2\u00a0comments");
  });
});

describe("mapItem", () => {
  it("maps a story with external url and string fields", () => {
    const news = mapItem({
      id: 123,
      type: "story",
      by: "alice",
      title: "Hello",
      url: "https://example.com/x",
      score: 42,
      descendants: 7,
    });
    expect(news).toEqual({
      id: "123",
      title: "Hello",
      url: "https://example.com/x",
      points: "42",
      user: "alice",
      comment: "7\u00a0comments",
    });
  });

  it("uses item page for Ask HN / self posts", () => {
    const news = mapItem({
      id: 99,
      type: "story",
      by: "bob",
      title: "Ask HN: hi",
      score: 1,
      descendants: 0,
    });
    expect(news?.url).toBe("https://news.ycombinator.com/item?id=99");
    expect(news?.comment).toBe("discuss");
    expect(news?.points).toBe("1");
  });

  it("skips deleted/dead and blanks job subline fields", () => {
    expect(mapItem({ id: 1, deleted: true })).toBeNull();
    expect(mapItem({ id: 2, dead: true, type: "story" })).toBeNull();
    const job = mapItem({
      id: 3,
      type: "job",
      title: "Hiring",
      url: "https://example.com/job",
      by: "corp",
      score: 1,
    });
    expect(job).toEqual({
      id: "3",
      title: "Hiring",
      url: "https://example.com/job",
      points: "",
      user: "",
      comment: "",
    });
  });
});
