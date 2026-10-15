package lang

import (
	"os"
	"path/filepath"

	"github.com/avaargsh/GPUPanel/agent/global"
	geodb "github.com/avaargsh/GPUPanel/agent/utils/geo"
)

func initGeo() {
	target := filepath.Join(global.CONF.Base.InstallDir, "gpupanel", "geo", "GeoIP.mmdb")
	if geodb.ValidateDatabase(target) == nil {
		return
	}
	upgrade := filepath.Join(global.CONF.Base.InstallDir, "gpupanel", "tmp", "upgrade")
	if latest, err := loadRestorePath(upgrade); err == nil {
		candidates, _ := filepath.Glob(filepath.Join(upgrade, latest, "downloads", "gpupanel-*", "GeoIP.mmdb"))
		for _, candidate := range candidates {
			if err := restoreGeo(candidate, target); err == nil {
				global.LOG.Info("init geo ip from package successful")
				return
			} else {
				global.LOG.Warnf("restore geo ip failed: %v", err)
			}
		}
	}
	if err := geodb.DownloadDatabase(geodb.DatabaseURL(), target); err != nil {
		global.LOG.Errorf("download geo ip failed: %v", err)
		return
	}
	global.LOG.Info("download geo ip successful (validated MMDB)")
}

func restoreGeo(source, target string) error {
	file, err := os.Open(source)
	if err != nil {
		return err
	}
	defer file.Close()
	return geodb.InstallDatabase(file, target)
}
