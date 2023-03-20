import * as cheerio from "cheerio";
import Koa from "koa";
import cors from "@koa/cors";
const getHNArticles = async () => {
  const request = await fetch("https://news.ycombinator.com");
  const data = await request.text();
  const $ = await cheerio.load(data);
  let result = [];
  $(".athing").each(function () {
    let x = $(this).find(".titleline").children("a");
    let id = $(this).prop("id");
    let title = x.html();
    let url = x.prop("href");
    let meta = $(this).next();
    let points = "0";
    try {
      points = meta.find(".score").html().replace("points", "").trim();
    } catch (err) {}
    let user = "";
    try {
      user = meta.find(".hnuser").html().replace("", "");
    } catch (err) {}
    let subtext = meta.find(".subtext").find(".subline").children("a").last();
    let comment = "0 comment";
    try {
      comment = subtext.text();
    } catch (err) {}
    result.push({
      id,
      title,
      url,
      points,
      user,
      comment,
    });
  });
  return result;
};

let HNData = [];

getHNArticles().then((data) => {
  HNData = data;
});

setInterval(async () => {
  console.log("Refreshed HN");
  getHNArticles().then((data) => {
    HNData = data;
  });
}, 120 * 1000);

const app = new Koa();
app.use(
  cors({
    origin: "*",
  })
);
app.use(async (ctx) => {
  ctx.body = HNData;
});
const port = process.env.PORT || 3000;
app.listen(port);
//END OF FILE
