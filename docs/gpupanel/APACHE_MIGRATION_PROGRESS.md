# GPUPanel Apache 化迁移进度跟踪

**Legal state remains GPL-3.0.** 本文件仅记录迁移进度，不代表任何许可证变更。根 `LICENSE` 保持 GPL-3.0，`NOTICE.md` 保留 1Panel 归因，直到 L5 门控全部通过前，**不能声称整体 Apache-only 分发**。

## 门控状态（依据 LICENSE_MIGRATION.md）

| 门控 | 目标 | 状态 | 证据 |
|---|---|---|---|
| L0 | 保留真实许可和上游归因 | **PASS** | 文档检查：根 LICENSE GPL-3.0，NOTICE.md 保留 1Panel 信用和基线 |
| L1 | 建立文件级 provenance inventory | **IN PROGRESS** | `scripts/gpupanel-license-audit.py` 已就绪，inventory JSON 已生成（见下文） |
| L2 | 引入明确拥有权的独立组件 | **IN PROGRESS** | `backend/` host-observer 已集成（4 Python 脚本已为文件级 Apache-2.0） |
| L3 | 从 Apache 分发中移除继承的 GPL 实现 | **IN PROGRESS (pilot)** | 886 个 inherited 文件仍为 GPL；试点：移除 core/logs.go 远程 shell 执行 |
| L4 | 扫描实际发布产物 | **NOT STARTED** | 无发布产物扫描证据 |
| L5 | 变更发布级许可证声明 | **BLOCKED** | 需先通过 L1-L4 |

## L1: Provenance Inventory（当前阶段）

### Inventory 统计（基于 HEAD 扫描，基线 1Panel dev-v2 `d9dc5d7a...`）

| 来源类别 | 数量 | 审查标签 | 说明 |
|---|---|---|---|
| INHERITED_MODIFIED | 573 | KEEP_GPL | 同一路径，文件 blob/mode/类型已变更，仍为 GPL 派生 |
| INHERITED_UNCHANGED | 313 | KEEP_GPL | 同一路径，与上游基线相同，仍为 GPL |
| NEW_PATH_UNVERIFIED | 601 | UNKNOWN_BLOCK | 路径不在上游，无精确 blob 匹配，需逐个审查 |
| **总计** | **1,487** | | |

按目录分布：
- `agent/`: 756 文件
- `core/`: 240 文件
- `frontend/`: 235 文件
- `docs/`: 88 文件
- `scripts/`: 82 文件
- `backend/`: 11 文件（host-observer，独立实现）

### Inventory 产物

- `docs/gpupanel/LICENSE_INVENTORY.json`：完整的文件级 provenance 清单（read-only 生成，不改动工作区）
- `scripts/gpupanel-license-audit.py`：确定性 inventory 生成器（已通过测试）
- `scripts/tests/test_gpupanel_license_audit.py`：8 项测试全部通过

### 运行命令

```bash
python3 scripts/gpupanel-license-audit.py --verify-gpl --output license-inventory.json
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_license_audit.py' -v
```

## L2: 独立组件（已启动）

### 已完成

| 组件 | 路径 | 许可 | 说明 |
|---|---|---|---|
| License audit 工具 | `scripts/gpupanel-license-audit.py` + 测试 | Apache-2.0（文件级） | 4 个 Python 脚本，已有 SPDX 头部 |
| Dependency audit 工具 | `scripts/gpupanel-dependency-audit.py` + 测试 | Apache-2.0（文件级） | 同上 |
| Host observer | `backend/internal/hostobserve/` | 独立实现，无 SPDX 头部（待 L2 审查） | 只读 OS/内存/uptime，Go 标准库，无 shell/网络/环境变量 |

### backend/ 现有文件（11 个）

`backend/go.mod`（module `github.com/avaargsh/GPUPanel/backend`，Go 1.26.6，stdlib only）+
`backend/internal/hostobserve/`（10 个文件：snapshot, collector, osrelease, meminfo, uptime + 5 个测试）

### L2 审查要求（每个 Apache-2.0 文件）

根据 `APACHE_FILE_SCOPE.md`，每个拟声明 Apache-2.0 的文件需要：
1. 文档化所有权（谁创建的，何时创建的）
2. 依赖/组合边界（不引入 GPL 派生代码）
3. 审批人批准
4. 明确的 SPDX 头部 + 完整 Apache 许可文本
5. 更新测试范围
6. 焦点 PR

## L3: 替换继承的 GPL 代码（未启动）

### 继承代码分布（需要逐步替换）

核心模块中引用 1Panel 路径/概念的文件（非 exhaustive，需结合 inventory 逐个审查）：

**Core:**
- `core/cmd/server/cmd/root.go`、`restore.go` — 曾读取 `/usr/local/bin/pctl`（已在 namespace 迁移中移除）
- `core/init/viper/viper.go`、`init/hook/hook.go` — 曾读取 pctl 配置（已迁移）
- `core/init/migration/migrations/init.go` — 曾写入 pctl 密码（已迁移）
- `core/i18n/i18n.go` — 曾读取 pctl 语言（已迁移）
- `core/app/service/upgrade.go` — 曾复制/更新 pctl（已迁移）
- `core/cmd/server/docs/docs.go`、`main.go` — 待审查
- `core/app/service/{setting,backup}.go` — 待审查
- `core/app/service/logs.go` — **L3 试点完成**：移除了 `writeLogs`/`runRemoteShellScript`（远程 shell 脚本下载执行），不再引用 `https://resource.fit2cloud.com/installation-log.sh`
- `core/app/auth/{api_auth,api_key}.go` — 待审查
- `core/global/global.go` — 资源 URL 引用 1panel.pro/fit2cloud.com（保留，非许可证问题）

