package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/avaargsh/GPUPanel/core/app/dto"
	"github.com/avaargsh/GPUPanel/core/app/model"
	"github.com/avaargsh/GPUPanel/core/app/repo"
	"github.com/avaargsh/GPUPanel/core/buserr"
	"github.com/avaargsh/GPUPanel/core/constant"
	"github.com/avaargsh/GPUPanel/core/global"
	"github.com/avaargsh/GPUPanel/core/utils/cmd"
	"github.com/avaargsh/GPUPanel/core/utils/common"
	"github.com/avaargsh/GPUPanel/core/utils/controller"
	"github.com/avaargsh/GPUPanel/core/utils/files"
	"github.com/avaargsh/GPUPanel/core/utils/req_helper"
	upgradeUtil "github.com/avaargsh/GPUPanel/core/utils/upgrade"
	"github.com/avaargsh/GPUPanel/core/utils/xpack"
	"golang.org/x/net/html"
)

type serviceInfo struct {
	basePath     string
	coreName     string
	agentName    string
	selCoreName  string
	selAgentName string
	coreBinary   string
	agentBinary  string
}

const minUpgradeFreeSpace = 500 << 20 // 500MB

func loadServiceInfo() (serviceInfo, error) {
	basePath, err := controller.GetServicePath("")
	if err != nil {
		global.LOG.Errorf("get service path failed: %v", err)
		return serviceInfo{}, err
	}
	coreName, err := controller.LoadServiceName("gpupanel-core")
	if err != nil {
		global.LOG.Errorf("load core service name failed: %v", err)
		return serviceInfo{}, err
	}
	agentName, err := controller.LoadServiceName("gpupanel-agent")
	if err != nil {
		global.LOG.Errorf("load agent service name failed: %v", err)
		return serviceInfo{}, err
	}
	selCoreName, err := controller.SelectInitScript("gpupanel-core")
	if err != nil {
		global.LOG.Errorf("select core init script failed: %v", err)
		return serviceInfo{}, err
	}
	selAgentName, err := controller.SelectInitScript("gpupanel-agent")
	if err != nil {
		global.LOG.Errorf("select agent init script failed: %v", err)
		return serviceInfo{}, err
	}
	info := serviceInfo{
		basePath:     basePath,
		coreName:     coreName,
		agentName:    agentName,
		selCoreName:  selCoreName,
		selAgentName: selAgentName,
	}
	// Resolve the actual installed executable, never the /usr/local/bin
	// compatibility symlink, before touching backup/download/upgrade state.
	info.coreBinary, info.agentBinary, err = upgradeRuntimePaths(global.CONF.Base.InstallDir, info)
	if err != nil {
		return serviceInfo{}, err
	}
	return info, nil
}

type UpgradeService struct{}

type IUpgradeService interface {
	Upgrade(req dto.Upgrade) error
	Rollback(req dto.OperateByID) error
	LoadNotes(req dto.Upgrade) (string, error)
	SearchUpgrade() (*dto.UpgradeInfo, error)
	LoadRelease() ([]dto.ReleasesNotes, error)
}

func NewIUpgradeService() IUpgradeService {
	return &UpgradeService{}
}

func (u *UpgradeService) SearchUpgrade() (*dto.UpgradeInfo, error) {
	if global.CONF.Base.IsOffline {
		return &dto.UpgradeInfo{}, nil
	}
	var upgrade dto.UpgradeInfo
	currentVersion, err := settingRepo.Get(repo.WithByKey("SystemVersion"))
	if err != nil {
		return nil, err
	}
	DeveloperMode, err := settingRepo.Get(repo.WithByKey("DeveloperMode"))
	if err != nil {
		return nil, err
	}

	upgrade.TestVersion, upgrade.NewVersion, upgrade.LatestVersion = u.loadVersionByMode(DeveloperMode.Value, currentVersion.Value)
	var itemVersion string
	if len(upgrade.NewVersion) != 0 {
		itemVersion = upgrade.NewVersion
	}
	if (global.CONF.Base.Mode == "dev" || DeveloperMode.Value == constant.StatusEnable) && len(upgrade.TestVersion) != 0 {
		itemVersion = upgrade.TestVersion
	}
	if len(upgrade.LatestVersion) != 0 {
		itemVersion = upgrade.LatestVersion
	}
	if len(itemVersion) == 0 {
		return &upgrade, nil
	}
	mode := global.CONF.Base.Mode
	if strings.Contains(itemVersion, "beta") {
		mode = "beta"
	}
	if strings.HasPrefix(upgrade.TestVersion, upgrade.LatestVersion+"-beta") {
		upgrade.TestVersion = ""
	}
	notes, err := u.loadReleaseNotes(fmt.Sprintf("%s/%s/%s/release/gpupanel-%s-release-notes", global.RepoURL(), mode, itemVersion, itemVersion))
	if err != nil {
		return nil, fmt.Errorf("load releases-notes of version %s failed, err: %v", itemVersion, err)
	}
	upgrade.ReleaseNote = notes
	return &upgrade, nil
}

