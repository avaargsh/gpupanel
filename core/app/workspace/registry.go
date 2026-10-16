package workspace

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	NotProvisioned = "NotProvisioned"
	Registered     = "Registered"
	maxProjects    = 100
)

var (
	ErrInvalidInput = errors.New("invalid project metadata")
	ErrConflict     = errors.New("project already registered")
	ErrLimit        = errors.New("project registry limit reached")
)

// Project contains durable control-plane metadata, NEVER authority to run
// arbitrary files, create containers, or use a Host. SourceHint is unverified.
type Project struct {
	ID         string      `gorm:"primaryKey;size:36" json:"id"`
	OwnerID    string      `gorm:"not null;uniqueIndex:idx_gpupanel_project_owner_name" json:"-"`
	Name       string      `gorm:"not null;uniqueIndex:idx_gpupanel_project_owner_name" json:"name"`
	SourceHint string      `gorm:"not null" json:"sourceHint"`
	State      string      `gorm:"not null" json:"state"`
	Workspaces []Workspace `gorm:"foreignKey:ProjectID;references:ID" json:"workspaces"`
	CreatedAt  int64       `gorm:"autoCreateTime:milli" json:"createdAt"`
	UpdatedAt  int64       `gorm:"autoUpdateTime:milli" json:"updatedAt"`
}

// Workspace is an unprovisioned durable record. It contains no host path,
// container identity, arbitrary command, credential, or storage mount.
type Workspace struct {
	ID        string `gorm:"primaryKey;size:36" json:"id"`
	ProjectID string `gorm:"not null;index" json:"projectId"`
	OwnerID   string `gorm:"not null;index" json:"-"`
	Name      string `gorm:"not null" json:"name"`
	State     string `gorm:"not null" json:"state"`
	CreatedAt int64  `gorm:"autoCreateTime:milli" json:"createdAt"`
	UpdatedAt int64  `gorm:"autoUpdateTime:milli" json:"updatedAt"`
}

type Registry struct{ db *gorm.DB }

func New(db *gorm.DB) *Registry { return &Registry{db: db} }

func validName(name string) bool {
	if !utf8.ValidString(name) || name == "" || name == "." || name == ".." ||
		utf8.RuneCountInString(name) > 80 || strings.ContainsAny(name, "/\\") {
		return false
	}
	for _, r := range name {
		if r < 32 || r == 127 {
			return false
		}
	}
	return true
}

func validOwner(owner string) bool {
	return owner != "" && len(owner) <= 128 && strings.TrimSpace(owner) == owner
}

// Create is an atomic metadata registration with an initial NOT provisioned
// workspace. Replays return Conflict; they never rewrite user workspace state.
func (r *Registry) Create(ctx context.Context, owner, name, source string) (Project, error) {
	name = strings.TrimSpace(name)
	if r == nil || r.db == nil {
		return Project{}, fmt.Errorf("registry database unavailable")
	}
	if !validOwner(owner) || !validName(name) ||
		(source != "manual" && source != "uv" && source != "catalog") {
		return Project{}, ErrInvalidInput
	}
	p := Project{
		ID: uuid.NewString(), OwnerID: owner, Name: name,
		SourceHint: source, State: Registered,
	}
	ws := Workspace{
		ID: uuid.NewString(), ProjectID: p.ID, OwnerID: owner,
		Name: "default", State: NotProvisioned,
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing int64
		if err := tx.Model(&Project{}).Where("owner_id = ? AND name = ?", owner, name).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing != 0 {
			return ErrConflict
		}
		if err := tx.Model(&Project{}).Where("owner_id = ?", owner).Count(&existing).Error; err != nil {
			return err
		}
		if existing >= maxProjects {
			return ErrLimit
		}
		if err := tx.Create(&p).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) ||
				strings.Contains(strings.ToLower(err.Error()), "unique constraint failed") {
				return ErrConflict
			}
			return err
		}
		return tx.Create(&ws).Error
	})
	if err != nil {
		return Project{}, err
	}
	p.Workspaces = []Workspace{ws}
	return p, nil
}

// List never returns another principal's projects, and the association query
// is owner-scoped independently of the parent lookup.
func (r *Registry) List(ctx context.Context, owner string) ([]Project, error) {
	if r == nil || r.db == nil {
		return nil, fmt.Errorf("registry database unavailable")
	}
	if !validOwner(owner) {
		return nil, ErrInvalidInput
	}
	items := make([]Project, 0)
	err := r.db.WithContext(ctx).Where("owner_id = ?", owner).
		Preload("Workspaces", "owner_id = ?", owner).
		Order("created_at DESC, id DESC").Limit(maxProjects).Find(&items).Error
	return items, err
}
