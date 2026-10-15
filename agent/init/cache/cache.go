package cache

import (
	"github.com/avaargsh/GPUPanel/agent/global"
	cachedb "github.com/avaargsh/GPUPanel/agent/init/cache/db"
)

func Init() {
	global.CACHE = cachedb.NewCacheDB()
}
