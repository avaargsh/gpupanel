# 后端契约清单（API / 认证 / 数据锚点）

日期：2026-10-16。状态：**只读源码盘点结果，未迁移、未删除、未切换路由所有权**。
工具：`scripts/gpupanel-backend-contract-audit.py`（Python 3 标准库，确定性、只读、
不执行命令、不读取运行库/配置/凭据）。用法：

```bash
python3 scripts/gpupanel-backend-contract-audit.py --repo .            # JSON 到 stdout
python3 scripts/gpupanel-backend-contract-audit.py --repo . --output report.json
```

分类语义（JSON `legend`）：`concrete`=字面量完整路由；`pattern`=模板插值降级为
`*` 通配的**模式**，不是精确路由；`dynamic`=路径表达式非纯字面量，不声明具体路由；
`unknown`=接收者/挂载前缀/路径无法静态解析，保留 file/line/evidence 与原因。
正则解析不等于运行时路由解析；所有无法静态确定的项一律保持 dynamic/unknown。

## 1. 本次实际扫描（基线 e133f405，1022 个源文件）

| 区域 | 结果 |
| --- | --- |
| Go 路由（core/agent router + init/router） | 800 条：798 concrete、1 dynamic、1 unknown |
| 前端 API 声明（RTK Query/fetch/WebSocket） | 326 条：302 concrete、20 pattern、4 dynamic |
| 登录前契约锚点（blocker） | 10/10 evidence-found（仅表示源码锚点存在） |
| 持久化锚点 | 99 条：automigrate 68、db_connection 7、gormigrate 3、sqlite driver、db ownership |
| 发布耦合锚点 | 30 条（`scripts/gpupanel-release.py`、`Makefile`） |

非 concrete 的 Go 项（诚实保留，勿当作已解析）：

- `core/init/router/router.go:48` dynamic：`rootRouter.GET("/"+entrance, ...)` 安全入口
  动态路由；前缀经 `setWebStatic(PublicGroup)` 调用点解析为根，但路径含变量。
- `core/init/router/router.go:81` unknown：`swaggerRouter.Use(...).GET("/swagger/*any")`
  链式调用接收者未静态跟踪。

前端 4 条 dynamic 为 `fetch(变量)` / `new WebSocket(wsUrl)` 等非字面量端点；
20 条 pattern 为 `/websites/${id}`、`/databases/search${...}` 等模板串（含 query 内插值）。

## 2. 挂载与路由所有权（静态证据）

- Core：`core/init/router/router.go:102` `PrivateGroup := Router.Group("/api/v1/core")`，
  `core/router/*.go` 各 `InitRouter(Router *gin.RouterGroup)` 在此前缀下注册。
- Agent：`agent/init/router/router.go` `PrivateGroup := Router.Group("/api/v1")`，
  另有 `/api/v1/health/check`；非 master 时挂 `middleware.Certificate()`。
- Core 代理：`core/middleware/helper.go:9` `ShouldProxyToAgent`（`/api/v1` 且非
  `/api/v1/core` 前缀转发）；`core/init/router/proxy.go` 内含会话检查与终端路径
  特例（`/api/v1/hosts/terminal/{local,ssh,container}`，约 :112、:128）。
- 前端基址：`frontend/apps/panel/src/api/baseApi.ts` `baseUrl: '/api/v1'`、
  统一信封 `{code,message,data}`、`credentials: 'include'`、`X-CSRF-Token`。

## 3. 登录独立前必须复现的契约锚点（10 项，全部 evidence-found）

| 锚点 | 关键源码证据（file:line） |
| --- | --- |
| SessionAuth + Cookie 会话 | `core/router/ro_base.go:14`、`core/middleware/session.go`、`core/init/session/psession/`；前端 `credentials: 'include'` |
| RSA 公钥密码传输 | `core/middleware/password_rsa.go:9/11/19`（cookie `panel_public_key`，7 天，HttpOnly=false）；前端 `encryptPassword`/`ensurePasswordPublicKey`（authApi.ts） |
| Captcha | 路由 `core/router/ro_base.go:18` `/auth/captcha`；前端 `captchaID` |
| MFA | 路由 `core/router/ro_base.go:21` `/auth/mfalogin`、:27-29 mfa bind/close；`core/app/auth/auth.go:89` MFA 会话存储 |
| CSRF | `core/middleware/csrf_protect.go:14`；头名 `core/constant/session.go:7` `X-CSRF-Token`，cookie `pcsrftoken`；:45-51 起 login/mfalogin/passkey/oidc **豁免列表** |
| 安全入口 entrance | `core/app/auth/auth.go:24/41-45/65`；`SecurityEntrance` cookie（auth.go:191）；`EntranceCode` 请求头（前端 authApi） |
| 入口/CSRF Cookie | `SetCookie`（auth.go:191、password_rsa.go:19）；前端 `getCookie('pcsrftoken')` |
| API Key 认证 | `core/init/router/proxy.go:60` `API_AUTH`；`xpack.CoreAPIAuthMiddleware`（router.go:96） |
| PasswordExpired | `core/middleware/password_expired.go`；router.go:97 全局挂载 |
| WebSocket Origin Guard | `core/middleware/websocket_origin.go`；router.go:93；终端 WS：`agent/router/ro_host.go:92-94` |

