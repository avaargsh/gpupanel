# GPUPanel Apache 化：当前状态，不复用旧统计

2026-10-15 的 `1,487` 文件、`886` 继承文件计数与阶段性 L3 文字只是旧 inventory，不能代表本次集成后的 HEAD；原文可从 `main @ 33d6176a51dfb3dccdae1a688ebe645a4f6972d2` 查阅。最新状态见 [STATUS](../STATUS.md)，法律边界见 [LICENSE_MIGRATION](LICENSE_MIGRATION.md)。

| 门控 | 当前判定 |
| --- | --- |
| L0 | 根 `LICENSE` 保持 GPL-3.0；`NOTICE.md` 保留 1Panel 归因 |
| L1 | 部分源码/依赖 provenance 已有；完整分发包来源、权利未审核完 |
| L2 | 仅六个 [文件级 Apache](APACHE_FILE_SCOPE.md) 审计工具/测试 |
| L3 | **BLOCKED**，无继承 GPL 运行时代码删除放行 |
| L4 | 安装发行工件的全量 SBOM/NOTICE 仍未通过 |
| L5 | **BLOCKED**，不能发布 Apache-only GPUPanel |

## 删除与保留矩阵

| 对象 | 本轮决策 | 依据 |
| --- | --- | --- |
| `.skills/semi-ui-skills/` | 删除 | 已迁到 shadcn，旧文件仅为代理设计指引 |
| 2026-10-15 远程整合快照 | 当前树删除，Git 历史可恢复 | 旧工作树无可核对当前 commit 的测试证明 |
| `agent/app/service/legacy_catalog.go` | 保留 | 阻止远端 Catalog 被重新启用；已装 App 仍可能依赖数据 |
| `core/app/auth/api_key_legacy_lock.go` | 保留待审 | 认证锁与客户端兼容不能靠文件名推断无消费者 |
| Core/Agent Host、Docker、App、备份 | 保留 GPL | 是当前运行能力，删除须证明调用方、数据、外部合同与回滚 |
| 旧 Vue/Semi 应用源 | 已不在当前前端树 | 不能推导其余代码已经取得 Apache 许可 |

删除继承运行时前需要 Git/call-site、二进制/依赖、HTTP/DB 合同和负向恢复测试，再单独 PR；改名、删版权头和 AI 重写均不能当作重新许可。
