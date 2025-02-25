package main

import (
	"encoding/json"
	"log"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

type Hackernews struct {
	Id      string `json:"id"`
	Title   string `json:"title"`
	Url     string `json:"url"`
	Points  string `json:"points"`
	User    string `json:"user"`
	Comment string `json:"comment"`
}

func ScrapeHN() []Hackernews {
	HNList := []Hackernews{}
	resp, err := http.Get("https://news.ycombinator.com")
	if err != nil {
		slog.Error("Error fetching HN page", "error", err)
		return HNList
	}
	defer resp.Body.Close()
	doc, err := goquery.NewDocumentFromReader(resp.Body)
	if err != nil {
		slog.Error("Error parsing HN html", "error", err)
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

func writeNewHN(HNList []Hackernews) []Hackernews {
	slog.Info("Scraping HN")
	newData := ScrapeHN()
	if len(newData) > 0 {
		slog.Info("Refreshed HN data")
		return newData
	} else {
		slog.Warn("HN data not refreshed")
		return HNList
	}
}

func main() {
	HNList := writeNewHN([]Hackernews{})
	go func() {
		for range time.Tick(time.Minute * 2) {
			HNList = writeNewHN(HNList)
		}
	}()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode(HNList)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			slog.Error("Error encoding JSON", "error", err)
			return
		}
	})

	slog.Info("Starting server", "port", ":8083")
	log.Fatal(http.ListenAndServe(":8083", nil))
}
