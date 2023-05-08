package main

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/go-co-op/gocron"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

type Hackernews struct {
	Id      string `json:"id"`
	Title   string `json:"title"`
	Url     string `json:"url"`
	Points  string `json:"points"`
	User    string `json:"user"`
	Comment string `json:"comment"`
}

func ScrapeHN() []*Hackernews {
	HNList := []*Hackernews{}
	resp, err := http.Get("https://news.ycombinator.com")
	if err != nil {
		log.Fatal(err)
		return HNList
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		log.Fatal(err)
		return HNList
	}
	doc.Find(".athing").Each(func(i int, s *goquery.Selection) {
		id, _ := s.Attr("id")
		title := s.Find(".titleline").Get(0).FirstChild.FirstChild.Data
		url := s.Find(".titleline").Get(0).FirstChild.Attr[0].Val
		username := s.Next().Find(".hnuser").Text()
		points := strings.Split(s.Next().Find(".score").Text(), " ")[0]
		comments := s.Next().Find("a[href*='item']").Last().Text()
		if comments == "" {
			comments = "0 comments"
		}
		newBox := Hackernews{
			Id:      id,
			Title:   title,
			Url:     url,
			Points:  points,
			User:    username,
			Comment: comments,
		}
		HNList = append(HNList, &newBox)
	})
	return HNList
}

func main() {
	HNList := []*Hackernews{}

	scheduler := gocron.NewScheduler(time.UTC)
	scheduler.Every(2).Minutes().Do(func() {
		newData := ScrapeHN()
		if len(newData) > 0 {
			HNList = newData
		}
	})
	scheduler.StartAsync()
	e := echo.New()
	e.Use(middleware.CORSWithConfig(middleware.DefaultCORSConfig))
	e.GET("/", func(c echo.Context) error {
		return c.JSON(http.StatusOK, HNList)
	})
	e.Logger.Fatal(e.Start(":8083"))
}
