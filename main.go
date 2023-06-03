package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/PuerkitoBio/goquery"
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

func SetLogOutput(sendToFile bool) *os.File {
	if sendToFile {
		logFile, err := os.OpenFile(
			"prod.log",
			os.O_APPEND|os.O_CREATE|os.O_WRONLY,
			0664,
		)
		if err != nil {
			panic(err)
		}
		log.Logger = zerolog.New(logFile).With().Timestamp().Logger()
		return logFile
	} else {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})
		return nil
	}
}

func ScrapeHN() []Hackernews {
	HNList := []Hackernews{}
	resp, err := http.Get("https://news.ycombinator.com")
	if err != nil {
		log.Err(err).Msg("Error fetching HN page")
		return HNList
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		log.Err(err).Msg("Error parsing HN html")
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
		HNList = append(HNList, newBox)
	})
	return HNList
}

func timeLogger(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		t := time.Now()
		err := next(c)
		log.Info().
			Str("Method", string(c.Request().Method)).
			Str("Route", c.Path()).
			Str("Time taken", fmt.Sprintf("%d", time.Since(t).Microseconds())).
			Msgf("Time taken")
		return err
	}
}

func writeNewHN(HNList []Hackernews) []Hackernews {
	log.Info().Msg("Scraping HN")
	newData := ScrapeHN()
	if len(newData) > 0 {
		log.Info().Msg("Refreshed HN data")
		return newData
	} else {
		log.Warn().Msg("HN data not refreshed")
		return HNList
	}
}

func main() {

	sendToFile := true
	for _, arg := range os.Args[1:] {
		if arg == "console" {
			sendToFile = false
		}
	}
	file := SetLogOutput(sendToFile)
	defer file.Close()
	HNList := writeNewHN([]Hackernews{})
	go func() {
		for range time.Tick(time.Minute * 2) {
			HNList = writeNewHN(HNList)
		}
	}()

	e := echo.New()
	e.Use(timeLogger)
	e.HideBanner = true
	e.Use(middleware.CORSWithConfig(middleware.DefaultCORSConfig))
	e.GET("/", func(c echo.Context) error {
		return c.JSON(http.StatusOK, HNList)
	})
	e.Logger.Fatal(e.Start(":8083"))
}