func (u *UpgradeService) LoadNotes(req dto.Upgrade) (string, error) {
	if err := validateUpgradeVersion(req.Version); err != nil {
		return "", err
	}
	mode := global.CONF.Base.Mode
	if strings.Contains(req.Version, "beta") {
		mode = "beta"
	}
	notes, err := u.loadReleaseNotes(fmt.Sprintf("%s/%s/%s/release/gpupanel-%s-release-notes", global.RepoURL(), mode, req.Version, req.Version))
	if err != nil {
		return "", fmt.Errorf("load releases-notes of version %s failed, err: %v", req.Version, err)
	}
	return notes, nil
}

func (u *UpgradeService) Upgrade(req dto.Upgrade) error {
	if err := validateUpgradeVersion(req.Version); err != nil {
		return err
	}
	global.LOG.Info("start to upgrade now...")
	itemArch, err := loadArch()
	if err != nil {
		return err
	}
	svcInfo, err := loadServiceInfo()
	if err != nil {
		return err
	}
	if err := checkUpgradeSpace(); err != nil {
		return err
	}

	// Take the durable SQLite admission before creating a stage or launching
	// a worker. Same-name and different-version requests share this fence.
	if err := claimUpgradeAdmission(settingRepo.UpdateIfMatch); err != nil {
		return err
	}
	// Never erase a previous rollback backup or concurrent transaction.
	baseDir, err := createUpgradeStage(global.CONF.Base.InstallDir, req.Version)
	if err != nil {
		if releaseErr := releaseUpgradeAdmission(settingRepo.UpdateIfMatch); releaseErr != nil {
			return fmt.Errorf("upgrade stage refused: %v; admission recovery: %w", err, releaseErr)
		}
		return err
	}
	downloadDir := path.Join(baseDir, "downloads")
	originalDir := path.Join(baseDir, "original")

	mode := global.CONF.Base.Mode
	if strings.Contains(req.Version, "beta") {
		mode = "beta"
	}
	downloadPath := fmt.Sprintf("%s/%s/%s/release", global.RepoURL(), mode, req.Version)
	fileName := fmt.Sprintf("gpupanel-%s-%s-%s.tar.gz", req.Version, "linux", itemArch)
	// Only pre-mutation failures may release the admission automatically.
	// Once an executable has been touched, keep the claim until an
	// independently verified rollback or post-upgrade health review.
	releaseBeforeMutation := func() {
		if err := releaseUpgradeAdmission(settingRepo.UpdateIfMatch); err != nil {
			global.LOG.Errorf("upgrade admission still unresolved: %v", err)
		}
	}
	rollbackAndReconcile := func(step int) {
		if err := u.handleRollback(originalDir, step, svcInfo); err != nil {
			global.LOG.Errorf("automatic rollback incomplete; upgrade remains blocked: %v", err)
			return
		}
		if err := releaseUpgradeAdmission(settingRepo.UpdateIfMatch); err != nil {
			global.LOG.Errorf("rollback completed but admission remains unresolved: %v", err)
		}
	}
	go func() {
		if err := files.DownloadFileWithProxyStream(downloadPath+"/"+fileName, downloadDir+"/"+fileName); err != nil {
			global.LOG.Errorf("download service file failed, err: %v", err)
			releaseBeforeMutation()
			return
		}
		global.LOG.Info("download all file successful!")
		defer func() {
			_ = os.Remove(downloadDir)
		}()
		// Reject untrusted release members before privileged untar.
		// This structural check does not authenticate the release publisher.
		archiveRoot := strings.TrimSuffix(fileName, ".tar.gz")
		if err := validateUpgradeArchive(path.Join(downloadDir, fileName), archiveRoot); err != nil {
			global.LOG.Errorf("upgrade archive rejected before extraction: %v", err)
			releaseBeforeMutation()
			return
		}
		if err := files.HandleUnTar(downloadDir+"/"+fileName, downloadDir, ""); err != nil {
			global.LOG.Errorf("decompress file failed, err: %v", err)
			releaseBeforeMutation()
			return
		}
		tmpDir := downloadDir + "/" + strings.ReplaceAll(fileName, ".tar.gz", "")

		if err := u.handleBackup(originalDir, svcInfo); err != nil {
			global.LOG.Errorf("handle backup original file failed, err: %v", err)
			releaseBeforeMutation()
			return
		}
		// A successful cp exit code does not establish that the rollback
		// executables and service definitions survived intact. Check the
		// complete owned backup before the FIRST binary replacement.
		if err := verifyUpgradeBackupInventory(originalDir, svcInfo); err != nil {
			global.LOG.Errorf("upgrade refused: rollback backup is incomplete: %v", err)
			releaseBeforeMutation()
			return
		}
		itemLog := model.UpgradeLog{NodeID: 0, OldVersion: global.CONF.Base.Version, NewVersion: req.Version, BackupFile: baseDir}
		if err := upgradeLogRepo.Create(&itemLog); err != nil {
			global.LOG.Errorf("upgrade refused: cannot persist rollback record: %v", err)
			releaseBeforeMutation()
			return
		}

		global.LOG.Info("rollback binary/unit snapshot verified; starting upgrade (database consistency still unproven)")

		if err := files.CopyFileWithRename(path.Join(tmpDir, "gpupanel-core"), svcInfo.coreBinary); err != nil {
			global.LOG.Errorf("upgrade gpupanel-core failed, err: %v", err)
			rollbackAndReconcile(1)
			return
		}
		if err := files.CopyFileWithRename(path.Join(tmpDir, "gpupanel-agent"), svcInfo.agentBinary); err != nil {
			global.LOG.Errorf("upgrade gpupanel-agent failed, err: %v", err)
			rollbackAndReconcile(1)
			return
		}

		// pctl is no longer part of the GPUPanel runtime; skip copying/updating the legacy ctl binary.
		initScriptPath := path.Join(tmpDir, "initscript")

		if err := files.CopyItem(false, true, path.Join(initScriptPath, svcInfo.selCoreName), svcInfo.basePath); err != nil {
			global.LOG.Errorf("upgrade %s failed, err: %v", svcInfo.coreName, err)
			rollbackAndReconcile(3)
			return
		}
		if err := files.CopyItem(false, true, path.Join(initScriptPath, svcInfo.selAgentName), svcInfo.basePath); err != nil {
			global.LOG.Errorf("upgrade %s failed, err: %v", svcInfo.agentName, err)
			rollbackAndReconcile(3)
			return
		}

		// The experimental installer may not have a complete app-local lang directory,
		// and the release builder may omit GeoIP.mmdb. Only replace an
		// asset that existed before the upgrade AND has a real backup.
		// Never make rollback require deletion of a newly created asset.
		langPath := path.Join(global.CONF.Base.InstallDir, "gpupanel/lang")
		langAllowed, langErr := shouldCopyOptionalUpgradeAsset(
			langPath, path.Join(originalDir, "lang"), path.Join(tmpDir, "lang"), true)
		if langErr != nil {
			global.LOG.Errorf("upgrade refused: unsafe optional language files: %v", langErr)
			rollbackAndReconcile(3)
			return
		}
		if langAllowed {
			if err := files.CopyItem(true, true, path.Join(tmpDir, "lang"), path.Join(global.CONF.Base.InstallDir, "gpupanel")); err != nil {
				global.LOG.Errorf("Update language files failed: %v", err)
				rollbackAndReconcile(4)
				return
			}
		}
		geoPath := path.Join(global.CONF.Base.InstallDir, "gpupanel/geo/GeoIP.mmdb")
		geoAllowed, geoErr := shouldCopyOptionalUpgradeAsset(
			geoPath, path.Join(originalDir, "GeoIP.mmdb"), path.Join(tmpDir, "GeoIP.mmdb"), false)
		if geoErr != nil {
			global.LOG.Errorf("upgrade refused: unsafe optional GeoIP file: %v", geoErr)
			rollbackAndReconcile(4)
			return
		}
		if geoAllowed {
			if err := files.CopyFileWithRename(path.Join(tmpDir, "GeoIP.mmdb"), geoPath); err != nil {
				global.LOG.Warnf("Update GeoIP database failed: %v", err)
				rollbackAndReconcile(4)
				return
			}
		}

		global.LOG.Warn("upgrade files staged; restart and Core/Agent health have NOT been verified")
		dropBackupCopies()
		xpack.MultiNodeProvider.AutoUpgradeWithMaster()
		_ = settingRepo.Update("SystemVersion", req.Version)
		_ = global.AgentDB.Model(&model.Setting{}).Where("key = ?", "SystemVersion").Updates(map[string]interface{}{"value": req.Version}).Error
		global.CONF.Base.Version = req.Version
		_ = os.RemoveAll(downloadDir)
		// No post-restart Core/Agent health proof exists in this asynchronous
		// legacy path. Keep SystemStatus=Upgrading to reject further upgrades
		// until a separately observed, authenticated reconciliation exists.
		controller.RestartPanel(true, true, true)
	}()
	return nil
}