**Agent:**
- `agent/init/viper/viper.go`、`init/hook/hook.go` — 曾调用 `xpack.MultiNodeProvider.LoadNodeInfo`（已迁移）
- `agent/init/migration/migrations/init.go` — 曾读取 pctl LANGUAGE/PANEL_EDITION（已迁移）
- `agent/app/service/{snapshot_create,snapshot_recover,snapshot_rollback}.go` — 曾复制 `/usr/local/bin/pctl`（已迁移）
- `agent/app/service/{app,container_compose,file,website_*,database_*,firewall_utils,...}` — 大量待审查
- `agent/app/api/v1/{app,terminal,...}` — 待审查
- `agent/global/global.go` — 资源 URL 引用（保留）
- `agent/utils/geo/database.go` — GeoIP 数据源 URL（保留）

### 替换原则（来自 AGENTS.md + LICENSE_MIGRation.md）

1. **新模块优先**：先独立实现新功能模块（如 `backend/`），再替换继承代码
2. **不破坏现有功能**：每个替换都需要 API/DB/宿主行为测试、安全门控、独立实现来源证据
3. **不删除版权声明**：不得移除 1Panel 版权标识以满足扫描器
4. **不等同品牌变更与许可证变更**：改名、移动目录、AI 重构、删除 Git 历史都不构成许可证变更证据
5. **纵切片替换**：每个替换必须是由真实用例驱动的完整纵切片，不做抽象前的全局重写

### 已完成的 namespace 迁移（减少对 1Panel 运行时的依赖，非许可证变更）

| 变更 | 文件 | 影响 |
|---|---|---|
| 移除 ctl_conf 依赖 | `core/init/viper/viper.go`、`core/init/hook/hook.go`、`core/cmd/server/cmd/root.go`、`core/cmd/server/cmd/restore.go`、`core/app/service/upgrade.go`、`core/i18n/i18n.go`、`core/init/migration/migrations/init.go` | 配置从嵌入 app.yaml，不再读写 `/usr/local/bin/pctl` |
| 删除 ctl_conf 包 | `core/utils/ctl_conf/`、`agent/utils/ctl_conf/` | 不再被任何代码导入 |
| 移除 LoadNodeInfo 依赖 | `agent/init/viper/viper.go`、`agent/init/hook/hook.go`、`agent/init/migration/migrations/init.go`、`agent/utils/xpack/helper/multi_node.go` | InstallDir/Version 从嵌入配置 |
| 移除 pctl 备份/恢复 | `agent/app/service/snapshot_create.go`、`snapshot_recover.go`、`snapshot_rollback.go` | 跳过 legacy pctl 二进制 |
| 移除根回收站路径 | `agent/init/dir/dir.go` | `RecycleBinDir` 从 `/.gpupanel_clash` 移至 install dir 下 |
| 移除远程 shell 执行 | `core/app/service/logs.go`、`core/app/service/upgrade.go` | 移除了 `writeLogs`/`runRemoteShellScript`（从 fit2cloud.com 下载并执行 shell 脚本），减少对 1Panel 资源的依赖和安全风险 |

注意：上述变更是**运行时命名空间隔离**，不是许可证变更。这些文件的版权归属未变，仍为 GPL 派生。

## 已知限制与边界

1. **不能声称 Apache-only 分发**：根 LICENSE 为 GPL-3.0，886 个 inherited 文件仍为 GPL，30 个 tracked 文件提及 GPL-3.0
2. **inventory 是审查输入，不是法律结论**：`NEW_PATH_UNVERIFIED` 不等于独立原创，`INHERITED_*` 不等于可以重新许可
3. **不自动下载上游基线**：缺失基线 fail-closed，需作为受评审的 checkout 一部分获取
4. **不修改任何运行状态**：inventory 为 read-only，不改动工作区、索引、分支或 Git 历史
5. **L5 门控未满足前不得变更根 LICENSE 或 README 许可证声明**

## 下一步计划

1. **L1 完成**：将 `docs/gpupanel/LICENSE_INVENTORY.json` 提交，作为可审查的 provenance 清单
2. **L2 扩展**：在 `backend/` 下添加更多独立实现模块（每个模块独立分支，独立审查）
3. **L3 试点**：选择一个核心模块（如配置读取、日志采集）进行独立重写，建立 API/DB/行为测试，替换继承实现
4. **L4 准备**：构建发布产物，扫描依赖/资产/SBOM，准备 license/NOTICE 完整性报告
5. **L5 准备**：在所有门控通过后，才在专门 PR 中变更根 LICENSE 和相关声明

## 回退

- 回退 = `revert` 对应提交，仅删除新增文件，不涉及运行状态、主机状态或数据
- `backend/` 模块回退不影响 `core/`、`agent/` 现有服务
- inventory JSON 为只读产物，删除无副作用
