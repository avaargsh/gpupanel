# GPUPanel 当前工程状态

> 更新：2026-10-17；本轮合并以远端 `main @ 79be44b85e80` 为基线。**这是唯一默认状态入口**，变更后须核对最新 SHA/Actions/实际二进制再更新。本页不宣称后续提交自动通过旧验收。

## 产品与发布：M0 NO-GO

现行源码为 React 19 + shadcn/ui + Tailwind / Go Core + Agent，可用的本地 Host、Terminal、Docker、App Store 与安装回执继续开发。功能存在不等于当前 HEAD 的生产发布已被证明。

| Gate | 已有局部证据 | 当前完整发布状态 |
| --- | --- | --- |
| G0–G2 源码/前端/预览 | 固定源码的 CI/构建/预览 | SOURCE PASS（需按候选重新验证） |
| G3 安装/升级/回滚 | Ubuntu 24.04 VM 新装、26.04 实验宿主新装；不同旧版本 | **PARTIAL / NO-GO**，升级/回滚未完整接受 |
| G4 登录/Host | 固定旧版本的登录、Core→Agent→Terminal、部分否定授权 | **PARTIAL / NO-GO**，当前候选完整矩阵未验 |
| G5 Docker/App | 真 Docker canary 与部分 AppInstall/UNKNOWN 证据 | **PARTIAL / NO-GO**，完整 App/Compose 生命周期未验 |
| G6 恢复 | 受限的重启/数据保留与恢复子场景 | **PARTIAL / NO-GO**，中断升级与独立恢复未验 |

不能把不同 SHA、VM、真实宿主及模拟浏览器的多个 PASS 拼成一个 M0 PASS。

## 历史证据（精确基线，非当前 HEAD）