func (u *UpgradeService) Rollback(req dto.OperateByID) error {
	log, _ := upgradeLogRepo.Get(repo.WithByID(req.ID))
	if log.ID == 0 {
		return buserr.New("ErrRecordNotFound")
	}
	svcInfo, err := loadServiceInfo()
	if err != nil {
		return err
	}
	// BackupFile records the upgrade transaction directory; the actual
	// sealed files were copied into its "original" child.
	backup, err := validateUpgradeBackupPath(global.CONF.Base.InstallDir, log.BackupFile)
	if err != nil {
		return err
	}
	if err := verifyUpgradeBackupInventory(backup, svcInfo); err != nil {
		return fmt.Errorf("refuse incomplete rollback snapshot: %w", err)
	}
	// Rollback is invoked by the running Core API. In-place restoration of
	// SQLite and service binaries while their owners are running is not an
	// offline recovery and can corrupt both DB and runtime state. The M0
	// offline guest recovery path is independent; leave these assets intact
	// until a stop-verified, separately operated rollback is implemented.
	return fmt.Errorf("%w: online rollback is disabled until offline service-stop and database restore are verified", errUpgradeRuntimeOwnership)
}

type noteHelper struct {
	Docs []noteDetailHelper `json:"docs"`
}
type noteDetailHelper struct {
	Location string `json:"location"`
	Text     string `json:"text"`
	Title    string `json:"title"`
}

