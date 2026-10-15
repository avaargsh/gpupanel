package service

import (
    "github.com/1Panel-dev/1Panel/agent/app/repo"
    "github.com/1Panel-dev/1Panel/agent/constant"
)

// legacyRemoteCatalogEnabled is an intentionally fixed product boundary.
// A runtime environment variable must not silently re-enable untrusted upstream
// catalog synchronization. Existing installation records remain untouched.
func LegacyRemoteCatalogEnabled() bool { return false }

 // IsRetiredRemoteAppDetail checks the persisted source of an app version
 // before an external API attempts to create a new installation. Existing
 // installed resources and internal restore paths are not deleted or mutated.
 func IsRetiredRemoteAppDetail(detailID uint) (bool, error) {
    detail, err := appDetailRepo.GetFirst(repo.WithByID(detailID))
    if err != nil { return false, err }
    app, err := appRepo.GetFirst(repo.WithByID(detail.AppId))
    if err != nil { return false, err }
    return app.Resource == constant.AppResourceRemote, nil
 }
