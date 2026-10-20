package main

import (
	"embed"
	"io/fs"
	"os"
	"fmt"
	"errors"
	"time"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed ui/*
var embeddedUI embed.FS

func headless(args []string) (string, error) {
	if len(args) != 1 {
		return "", errors.New("supported headless options: --doctor, --versions, --help")
	}
	switch args[0] {
	case "--doctor":
		return runEmbeddedPython(25*time.Second, "gpupanel-workstation.py", "doctor")
	case "--versions":
		return runEmbeddedPython(25*time.Second, "gpupanel-workstation.py", "versions")
	case "--help":
		return "GPUPanel Desktop: GUI (no args) | --doctor | --versions\\n", nil
	default:
		return "", errors.New("unsupported command; no arbitrary shell or privileged operation is available")
	}
}

func main() {
	if len(os.Args) > 1 {
		output, err := headless(os.Args[1:])
		if err != nil { log.Fatal(err) }
		fmt.Print(output)
		return
	}
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