func (u *UpgradeService) LoadRelease() ([]dto.ReleasesNotes, error) {
	docSource, _ := settingRepo.GetValueByKey("DocSource")
	lang, _ := settingRepo.GetValueByKey("Language")
	var notes []dto.ReleasesNotes
	url := "https://docs.fit2cloud.com/1panel/changelog/"
	useIntlDocs := false
	lang = strings.ToLower(strings.TrimSpace(lang))
	if docSource == "withByRegion" {
		useIntlDocs = global.CONF.Base.Edition == "intl"
	} else {
		useIntlDocs = lang != "zh"
	}
	if useIntlDocs {
		url = "https://docs.1panel.pro/v2/search/search_index.json"
	}
	resp, err := req_helper.HandleGet(url)
	if err != nil {
		return notes, err
	}
	defer resp.Body.Close()
	if !useIntlDocs {
		if resp.StatusCode != http.StatusOK {
			return notes, fmt.Errorf("load release notes failed: HTTP %d", resp.StatusCode)
		}
		return parseReleaseHTML(resp.Body)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return notes, err
	}
	var nodeItem noteHelper
	if err := json.Unmarshal(body, &nodeItem); err != nil {
		return notes, err
	}
	for _, item := range nodeItem.Docs {
		if !strings.HasPrefix(item.Location, "changelog/#v") {
			continue
		}
		itemNote := analyzeDoc(item.Title, item.Text)
		if len(itemNote.CreatedAt) != 0 {
			notes = append(notes, analyzeDoc(item.Title, item.Text))
		}
	}

	return notes, nil
}

