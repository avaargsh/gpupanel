# Core/Agent 重写契约与数据迁移所有权

日期：2026-10-17。冻结基线 `6b6ff2810b55db4f976291170014e85380563623`。状态：**只读盘点与契约冻结，未实现、未接线、未迁移、未删除**。
本文件只记录本轮结论；治理告警、PID/测试经过与门禁全量状态一律见唯一的
[治理状态](GOVERNANCE_STATUS.md)，此处不复述。工程规则见 [AGENTS](../../AGENTS.md)。

## 1. 实际树：3 模块现状与已接收 backend 包

| 模块（`go.mod` 实测） | 路由挂载 | 状态 |
| --- | --- | --- |
| `github.com/avaargsh/GPUPanel/core` | `/api/v1/core`（`core/init/router/router.go:102`），非 `/api/v1/core` 前缀经 `core/middleware/helper.go:9` 代理到 agent | 活跃，GPL 继承源，唯一认证/授权权威 |
| `github.com/avaargsh/GPUPanel/agent` | `/api/v1`（`agent/init/router/router.go`），非 master 加 `Certificate()` | 活跃，GPL 继承源，主机执行方 |
| `github.com/avaargsh/GPUPanel/backend` | **无路由、无 main、无 server** | **候选，不是已生效的替换**；仅库包 |

`backend/` 实际包含：`internal/hostobserve`（OS/内存/uptime，逐源 Status）、
`internal/hostmetrics`（load/PSI）、`internal/operation`（状态机，D1/D2 未落地前
**禁止**接执行器，见 [DECISIONS](../../backend/internal/operation/DECISIONS.md)）。
三个包均为只读/库级；**没有**通用注册表、执行器、额外 provider 或微服务。

前端实测（`frontend/apps/panel/src`）：认证 `api/authApi.ts`（`/core/auth/login`、`mfalogin`、`setting`、`captcha`、`logout`、`current`、`api/generate`），
守卫 `routes/ProtectedRoute.tsx`（服务端会话校验失败即拒绝挂载特权视图），
Host 视图 `routes/index.tsx` `/host` + `pages/host`，数据面 `api/hostApi.ts`
（`/hosts/search|info|update|del|test/*|monitor/*|terminal/sessions/*`）与 `hostOperationsApi.ts`。

契约清单与漂移：`docs/gpupanel/BACKEND_CONTRACT_INVENTORY.md`（基线 `e133f405`，1022 源文件）。
本轮在冻结基线重跑只读审计 `python3 scripts/gpupanel-backend-contract-audit.py --repo . --output <tmp>`：
Go 路由 800（798 concrete/1 dynamic/1 unknown）、前端声明 326（302/20/4）、
登录前锚点 10/10、持久化锚点 99、发布耦合 30 —— **与清单逐项相同**；
`git diff e133f405..HEAD -- core/router agent/router core/init/router agent/init/router core/middleware agent/middleware` 为空。
**结论：路由与契约锚点零漂移**（指上述计数与路由/中间件目录 diff 为空），差异仅为源文件数 1022 → 1070（范围见冻结基线，非当前运行证据）。
正则静态扫描不等于运行时路由解析，dynamic/unknown 两项仍未解析；§5 的 `core.db` 打开方式单列修正。

## 2. 模块命名与未来替换命名空间决定

- 活跃模块名固定为上表三个路径；**不新增**并行命名空间、不改 `go.mod`、不加依赖（backend 仅标准库）。
- **决定**：`.../backend` 保持现有名作为候选实现命名空间；只有下节完整工作流的等价与否定测试全部通过后，
  才由后续 runtime composition 切片把 `backend` 提升为替换实现。**本轮不宣布替换生效**。
- 禁止 `backend` 导入 `core`/`agent`，禁止 vendor 复制；仅只读查看外部可见 DTO/路由/格式契约。
- 未来替换**不**发明兼容 API 别名：`/api/v1` 与 `{code,message,data}` 信封保持原样。

## 3. 冻结的最小首个完整工作流：login → 已授权 Host 诊断

1. 浏览器 → Core 会话/CSRF/资源校验 → 诊断应用服务 → 固定路径采集 → 字段白名单视图
   （[只读诊断设计](OPERATIONS_HOLMES_DESIGN.md)）；诊断结果**不**授予变更权限。