- [Ubuntu 24.04 VM](evidence/2026-10-16/local-install/RESULTS.md)：源码指纹 `6f8f3fd7...`，当时尚无本地初始提交，不代表本轮 main。
- [Ubuntu 26.04 实验宿主](evidence/2026-10-16/host-install/RESULTS.md)：安装版本 `7599fd56...`；只对该版本的登录/Terminal/Docker 观测有效。
- [主机受控操作](evidence/2026-10-16/host-operations/RESULTS.md)：安装版本 `8400884a...`；真实已登录浏览器→Core→Agent 在该子场景未运行。
- [Intel](evidence/2026-10-16/intel-gpu/RESULTS.md)、[GeoIP](evidence/2026-10-16/geoip/RESULTS.md)、[vNext Shell](evidence/2026-10-16/vnext-shell/RESULTS.md) 都是独立固定版本证据。
- 最近已合并的 [#92](https://github.com/avaargsh/gpupanel/pull/92)、[#96](https://github.com/avaargsh/gpupanel/pull/96)、[#98](https://github.com/avaargsh/gpupanel/pull/98) 的 CI 是对应 HEAD 的测试，不等于重新完成真实宿主验收。

## 许可证边界

继承自 1Panel 的组合工作仍受 **GPL-3.0** 及 `NOTICE.md` 原有归因要求约束；只有 [六个独立审计脚本/测试](gpupanel/APACHE_FILE_SCOPE.md) 有明确的文件级 Apache-2.0。整体 Apache-only **BLOCKED**。删除旧文档、改名或 AI 改写不能清除其余派生代码的许可义务。

这轮删除 `.skills/semi-ui-skills/` 旧前端代理指导及不带当前提交验收的旧远程源码整合资料。**仅删除四个不参与 Linux 构建的 Darwin/Windows 日志平台文件，其他继承 GPL 运行时仍保留。** 文件移除不代表 Apache 重新许可。 旧 Catalog 禁用门槛、API 兼容锁、Host/备份/已安装应用仍需调用方/构建产物/数据库迁移及回滚证据。见 [许可现状](gpupanel/APACHE_MIGRATION_PROGRESS.md)。

## 当前增量：本地项目发现（源码阶段）

增加 `scripts/gpupanel-project-inventory.py list [--json]`：只读识别现有 uv/Catalog 用户项目，区分 VERIFIED/INSTALLED、MODIFIED/DRIFT 和 CONFLICT；**仍没有 Web/API 持久 Project Registry 或 Session 控制面**。真实 Ubuntu 用户执行与单版本 G3–G6 仍待验证，不能将 CLI 回执扫描当作已完成持久化工作台。

## 证据与下一步

历史摘要保留 exact SHA 和 PASS/FAIL/NOT RUN；只维护本页“当前状态”。同主题新证据替换旧摘要，旧附件靠 Git history / Actions 恢复，不改写历史、不删除运行数据或系统备份。下一优先级：Project→持久 Workspace→Session、AppInstall UNKNOWN 受控恢复、Ubuntu 24.04 一致版本 G3–G6 验收。

## 本轮合并范围

| 项目 | 接收状态 |
| --- | --- |
| Host metrics、operation | 独立功能审查通过；仅模块内候选，未接运行路由；operation 变更用途仍受 D1/D2 门槛限制 |
| requestguard | `b92b5fbd9d56` 独立复审 ACCEPT；认证/CSRF 为注入接口，真实登录等价性未证明 |
| Core 本地 token | `83160c916923` 独立安全审查 ACCEPT；现有 daily token 协议不变，重放与文件加固仍为债务 |
| 源码门禁 | `e689facdc406` 已接收；限制新增源码 500 行，补 backend race/vet CI |
| 文档/证据 | 删除重复契约和回执、压缩过程叙述；保留来源、关键指纹与恢复依据 |
| hostdiagnosis | `073925202b9a` 复审 REQUEST_CHANGES，Phase/Outcome 长度校验未闭合；不合入，保留分支 |
| MySQL argv 凭据 | 未提交整改保留，未验收、不合入 |

本次只合并已接受源码。API 路由、存储模式和运行服务不切换；全产物许可核权、
真实认证接线、7 库迁移和同版本 VM 门槛仍未完成。合并验收的命令与精确 SHA 见本次交接，
旧测试不自动覆盖新提交。接口与迁移表见 [Core/Agent 重写契约](engineering/CORE_AGENT_REWRITE.md)。


## 当前增量：Core Project / Workspace 元数据注册（源码阶段）

新增经 Core **真实 Session/CSRF** 保护的 `GET/POST /api/v1/core/projects`，
项目条目及默认 Workspace 一次事务写入现有 `core.db`，支持 SQLite
关闭重启后恢复、用户作用域限制、重复注册冲突、输入约束与回滚回归。
此入口当前只允许本机超级管理员 Session，拒绝 API Token、LOCAL_REQUEST
和伪造身份头。只存储 `Registered` Project 和 `NotProvisioned` Workspace
元数据，用户提交的 `sourceHint` **不代表项目目录已被验证**。
不扫描项目路径、不写文件、不创建 Notebook/容器，也没有可运行 Session。
`gpupanel-project-inventory.py` 的真实用户目录只读发现仍是另一个独立入口；
后续要做受身份授权的安全导入/验证，不得凭自报 `sourceHint` 认领目录。

迁移为附加表，不更改旧表。需要在真实 Ubuntu 升级/回滚场景下进行 G3–G6
单版本验收；新 API 的源码/CI 不构成发布许可。

## 前端集成：项目登记工作台（增量）

新增 `/projects` 页面和导航入口，直接复用现有 RTK Query/Core `/api/v1/core/projects`
的 Cookie/CSRF 认证。用户可以登记、刷新、只读查看 Project/默认 Workspace 的
持久元数据；首页“最近项目”改为展示真实查询结果。错误与重新认证期间不展示
缓存条目；创建返回未知时不自动重试写入。所有状态仍严格标识 `NotProvisioned`，
**不提供伪造的 Notebook、目录、容器或 GPU 启动按钮**。本切片需要前端构建、
合约测试和模拟浏览器 CI，真实登录到 Core 并升级数据的单版本 E2E 仍待验。

## Project 详情回读切片（当前增量）

Core 新增 `GET /api/v1/core/projects/:id`，仅接受真实 Session 超级管理员身份。
按 owner + UUID 精确读取持久元数据；不合法 UUID、未找到、跨 owner 均为同一
`ProjectNotFound` 404，不泄漏其他用户资源。前端 `/projects/:id` 可从列表进入、
链接直达及手动刷新；认证失败/加载期间隐藏旧缓存，继续明确
`NotProvisioned` 不代表已部署 Notebook、GPU 或 Session。
新增测试覆盖 SQLite 关闭重开、owner 隔离、HTTP 匿名拒绝和前端 UUID 合约。
该切片不增加 Host 文件/容器的写入授权，M0 G3–G6 仍为 NO-GO。

## Workspace 准备请求（元数据阶段）

新增 GET `/api/v1/core/projects/:id/workspaces/:workspaceId/provision-plan`
和显式 POST `/.../provision-intent`。复用 Core 真实 Session/CSRF，
在服务端核验 owner + project + workspace，固定 `uv-python-stdlib-offline-v1`
离线模板及 SHA256 digest。提交后只在独立 SQLite 表持久保存
`AwaitingHostBinding`，相同 digest 重放返回相同 ID；状态回读可用于
未知提交结果对账。Workspace 仍为 `NotProvisioned`，尚未接入普通用户
Host 执行器，**不会调用 uv、写项目目录、启动容器或 GPU**。提交意图
不代表计划可执行，也不代表资源配额、磁盘路径和宿主身份已经审核。
UI 明示阻断原因与操作未知状态；M0 G3–G6 仍为 NO-GO。

## 本地非 root uv 执行器（手动预发布切片）

新增 `scripts/gpupanel-uv-intent-runner.py`：只能由普通 Ubuntu
用户在其真实 Home 中手工运行，读取已存在的 Workspace
`AwaitingHostBinding` 计划 JSON，核对固定服务端 digest 和
离线 uv 本地预览 digest，双摘要显式确认后调用成熟
`gpupanel-uv-project.py`。写入目标严格固定为
`~/GPUPanel/projects/workspace-<UUID>`；禁止自定义目标、
root/suid、目录链接、覆盖已存在项目和下载网络依赖。
真实生成后独立校验 uv 回执，输出
`LOCAL_UV_VERIFIED_NOT_CORE_PROVISIONED`；并**不**更新 Core
或授权远程 Agent。JSON 文件可伪造，必须依赖本机用户交互审批，
不能当成远程执行凭据。详情见
[本机安全手工交接](gpupanel/WORKSPACE_LOCAL_RUNNER.md)。
这不代表持久 Session / GPU 资源调度已实现，M0 G3–G6 NO-GO。