func parseReleaseHTML(reader io.Reader) ([]dto.ReleasesNotes, error) {
	doc, err := html.Parse(reader)
	if err != nil {
		return nil, err
	}
	var article *html.Node
	for node := range doc.Descendants() {
		if node.Type == html.ElementNode && node.Data == "article" {
			article = node
			break
		}
	}
	if article == nil {
		return nil, fmt.Errorf("release notes article not found")
	}
	textContent := func(node *html.Node) string {
		var text strings.Builder
		for child := range node.Descendants() {
			if child.Type == html.TextNode {
				text.WriteString(child.Data)
			}
		}
		return strings.TrimSpace(strings.ReplaceAll(text.String(), "\u200b", ""))
	}
	var notes []dto.ReleasesNotes
	for heading := range article.Descendants() {
		if heading.Type != html.ElementNode || heading.Data != "h3" {
			continue
		}
		version := textContent(heading)
		if !strings.HasPrefix(version, "v") {
			continue
		}
		item := dto.ReleasesNotes{Version: version}
		var content strings.Builder
		section := ""
		for node := heading.NextSibling; node != nil; node = node.NextSibling {
			if node.Type != html.ElementNode {
				continue
			}
			if node.Data == "h1" || node.Data == "h2" || node.Data == "h3" {
				break
			}
			if item.CreatedAt == "" {
				date := textContent(node)
				if _, err := time.Parse("2006年1月2日", date); node.Data != "p" || err != nil {
					return nil, fmt.Errorf("release date not found for %s", version)
				}
				item.CreatedAt = date
				continue
			}
			if node.Data == "p" {
				section = textContent(node)
			}
			for child := range node.Descendants() {
				if child.Type != html.ElementNode || child.Data != "li" {
					continue
				}
				switch section {
				case "新增功能":
					item.NewCount++
				case "功能优化":
					item.OptimizationCount++
				case "问题修复":
					item.FixCount++
				}
			}
			if err := html.Render(&content, node); err != nil {
				return nil, err
			}
		}
		if item.CreatedAt == "" || content.Len() == 0 {
			return nil, fmt.Errorf("release notes content not found for %s", version)
		}
		item.Content = content.String()
		notes = append(notes, item)
	}
	if len(notes) == 0 {
		return nil, fmt.Errorf("release notes versions not found")
	}
	return notes, nil
}

func analyzeDoc(version, content string) dto.ReleasesNotes {
	var item dto.ReleasesNotes
	parts := strings.Split(content, "<p>")
	if len(parts) < 3 {
		return item
	}
	item.CreatedAt = strings.ReplaceAll(strings.TrimSpace(parts[1]), "</p>", "")
	for i := 1; i < len(parts); i++ {
		if strings.Contains(parts[i], "问题修复") || strings.Contains(parts[i], "Bug Fixes") {
			item.FixCount = strings.Count(parts[i], "<li>")
		}
		if strings.Contains(parts[i], "新增功能") || strings.Contains(parts[i], "New Features") {
			item.NewCount = strings.Count(parts[i], "<li>")
		}
		if strings.Contains(parts[i], "功能优化") || strings.Contains(parts[i], "Improvements") {
			item.OptimizationCount = strings.Count(parts[i], "<li>")
		}
	}
	item.Content = strings.Replace(content, fmt.Sprintf("<p>%s</p>", item.CreatedAt), "", 1)
	item.Version = version
	return item
}

func checkUpgradeSpace() error {
	dir := global.CONF.Base.InstallDir
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dir, &stat); err != nil {
		return err
	}
	avail := stat.Bavail * uint64(stat.Bsize)
	if avail < minUpgradeFreeSpace {
		return fmt.Errorf("available space of %s is %d MB, less than required 500MB", dir, avail>>20)
	}
	return nil
}

