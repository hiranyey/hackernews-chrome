// Mirrors the cheerio loop and safeURL in the repo-root Fastify server (index.ts).
// The worker parser is checked against this, not the other way around.
import * as cheerio from "cheerio";

export const HN_URL = "https://news.ycombinator.com/";

export function safeURL(href) {
  try {
    const url = new URL(href, HN_URL);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export function parseWithCheerio(body) {
  const $ = cheerio.load(body);
  const frontPageNews = [];
  $(".athing").each((_, element) => {
    const id = $(element).attr("id") || "";
    const titleLink = $(element).find(".titleline > a").first();
    const subline = $(element).next("tr").find(".subline");
    frontPageNews.push({
      id,
      title: titleLink.text(),
      url: safeURL(titleLink.attr("href") || ""),
      points: subline.find(".score").first().text().split(" ")[0],
      user: subline.find(".hnuser").first().text(),
      comment: subline.find(`a[href="item?id=${id}"]`).last().text(),
    });
  });
  return frontPageNews;
}
