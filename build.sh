#!/bin/sh
cd  ~/hackernews-chrome
git pull
go build main.go
systemctl restart hackernews.service