func (u *UpgradeService) handleBackup(originalDir string, svcInfo serviceInfo) error {
	if err := files.CopyItem(false, true, svcInfo.coreBinary, originalDir); err != nil {
		return err
	}
	if err := files.CopyItem(false, true, svcInfo.agentBinary, originalDir); err != nil {
		return err
	}
	// pctl is an app-local control script; it is not a global upgrade target.
	if hasLang, err := optionalUpgradeAsset(path.Join(global.CONF.Base.InstallDir, "gpupanel/lang"), true); err != nil {
		return err
	} else if hasLang {
		if err := files.CopyItem(true, true, path.Join(global.CONF.Base.InstallDir, "gpupanel/lang"), originalDir); err != nil {
			return err
		}
	}
	if err := files.CopyItem(false, true, path.Join(svcInfo.basePath, svcInfo.coreName), originalDir); err != nil {
		return err
	}
	if err := files.CopyItem(false, true, path.Join(svcInfo.basePath, svcInfo.agentName), originalDir); err != nil {
		return err
	}
	if err := files.CopyItem(true, true, path.Join(global.CONF.Base.InstallDir, "gpupanel/db"), originalDir); err != nil {
		return err
	}
	geoInstalled := path.Join(global.CONF.Base.InstallDir, "gpupanel/geo/GeoIP.mmdb")
	if hasGeo, err := optionalUpgradeAsset(geoInstalled, false); err != nil {
		return err
	} else if hasGeo {
		if err := files.CopyItem(false, true, geoInstalled, originalDir); err != nil {
			return err
		}
	}
	return nil
}

func (u *UpgradeService) handleRollback(originalDir string, errStep int, svcInfo serviceInfo) error {
	// Partial restoration must be visible to API callers and upstream
	// upgrade logs. Keep attempting independent steps, but never return a
	// successful rollback when any required asset could not be restored.
	var failures []error
	record := func(action string, err error) {
		if err == nil {
			return
		}
		global.LOG.Errorf("rollback %s failed: %v", action, err)
		failures = append(failures, fmt.Errorf("%s: %w", action, err))
	}
	// This handler is only reached before the upgrade's own service restart.
	// No database migration has been approved in that window, so reverting
	// staged Core/Agent files must NEVER copy an unproven SQLite snapshot
	// over databases still used by this Core and the running Agent. Full DB
	// restoration is an offline, separately authorized G3/G6 procedure.
	// The snapshot is preserved for an operator; do not delete or overwrite it.
	record("core executable", files.CopyFileWithRename(path.Join(originalDir, "gpupanel-core"), svcInfo.coreBinary))
	record("agent executable", files.CopyFileWithRename(path.Join(originalDir, "gpupanel-agent"), svcInfo.agentBinary))
	if errStep == 1 {
		return errors.Join(failures...)
	}
	// App-local pctl metadata is not part of binary restore. There are no
	// global compatibility symlinks to modify.
	if errStep == 2 {
		return errors.Join(failures...)
	}
	record(svcInfo.coreName, files.CopyFileWithRename(path.Join(originalDir, svcInfo.coreName), path.Join(svcInfo.basePath, svcInfo.coreName)))
	record(svcInfo.agentName, files.CopyFileWithRename(path.Join(originalDir, svcInfo.agentName), path.Join(svcInfo.basePath, svcInfo.agentName)))
	if errStep == 3 {
		return errors.Join(failures...)
	}
	if langSaved, err := optionalUpgradeAsset(path.Join(originalDir, "lang"), true); err != nil {
		record("language backup", err)
	} else if langSaved {
		record("language files", files.CopyItem(true, true, path.Join(originalDir, "lang"), path.Join(global.CONF.Base.InstallDir, "gpupanel")))
	}
	if geoSaved, err := optionalUpgradeAsset(path.Join(originalDir, "GeoIP.mmdb"), false); err != nil {
		record("GeoIP backup", err)
	} else if geoSaved {
		record("GeoIP", files.CopyFileWithRename(path.Join(originalDir, "GeoIP.mmdb"), path.Join(global.CONF.Base.InstallDir, "gpupanel/geo/GeoIP.mmdb")))
	}
	return errors.Join(failures...)
}

