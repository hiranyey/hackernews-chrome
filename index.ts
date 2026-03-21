import * as cheerio from 'cheerio';
import escapeHTML from 'escape-html';
import Fastify from 'fastify'
import cors from '@fastify/cors'

interface News {
    id: string
    title: string
    url: string
    points: string
    user: string
    comment: string
}

async function fetchHN() {
    const response = await fetch("https://news.ycombinator.com",{
        keepalive:true
    });
    const body = await response.text();
    const $ = await cheerio.load(body);
    const all_news = $(".athing")
    let frontPageNews: News[] = [];
    all_news.each((index, element) => {
        const id = $(element).attr("id") || "";
        const titleHTML = $(element).find(".titleline > a");
        const title = escapeHTML(titleHTML.first().text());
        const url = titleHTML.attr("href") || "";
        const next_element = $(element).next("tr");
        const points = next_element.find(".score").first().text().split(" ")[0];
        const finalCommentLink = next_element.find(".subline > a") || "";

        let user = "";
        let comment = "";

        finalCommentLink.each((index, commentElement) => {
            if (index == 0) {
                user = escapeHTML($(commentElement).text());
            } else if (index == finalCommentLink.length - 1) {
                comment = escapeHTML($(commentElement).text());
            }
        })
        const item: News = {
            id,
            title,
            url,
            points,
            user,
            comment
        }
        frontPageNews.push(item);
    })
    return frontPageNews;
}

let news: string = "";
const refreshHN = () => {
    fetchHN().then((data) => {
        console.log("Refreshed HN data");
        news = JSON.stringify(data);
    })
}
refreshHN();
setInterval(() => {
    refreshHN();
}, 2 * 60 * 1000);

const fastify = Fastify({
    logger: true
})
fastify.register(cors, {
    origin: '*',
});
fastify.get('/', async function handler(request, reply) {
    reply.code(200)
    .header('Content-Type', 'application/json; charset=utf-8')
    .send(news)
})
try {
    await fastify.listen({ port: 8000, host: '0.0.0.0' })
} catch (err) {
    fastify.log.error(err)
    process.exit(1)
}