2. 必须逐项保持等价并配**显式拒绝测试**：Cookie 会话、CSRF 头/豁免、RSA 公钥密码、
   Captcha、MFA、安全入口 entrance、API Key、终端 WebSocket Origin、密码过期。
   锚点清单沿用 `BACKEND_CONTRACT_INVENTORY` §3 的 10 项 `evidence-found`，
   但**行为等价尚未证明**：匿名 401、错误口令、过期/伪造 CSRF、错误 entrance、
   MFA 会话过期、RSA cookie 缺失、WS 跨源拒绝、API Key 越权均需真实否定用例。
3. 现有会话实现观察于 `core/init/session/psession/psession.go`（`PSession`/`sessionItem`）；
   是否跨重启持久**未验证**（本轮未打开任何运行库/DB/服务）。

## 4. 路径级所有权（本轮不越界）

| 路径 | 所有者 | 状态 |
| --- | --- | --- |
| `docs/engineering/CORE_AGENT_REWRITE.md` | 本工作树 `rewrite/core-data-contract-20261017` | 本轮唯一文档交付 |
| `backend/internal/hostdiagnosis/` | `rewrite/agent-diagnosis-20261017` | 提交候选 `d3692d374161`，**未验收、未接线** |
| `backend/internal/requestguard/` | `rewrite/core-boundary-20261017` | 提交候选 `879d54294391`，**未验收、未接线** |
| runtime composition / 数据迁移 / 发射打包 | 无归属，**后置** | 等价测试通过后才立项 |
| `.local/handoff.json` | 本工作树 | 回执，非状态文档 |

## 5. SQLite 存储、所有者、迁移与回滚阻塞点（源码实测，**未打开真实库**）

目录实测同源：`core` 用 `<InstallDir>/gpupanel/db`（`core/init/db/db.go:11-14`），
`agent` 用 `<baseDir>/gpupanel/db`（`agent/init/dir/dir.go:17` + `agent/init/db/db.go:12-17,20`）。
驱动 `modernc.org/sqlite v1.48.2`；迁移工具为 GORMigrate + 68 处 AutoMigrate，**无任何 Bun 迁移工具**。
`core.db` 打开方式（**仅指该处措辞，与 §1 的锚点漂移统计无关**）：清单 §4 记为 agent "只读打开"；
源码读数为读写——条件分支 `agent/init/db/db.go:19-20` 调用
`agent/utils/common/sqlite.go:15` `LoadDBConnByPath` → `:31` `GetDBWithPath` → `:47`
`os.OpenFile(dbPath, O_CREATE|O_RDWR, 0600)`；core 侧同构（`core/utils/common/sqlite.go:15,31,39`）。
这是**源码级读数，不是运行期证明**（未打开任何库）；运行时角色/锁语义仍未验证。

| 存储 | 打开方 | 数据类别（实测模型） | 迁移所有者 | 回滚/迁移阻塞点 |
| --- | --- | --- | --- | --- |
| `core.db` | core 读写；agent 存在时亦读写打开（`agent/init/db/db.go:19-20`） | 身份/设置/审计：Setting、LoginLog、OperationLog、BackupAccount、Group、Command、UpgradeLog、ScriptLibrary、初始用户名口令与 EncryptKey | `core/init/migration/migrate.go:11,19`（gormigrate）+ `migrations/init.go` AutoMigrate | 双进程可写打开；实际写入责任需逐表核对；密码哈希/EncryptKey/入口配置不可假定直接沿用；需一次性 VM 前向+回滚证据 |
| `task.db` | core（`AddTaskDB`）+ agent（`:121`） | 任务记录、主机操作回执 `HostOperations` | **两个** gormigrate 序列（`migrations/init.go:344`；`agent/.../migrate.go:121`） | 两套迁移入口；实际写入责任需核对，回执不可重新生成，须先定顺序与归属 |
| `agent.db` | core（`AgentDB`，本轮未见 core 侧迁移）+ agent（`:19`） | 应用安装、网站、数据库、容器、主机、定时任务、收藏等（`agent/.../init.go:37` 长列表） | agent `migrate.go:19`（`agentDBMigrations`） | 表多、关联密；模型源位于 GPL 模块内**不可复制**；core 打开用途未核实 |
| `alert.db` | core（`AlertDB`）+ agent（`InitAlertDB` `:131`） | 告警配置/日志/任务/审计用户 | agent `migrate.go:138-148`（gormigrate `:141`）与 core `migrations/init.go:1244` | 同一文件两套迁移序列，必须先合并所有权 |
| `monitor.db` | agent | 主机监控样本（`MonitorDB`） | 仅 AutoMigrate（`agent/.../init.go:93`） | 无版本历史；样本量与保留策略未知 |
| `gpu_monitor.db` | agent | GPU 监控样本 | 仅 AutoMigrate | 同上 |
| `vllm_monitor.db` | agent | vLLM 指标样本 | 仅 AutoMigrate（含集成测试） | 同上 |