func (u *UpgradeService) loadVersionByMode(developer, currentVersion string) (string, string, string) {
	var current, latest string
	if global.CONF.Base.Mode == "dev" {
		devVersionLatest := u.loadVersion(true, currentVersion, "dev")
		return devVersionLatest, "", ""
	}

	betaVersionLatest := ""
	latest = u.loadVersion(true, currentVersion, "stable")
	current = u.loadVersion(false, currentVersion, "stable")
	if developer == constant.StatusEnable {
		betaVersionLatest = u.loadVersion(true, currentVersion, "beta")
	}
	if current != latest {
		return betaVersionLatest, current, latest
	}

	versionPart := strings.Split(current, ".")
	if len(versionPart) < 3 {
		return betaVersionLatest, "", latest
	}
	num, _ := strconv.Atoi(versionPart[1])
	if num == 0 {
		return betaVersionLatest, "", latest
	}
	if num >= 10 {
		if current[:6] == currentVersion[:6] {
			return betaVersionLatest, current, ""
		}
		return betaVersionLatest, "", latest
	}
	if current[:5] == currentVersion[:5] {
		return betaVersionLatest, "", ""
	}
	return betaVersionLatest, "", latest
}

func (u *UpgradeService) loadVersion(isLatest bool, currentVersion, mode string) string {
	path := fmt.Sprintf("%s/%s/latest", global.RepoURL(), mode)
	if !isLatest {
		path = fmt.Sprintf("%s/%s/latest.current", global.RepoURL(), mode)
	}
	_, latestVersionRes, err := req_helper.HandleRequestWithProxy(path, http.MethodGet, constant.TimeOut20s)
	if err != nil {
		global.LOG.Errorf("load latest version from oss failed, err: %v", err)
		return ""
	}
	version := string(latestVersionRes)
	if strings.Contains(version, "<") {
		global.LOG.Errorf("load latest version from oss failed, err: %v", version)
		return ""
	}
	if isLatest {
		return u.checkVersion(version, currentVersion)
	}

	versionMap := make(map[string]string)
	if err := json.Unmarshal(latestVersionRes, &versionMap); err != nil {
		global.LOG.Errorf("load latest version from oss failed (error unmarshal), err: %v", err)
		return ""
	}

	versionPart := strings.Split(currentVersion, ".")
	if len(versionPart) < 3 {
		global.LOG.Errorf("current version is error format: %s", currentVersion)
		return ""
	}
	num, _ := strconv.Atoi(versionPart[1])
	if num >= 10 {
		if version, ok := versionMap[currentVersion[0:5]]; ok {
			return u.checkVersion(version, currentVersion)
		}
		return ""
	}
	if version, ok := versionMap[currentVersion[0:4]]; ok {
		return u.checkVersion(version, currentVersion)
	}
	return ""
}

func (u *UpgradeService) checkVersion(v2, v1 string) string {
	addSuffix := false
	if !strings.Contains(v1, "-") {
		v1 = v1 + "-lts"
	}
	if !strings.Contains(v2, "-") {
		addSuffix = true
		v2 = v2 + "-lts"
	}
	if common.ComparePanelVersion(v2, v1) {
		if addSuffix {
			return strings.TrimSuffix(v2, "-lts")
		}
		return v2
	}
	return ""
}

func (u *UpgradeService) loadReleaseNotes(path string) (string, error) {
	_, releaseNotes, err := req_helper.HandleRequestWithProxy(path, http.MethodGet, constant.TimeOut20s)
	if err != nil {
		return "", err
	}
	return string(releaseNotes), nil
}

func loadArch() (string, error) {
	std, err := cmd.NewCommandMgr().RunWithStdout("uname", "-a")
	if err != nil {
		return "", fmt.Errorf("std: %s, err: %s", std, err.Error())
	}
	if strings.Contains(std, "x86_64") {
		return "amd64", nil
	}
	if strings.Contains(std, "arm64") || strings.Contains(std, "aarch64") {
		return "arm64", nil
	}
	if strings.Contains(std, "armv7l") {
		return "armv7", nil
	}
	if strings.Contains(std, "ppc64le") {
		return "ppc64le", nil
	}
	if strings.Contains(std, "s390x") {
		return "s390x", nil
	}
	if strings.Contains(std, "riscv64") {
		return "riscv64", nil
	}
	return "", fmt.Errorf("unsupported such arch: %s", std)
}

func dropBackupCopies() {
	backupCopies, _ := settingRepo.GetValueByKey("UpgradeBackupCopies")
	if err := upgradeUtil.DropBackupCopies(global.CONF.Base.InstallDir, backupCopies); err != nil {
		global.LOG.Errorf("read upgrade dir failed, err: %v", err)
	}
}
