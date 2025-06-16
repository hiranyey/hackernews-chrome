import html
import logging
import asyncio
from typing import List
from contextlib import asynccontextmanager

from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


class Hackernews(BaseModel):
    id: str
    title: str
    url: str
    points: str
    user: str
    comment: str


# Global list to store HN articles
hn_list: List[Hackernews] = []


@asynccontextmanager
async def init_app(_: FastAPI):
    """Initialize app: initial scrape and start background thread."""
    await write_new_hn()
    task = asyncio.create_task(background_scraper())
    logger.info("Background scraper started")
    yield  # Required for lifespan context
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        logger.info("Background scraper stopped")


async def scrape_hn() -> List[Hackernews]:
    """Scrape Hacker News front page and return list of articles."""
    articles = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://news.ycombinator.com", timeout=10)
            resp.raise_for_status()
    except httpx.RequestError as e:
        logger.error("Error fetching HN page: %s", e)
        return articles

    try:
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.error("Error parsing HN html: %s", e)
        return articles

    for item in soup.find_all(class_="athing"):
        try:
            item_id = item.get("id", "")

            titleline = item.find(class_="titleline")
            if titleline and titleline.a:
                title = titleline.a.get_text()
                url = titleline.a.get("href", "")
            else:
                continue

            subtext = item.find_next_sibling("tr")
            if subtext:
                hnuser = subtext.find(class_="hnuser")
                username = hnuser.get_text() if hnuser else ""

                score = subtext.find(class_="score")
                points = score.get_text().split()[0] if score else ""

                # Find comments link
                comment_links = subtext.find_all("a")
                comments = (
                    comment_links[-1].get_text() if comment_links else "0 comments"
                )
                if not comments:
                    comments = "0 comments"
            else:
                username = ""
                points = ""
                comments = "0 comments"

            article = Hackernews(
                id=str(item_id),
                title=html.escape(title),
                url=str(url),
                points=points,
                user=html.escape(username),
                comment=comments,
            )
            articles.append(article)
        except Exception as e:
            logger.warning("Error parsing article: %s", e)
            continue

    return articles


async def write_new_hn():
    """Refresh HN data periodically."""
    global hn_list
    logger.info("Scraping HN")
    new_data = await scrape_hn()
    if new_data:
        hn_list = new_data
        logger.info("Refreshed HN data")
    else:
        logger.warning("HN data not refreshed")


async def background_scraper():
    """Background thread that scrapes HN every 2 minutes."""
    while True:
        await asyncio.sleep(120)  # 2 minutes
        await write_new_hn()


app = FastAPI(
    name="HackerNews Scraper API",
    lifespan=init_app,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=List[Hackernews])
def get_hn_list():
    return hn_list
