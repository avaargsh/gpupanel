package v1

import (
	"errors"
	"fmt"
	"strings"

	"github.com/avaargsh/GPUPanel/core/app/api/v1/helper"
	"github.com/avaargsh/GPUPanel/core/app/dto"
	"github.com/avaargsh/GPUPanel/core/app/lifecycle"
	"github.com/avaargsh/GPUPanel/core/init/session/psession"
	"github.com/gin-gonic/gin"
)

// @Tags System Setting
// @Summary Load upgrade info
// @Success 200 {object} dto.UpgradeInfo
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /core/settings/upgrade [get]
func (b *BaseApi) GetUpgradeInfo(c *gin.Context) {
	info, err := upgradeService.SearchUpgrade()
	if err != nil {
		helper.InternalServer(c, err)
		return
	}
	helper.SuccessWithData(c, info)
}

// @Tags System Setting
// @Summary Load upgrade notes
// @Success 200 {array} dto.ReleasesNotes
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /core/settings/upgrade/releases [get]
func (b *BaseApi) LoadRelease(c *gin.Context) {
	notes, err := upgradeService.LoadRelease()
	if err != nil {
		helper.InternalServer(c, err)
		return
	}
	helper.SuccessWithData(c, notes)
}

// @Tags System Setting
// @Summary Load release notes by version
// @Accept json
// @Param request body dto.Upgrade true "request"
// @Success 200 {string} notes
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /core/settings/upgrade/notes [post]
func (b *BaseApi) GetNotesByVersion(c *gin.Context) {
	var req dto.Upgrade
	if err := helper.CheckBindAndValidate(&req, c); err != nil {
		return
	}

	notes, err := upgradeService.LoadNotes(req)
	if err != nil {
		helper.InternalServer(c, err)
		return
	}
	helper.SuccessWithData(c, notes)
}

func lifecycleOperationOwner(c *gin.Context) (string, error) {
	if c.GetBool("API_AUTH") {
		switch c.GetString("API_AUTH_KEY_KIND") {
		case "apiKey":
			keyID := c.GetString("API_AUTH_KEY_ID")
			if keyID == "" {
				return "", errors.New("verified API key identity missing")
			}
			return "api-key:" + keyID, nil
		case "legacy":
			ownerType := c.GetString("API_AUTH_OWNER_TYPE")
			ownerID := c.GetString("API_AUTH_OWNER_ID")
			if ownerType == "" || ownerID == "" {
				return "", errors.New("legacy API credential has no verified owner binding")
			}
			return "legacy-api:" + ownerType + ":" + ownerID, nil
		default:
			return "", errors.New("API credential kind cannot own a lifecycle operation")
		}
	}
	raw, ok := c.Get(psession.GinContextSessionUserKey)
	if !ok {
		return "", errors.New("authenticated session identity missing")
	}
	user, ok := raw.(psession.SessionUser)
	if !ok || user.ID == "" {
		return "", errors.New("authenticated session identity invalid")
	}
	return "session-user:" + user.ID, nil
}

func lifecycleOperationInfo(op lifecycle.Operation, replayed bool) dto.LifecycleOperationInfo {
	return dto.LifecycleOperationInfo{
		OperationID: op.ID,
		Kind: string(op.Kind),
		State: string(op.State),
		Revision: op.Revision,
		Stage: op.Stage,
		ErrorCode: op.ErrorCode,
		ArtifactSHA256: op.ArtifactSHA256,
		EvidenceSHA256: op.EvidenceSHA256,
		CreatedAt: op.CreatedAt,
		UpdatedAt: op.UpdatedAt,
		Replayed: replayed,
	}
}

// @Tags System Setting
// @Summary Start an idempotent system upgrade operation
// @Accept json
// @Param Idempotency-Key header string true "Stable key for this requested upgrade"
// @Param request body dto.Upgrade true "request"
// @Success 200 {object} dto.LifecycleOperationInfo
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /core/settings/upgrade [post]
// @x-panel-log {"bodyKeys":["version"],"paramKeys":[],"BeforeFunctions":[],"formatZH":"更新系统 => [version]","formatEN":"upgrade system => [version]"}
func (b *BaseApi) Upgrade(c *gin.Context) {
	var req dto.Upgrade
	if err := helper.CheckBindAndValidate(&req, c); err != nil {
		return
	}
	owner, err := lifecycleOperationOwner(c)
	if err != nil {
		helper.BadAuth(c, "ErrNotLogin", err)
		return
	}
	idempotencyKey := strings.TrimSpace(c.GetHeader("Idempotency-Key"))
	if idempotencyKey == "" {
		helper.BadRequest(c, errors.New("Idempotency-Key header is required for system upgrades"))
		return
	}
	op, created, err := upgradeService.Upgrade(req, owner, idempotencyKey)
	if err != nil {
		if errors.Is(err, lifecycle.ErrBindingMismatch) {
			helper.ErrorWithDetail(c, 409, "ErrRecordExist", err)
			return
		}
		helper.InternalServer(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	helper.SuccessWithData(c, lifecycleOperationInfo(op, !created))
}

// @Tags System Setting
// @Summary Read a system upgrade operation owned by the authenticated principal
// @Success 200 {object} dto.LifecycleOperationInfo
// @Security ApiKeyAuth
// @Security Timestamp
// @Router /core/settings/upgrade/operations/{id} [get]
func (b *BaseApi) GetUpgradeOperation(c *gin.Context) {
	owner, err := lifecycleOperationOwner(c)
	if err != nil {
		helper.BadAuth(c, "ErrNotLogin", err)
		return
	}
	op, err := upgradeService.GetLifecycleOperation(owner, c.Param("id"))
	if err != nil {
		if errors.Is(err, lifecycle.ErrNotFound) {
			helper.ErrorWithDetail(c, 404, "ErrRecordNotFound", err)
			return
		}
		helper.InternalServer(c, fmt.Errorf("read lifecycle operation: %w", err))
		return
	}
	c.Header("Cache-Control", "no-store")
	helper.SuccessWithData(c, lifecycleOperationInfo(op, false))
}
