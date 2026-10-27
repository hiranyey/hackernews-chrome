import * as cheerio from 'cheerio';
import escapeHTML from 'escape-html';
import Fastify, { type FastifyReply } from 'fastify'
import cors from '@fastify/cors'

const HN_URL = "https://news.ycombinator.com/";
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10 * 1000;

interface News {
    id: string
    title: string
    url: string
    points: string
    user: string
    comment: string
}

const fastify = Fastify({
    logger: true
})

// Resolve relative links (e.g. "item?id=123" for Ask HN) and drop anything
// that isn't http(s), such as javascript: URLs.
function safeURL(href: string): string {
    try {
        const url = new URL(href, HN_URL);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

async function fetchHN(): Promise<News[]> {
    const response = await fetch(HN_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) {
        throw new Error(`HN responded with ${response.status}`);
    }
    const body = await response.text();
    const $ = cheerio.load(body);
    const frontPageNews: News[] = [];
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
            comment: subline.find(`a[href="item?id=${id}"]`).last().text()
        });
    });
    return frontPageNews;
}

// Extension versions before 1.6 insert these fields with innerHTML,
// so the legacy endpoint keeps serving HTML-escaped values.
function escapeNews(news: News): News {
    return {
        id: escapeHTML(news.id),
        title: escapeHTML(news.title),
        url: escapeHTML(news.url),
        points: escapeHTML(news.points),
        user: escapeHTML(news.user),
        comment: escapeHTML(news.comment)
    };
}

let rawNews: string | null = null;
let escapedNews: string | null = null;

const refreshHN = async () => {
    try {
        const data = await fetchHN();
        if (data.length === 0) {
            // Usually an error or rate-limit page; keep serving the last good copy.
            fastify.log.warn("HN returned no stories, keeping cached data");
            return;
        }
        rawNews = JSON.stringify(data);
        escapedNews = JSON.stringify(data.map(escapeNews));
        fastify.log.info(`Refreshed HN data (${data.length} stories)`);
    } catch (err) {
        fastify.log.error(err, "Failed to refresh HN data");
    }
}
refreshHN();
const refreshTimer = setInterval(refreshHN, REFRESH_INTERVAL_MS);

fastify.register(cors, {
    origin: '*',
});

const sendNews = (news: string | null, reply: FastifyReply) => {
    if (news === null) {
        return reply.code(503)
            .header('Retry-After', '10')
            .send({ error: "Stories not loaded yet" });
    }
    return reply.code(200)
        .header('Content-Type', 'application/json; charset=utf-8')
        .header('Cache-Control', 'public, max-age=60')
        .send(news);
}

fastify.get('/', async function handler(request, reply) {
    return sendNews(escapedNews, reply);
})
fastify.get('/v2', async function handler(request, reply) {
    return sendNews(rawNews, reply);
})

const shutdown = async (signal: string) => {
    fastify.log.info(`Received ${signal}, shutting down`);
    clearInterval(refreshTimer);
    await fastify.close();
    process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
    await fastify.listen({ port: 8000, host: '0.0.0.0' })
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}
