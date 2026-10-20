package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed ui/*
var embeddedUI embed.FS

func main() {
	ui, err := fs.Sub(embeddedUI, "ui")
	if err != nil {
		log.Fatal(err)
	}
	app := application.New(application.Options{
		Name: "GPUPanel Workstation",
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(ui)},
		Services: []application.Service{application.NewService(&DesktopService{})},
	})
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "workstation", Title: "GPUPanel · Local Workstation",
		Width: 1050, Height: 730, MinWidth: 800, MinHeight: 560,
		BackgroundColour: application.NewRGB(247, 248, 250),
	})
	window.Center()
	window.Show()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