`evidence-found` 仅说明静态锚点存在，**不证明**新后端行为等价。纵切片验收仍需：
匿名 401 信封、错误口令、过期/伪造 CSRF、错误 entrance、MFA 会话过期、RSA cookie
缺失、终端 WS 跨源拒绝、API Key 越权拒绝等行为测试。

## 4. 数据与迁移责任锚点

- Core 打开 4 库：`core/init/db/db.go:10-13` core/task/agent/alert（SQLite 文件库）。
- Agent 打开 6 库 + 条件 core：`agent/init/db/db.go:12-20` agent/task/monitor/
  gpu_monitor/vllm_monitor/alert，`core.db` 存在时只读打开。
- GORMigrate 迁移入口：`core/init/migration/migrate.go`（core 库迁移表，含 AddTaskDB）、
  `agent/init/migration/migrate.go:19/121/141`（agent/task/alert 三个迁移器）。
- AutoMigrate 68 处，集中在 `core/init/migration/migrations/init.go`、
  `agent/init/migration/migrations/init.go` 及各专项迁移文件。
- SQLite 驱动：`modernc.org/sqlite v1.48.2`（`agent/go.mod:227`，core 同源依赖链）。
- 结论：替换后端的数据迁移不能只迁用户表；任务、监控、告警、审计、应用安装记录
  均有独立 DB 所有者。密码哈希/加密凭据/会话不可假定直接沿用（见调研报告 §6.5）。

## 5. 前端消费覆盖与发布耦合

- 322 条可匹配前端声明**全部**匹配到 ≥1 条 concrete 后端路由（路径分段比较，
  模板 `*` 与 gin `:param`/`*catchall` 视为通配）。
- 后端 798 条 concrete 中 339 条被前端静态匹配；未匹配 459 条含 agent 内部
  （`/internal/*`）、参数化业务路由与当前前端未直接声明的 AI/网站路由。
  **未匹配不证明路由无使用者**，仅表示本次静态规则未建立对应关系。
- 32 组 method 不一致全部来自 `:param` 通配的同形匹配或前端未声明 method 的
  启发式比较，属规则噪声；真实不一致需逐条人工复核，不能按此清单断言。
- 发布耦合：`scripts/gpupanel-release.py:31` 硬编码 `bin/gpupanel-core`、
  `bin/gpupanel-agent` 与 Core Web embed（:64/:96/:105）；`Makefile:15/21/25`
  `WEB_ROOT`、`CORE_NAME`、`AGENT_NAME`。删除旧模块前必须同步替换（调研 §6.6）。

## 6. 工具边界（诚实声明）

- 纯正则源码扫描：Go 函数体、TS 注释与字符串内容可能产生启发式误报；
  未解析项保持 dynamic/unknown，不猜测。
- Go 路由前缀按**文件内变量名**解析；同文件变量冲突重定义会降级为 unknown。
- 前端匹配仅比较路径段，不证明请求体、鉴权语义一致。
- 不读取安装目录、运行数据库、用户配置或凭据；输出为排序稳定的 JSON，
  无时间戳，同一棵树两次运行字节一致（测试覆盖）。

## 7. 测试与验证（实际执行）

```text
python3 scripts/tests/test_gpupanel_backend_contract_audit.py -v
  -> Ran 10 tests ... OK（合成 fixture：具体/模板/拼接/未知路由、稳定输出、
     只读性、非法根目录、输出文件、导入面仅限标准库）
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py'
  -> Ran 243 tests ... OK
python3 scripts/gpupanel-backend-contract-audit.py --repo . --output <tmp>（两次）
  -> 字节一致（DETERMINISTIC）；summary 见第 1 节
python3 scripts/gpupanel-evidence-budget.py -> PASS（35 文件，373412/1048576 字节）
```

未运行：Go/前端构建（本任务不改 frontend/core/agent）、真实登录行为测试（需
运行环境，属后续纵切片）。回退：删除本文件与两个 owned 脚本即可，无运行状态改变。
