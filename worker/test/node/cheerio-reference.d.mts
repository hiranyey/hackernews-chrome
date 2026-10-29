export const HN_URL: string;

export interface CheerioNews {
  id: string;
  title: string;
  url: string;
  points: string;
  user: string;
  comment: string;
}

export function safeURL(href: string): string;
export function parseWithCheerio(body: string): CheerioNews[];
