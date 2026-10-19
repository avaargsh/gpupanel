package lang

import (
	"fmt"
	"os"
	"path"
	"sort"
	"strings"

	"github.com/avaargsh/GPUPanel/agent/global"
	"github.com/avaargsh/GPUPanel/agent/utils/cmd"
	"github.com/avaargsh/GPUPanel/agent/utils/files"
)

func Init() {
	go initLang()
}

func initLang() {
	fileOp := files.NewFileOp()
	initGeo()
	isLangExist := fileOp.Stat(path.Join(global.CONF.Base.InstallDir, "gpupanel/lang/zh.sh"))
	if isLangExist {
		return
	}
	upgradePath := path.Join(global.CONF.Base.InstallDir, "gpupanel/tmp/upgrade")
	tmpPath, err := loadRestorePath(upgradePath)
	upgradeDir := path.Join(upgradePath, tmpPath, "downloads")
	if err != nil || len(tmpPath) == 0 || !fileOp.Stat(upgradeDir) {
		if !isLangExist {
			downloadLangFromRemote(fileOp)
		}

		return
	}

	files, _ := os.ReadDir(upgradeDir)
	if len(files) == 0 {
		tmpPath = "no such file"
	} else {
		for _, item := range files {
			if item.IsDir() && strings.HasPrefix(item.Name(), "gpupanel-") {
				tmpPath = path.Join(upgradePath, tmpPath, "downloads", item.Name())
				break
			}
		}
	}
	if tmpPath == "no such file" || !fileOp.Stat(tmpPath) {
		if !isLangExist {
			downloadLangFromRemote(fileOp)
		}

		return
	}
	if !isLangExist {
		if !fileOp.Stat(path.Join(tmpPath, "lang")) {
			downloadLangFromRemote(fileOp)
			return
		}
		if err := cmd.NewCommandMgr().Run("cp", "-r", path.Join(tmpPath, "lang"), path.Join(global.CONF.Base.InstallDir, "gpupanel")); err != nil {
			global.LOG.Errorf("load lang from package failed, %v", err)
			return
		}
		global.LOG.Info("init lang successful")
	}

}

func loadRestorePath(upgradeDir string) (string, error) {
	if _, err := os.Stat(upgradeDir); err != nil && os.IsNotExist(err) {
		return "no such file", nil
	}
	files, err := os.ReadDir(upgradeDir)
	if err != nil {
		return "", err
	}
	var folders []string
	for _, file := range files {
		if file.IsDir() {
			folders = append(folders, file.Name())
		}
	}
	if len(folders) == 0 {
		return "no such file", nil
	}
	sort.Slice(folders, func(i, j int) bool {
		return folders[i] > folders[j]
	})
	return folders[0], nil
}

func downloadLangFromRemote(fileOp files.FileOp) {
	path := fmt.Sprintf("%s/language/lang.tar.gz", global.ResourceURL())
	if err := fileOp.DownloadFile(path, path.Join(global.CONF.Base.InstallDir, "gpupanel/lang.tar.gz")); err != nil {
		global.LOG.Errorf("download lang.tar.gz failed, err: %v", err)
		return
	}
	if !fileOp.Stat(path.Join(global.CONF.Base.InstallDir, "gpupanel/lang.tar.gz")) {
		global.LOG.Error("download lang.tar.gz failed, no such file")
		return
	}
	if err := cmd.NewCommandMgr().Run("tar", "zxvfC", path.Join(global.CONF.Base.InstallDir, "gpupanel/lang.tar.gz"), path.Join(global.CONF.Base.InstallDir, "gpupanel")); err != nil {
		global.LOG.Errorf("decompress lang.tar.gz failed, %v", err)
		return
	}
	_ = os.Remove(path.Join(global.CONF.Base.InstallDir, "gpupanel/lang.tar.gz"))
	global.LOG.Info("download lang successful")
}
