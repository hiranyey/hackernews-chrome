// Shared with the Fastify server in the repo root (index.ts).
export const HN_URL = "https://news.ycombinator.com/";
export const FETCH_TIMEOUT_MS = 10_000;

// KV binding is HN_KV. These are the keys the scheduled handler writes
// and the fetch handler reads.
export const KV_RAW = "raw";
export const KV_ESCAPED = "escaped";
export const KV_META = "meta";

export interface News {
  id: string;
  title: string;
  url: string;
  points: string;
  user: string;
  comment: string;
}

export interface Meta {
  timestamp: string;
  stories: number;
}