**结论：数据迁移不能只迁"用户库"**；7 个存储全部有独立所有者，其中 4 个被两个进程同时打开。

## 6. 跨模块接口、DTO 与结果/回放边界

- 每层显式转换：请求 DTO → 领域命令 → 存储记录 → 视图 DTO；禁止跨层共享可变结构。
  `requestguard` 只产出不可变 `Principal`，`hostdiagnosis` 只产出字段白名单视图，均**不**落地路由。
- 结果维度按设计冻结：阶段（accepted/executed/observed）与结果（success/unknown/denied/unavailable/error）分列，
  "受理"不等于执行成功；逐源缺失/不可用/畸形独立上报，不填零、不序列化原始错误与路径。
- 持久回放边界（[DECISIONS](../../backend/internal/operation/DECISIONS.md)）：无外部持久结果知识**拒绝**重执行（D1）；
  回收所有者是认证生命周期，按 principal 分域（D2）；`IndependentlyVerified` 不是成功或回放门（D3）；
  `unknown` 在观测窗口内禁止回放（D5）。这些边界属未来集成切片，不属本轮库包。

## 7. 单独活跃工作树（**本轮未交付**）

- Core 本地 token：`governance/local-token-auth-20261016`（`83160c916923`）修复中，非空 token 认证豁免问题。
- MySQL 凭据 argv：`governance/mysql-secret-argv-20261016`（`e78777a32ea6`）修复中，备份/恢复命令行含密码。
  二者均为独立所有权与基线，不在本文件验收范围，也未合入本工作树。

## 8. 旧 core/agent 删除判据（**现在不删除**）

五项全部满足才可提删除，且删除须单独提案：① 等价认证/授权与 Host 诊断否定测试全绿（§3 十锚点）；
② 前端已声明 concrete 路由在 backend 全部实际拥有且 `/api/v1` 与信封不变；
③ 7 个 SQLite 存储在一次性 Ubuntu 24.04 VM 完成前向迁移与回滚/恢复证据；
④ 打包引用同步替换：`scripts/gpupanel-release.py:31,64,96,105`（`bin/gpupanel-core`/`bin/gpupanel-agent`/Core Web embed）、
`Makefile:15,21,25`（`WEB_ROOT`/`CORE_NAME`/`AGENT_NAME`）；
⑤ 来源与许可：新原创源文件级 Apache-2.0、根 GPL/`NOTICE.md` 不变、core/agent 归属核权结案 + 真实 VM 门禁
（preflight/backup/装后首登/权限拒绝/Docker+应用生命周期/中断升级恢复）。

## 9. 下一步（最小实现顺序）

1. **权威会话提供者**（backend 自有、注入式、无本地 token/自报角色捷径）+ **实际 API 路由所有权**，
   逐条等价与否定测试对照 §3 十锚点。
2. 其后才做 **持久化迁移**（§5 表，逐库前向/回滚证据）。本轮不并入。

## 10. 命令与限制

- 已执行：只读契约审计（退出 0，两次输出字节一致，JSON 摘要见 §1）、`git diff --shortstat`（退出 0）。
- **NOT RUN**：`cd backend && go test -race -count=1 ./...`、`go vet ./...`（纯文档改动，Go 门禁不构成本文档的 PASS 依据）。
- 限制：未复制任何外部源码；未打开真实数据库/容器/服务；未部署、未合并、未删除遗留模块或数据。
  权利限制：文件级 Apache 仅适用本轮新原创源，core/agent 作者权与上游归属仍开放。
- 回退：仅回退本轮文档提交，运行状态、凭据、备份与未提交工作一律不动。
