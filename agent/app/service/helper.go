package service

import (
	"context"

	"github.com/avaargsh/GPUPanel/agent/constant"
	"github.com/avaargsh/GPUPanel/agent/global"
	"gorm.io/gorm"
)

func getTxAndContext() (tx *gorm.DB, ctx context.Context) {
	tx = global.DB.Begin()
	ctx = context.WithValue(context.Background(), constant.DB, tx)
	return
}
