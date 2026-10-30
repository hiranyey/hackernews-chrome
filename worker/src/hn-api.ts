import { FETCH_TIMEOUT_MS, type News } from "./constants.ts";

const HN_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json";
const HN_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/";
const HN_ITEM_PAGE = "https://news.ycombinator.com/item?id=";
const STORY_LIMIT = 30;

export interface HnItem {
  id: number;
  deleted?: boolean;
  dead?: boolean;
  type?: string;
  by?: string;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
}

/** Match cheerio/HTMLRewriter comment link text: discuss | 1\u00a0comment | N\u00a0comments */
export function formatComment(descendants: number | undefined): string {
  const n = typeof descendants === "number" ? descendants : 0;
  if (n <= 0) return "discuss";
  if (n === 1) return "1\u00a0comment";
  return `${n}\u00a0comments`;
}

function storyUrl(item: HnItem): string {
  const url = item.url;
  if (typeof url === "string" && /^https?:/i.test(url)) return url;
  return `${HN_ITEM_PAGE}${item.id}`;
}

/** Map a Firebase item to the Fastify/cheerio News shape (all fields strings). */
export function mapItem(item: HnItem | null | undefined): News | null {
  if (!item || item.deleted || item.dead) return null;
  if (item.type && item.type !== "story" && item.type !== "job") return null;

  const id = String(item.id);
  if (item.type === "job") {
    // Jobs on the front page have no .subline in the HTML scrape.
    return {
      id,
      title: item.title == null ? "" : String(item.title),
      url: storyUrl(item),
      points: "",
      user: "",
      comment: "",
    };
  }

  return {
    id,
    title: item.title == null ? "" : String(item.title),
    url: storyUrl(item),
    points: item.score == null ? "" : String(item.score),
    user: item.by == null ? "" : String(item.by),
    comment: formatComment(item.descendants),
  };
}

export async function fetchStories(): Promise<News[]> {
  const topRes = await fetch(HN_TOP_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!topRes.ok) {
    const topBody = (await topRes.text()).slice(0, 200);
    console.error(
      JSON.stringify({
        message: "HN topstories non-2xx",
        status: topRes.status,
        body: topBody,
      }),
    );
    throw new Error(`HN topstories responded with ${topRes.status}`);
  }
  const ids: unknown = await topRes.json();
  if (!Array.isArray(ids)) throw new Error("HN topstories returned non-array");

  const first = (ids as number[]).slice(0, STORY_LIMIT);
  const items = await Promise.all(
    first.map(async (id) => {
      const r = await fetch(`${HN_ITEM_URL}${id}.json`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) {
        const body = (await r.text()).slice(0, 200);
        console.error(
          JSON.stringify({
            message: "HN item non-2xx",
            id,
            status: r.status,
            body,
          }),
        );
        return null;
      }
      return (await r.json()) as HnItem;
    }),
  );

  const stories: News[] = [];
  for (const item of items) {
    const mapped = mapItem(item);
    if (mapped) stories.push(mapped);
  }
  return stories;
}
