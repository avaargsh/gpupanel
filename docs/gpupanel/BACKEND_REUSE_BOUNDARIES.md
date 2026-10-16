# 后端替换的复用边界与逐项准入清单

日期：2026-10-16。任务：`reuse-boundaries`。状态：**只读源码复核 + 复用分类，未复制、未编译、未接线、未改任何外部仓库**。
本文是 [Apache 后端替换调研](APACHE_BACKEND_REPLACEMENT_RESEARCH.md) 的可执行化：给出候选模块的精确路径/行锚、分类（复用候选/仅设计参考/排除）、禁止 import 项与解除条件、首次提取清单、`core/`、`agent/` 完整移除前的延迟缺口。

**权利声明边界**：本文的"复用候选"仅表示“经逐项权利与依赖复核后可进入提取评估”，不构成法律许可结论。根 `LICENSE` 存在、`client/LICENSE` 为 Apache-2.0、作者身份或 GitHub 托管，**都不能单独证明本仓库可复制、再许可或分发对应源码**。本文不授予任何权利，也不声称已获得任何权利人授权。

## 0. 复核基线（本轮独立确认）

| 仓库 | 复核命令 | HEAD / 状态 |
| --- | --- | --- |
| GPUPanel（本 worktree） | `git rev-parse HEAD`、`git status --short` | `e133f405481e08cc7dd9130e1d87c20e49fbbb97`（本轮复核基线） |
| `/home/avaarg/workspace/agentaliyun` | 同上 | `57a0eec76667fcc12855dbf8decc9fc305b00a31`；脏范围仅 `?? agent/`（未跟踪研究树，不被该 HEAD 覆盖） |
| `/home/avaarg/sre/holmesgpt` | 同上 | `5e983c17f30e93099c7d775167266d4cd1d586c4`；脏范围仅 ` M CLAUDE.md`（`AGENTS.md` 为指向 `CLAUDE.md` 的符号链接，已按其指引只读） |

外部仓库只读：本轮未在两仓库执行 edit、build、test、service、model 调用；遵守 agentaliyun `AGENTS.md` §5 所有权与 §15 Git 规则。所有引用为只读路径与行号锚点。

### 0.1 许可与来源文件（独立 find/grep 复核）

- agentaliyun：深度 ≤2 全仓 `find` 只命中 `./client/LICENSE`；**仓库根与 `controlplane/` 无任何 LICENSE/NOTICE**（`find controlplane -iname 'LICENSE*' -o -iname 'NOTICE*'` → 0）。`client/` 无 NOTICE 文件。
- `client/LICENSE` 开头为 `Apache License / Version 2.0, January 2004`；`client/go.mod`：`module github.com/aliyun/aliyun_assist_client`、`go 1.20`，依赖 `github.com/docker/docker v24.0.4+incompatible`、`github.com/creack/pty v1.1.15` 等。
- `controlplane/go.mod`：`module controlplane`（**无域名路径，非可 `go get` 的发布模块**）、`go 1.26.0`、`github.com/jackc/pgx/v5 v5.11.0`。
- 客户端上游溯源：`testdata/client/source-manifest.json` 记录 `upstream.url = https://github.com/aliyun/aliyun_assist_client.git`、`upstream.revision = 8bbe05f476a172f7c7d9233011f7bc80d4f2686b`、`recovered.candidateCommit = fd3b866d…`、`legacyCommit = 716e95eb…`、`legacyPatchSha256 = 34083b6b…`，并声明“恢复提交是新身份，不继承历史验收结论”；同目录另有本地补丁 `testdata/client/pre-v2.patch`。
- 本地 fork patch 位置：外层 `git log -- client` 仅一个提交 `84118e5e83fa squash(consolidation)`，即**本地 client 是合并快照**；与上游差异必须用 `candidateTree`（`e617d213…`）+ `pre-v2.patch` + manifest 逐项还原比对，不能靠外层历史推断。**本轮未执行全量 diff（NOT RUN，见 §9）。**
- vendor：`client/vendor/` 实测 51M，含 `bou.ke/monkey`、`github.com/docker/docker`、`go.etcd.io` 等；**禁止整目录拷贝**，按依赖闭包逐个审。
- HolmesGPT：根 `LICENSE` 178 行 Apache-2.0 正文；`AGENTS.md -> CLAUDE.md`。`pyproject.toml` 的 `[tool.poetry.dependencies]`（约 :12–58）含 `fastapi`、`litellm=1.89.0`、`supabase=2.28.1`、`kubernetes`、`boto3`、`sentry-sdk`、`confluent-kafka`、`opensearch-py`、`mcp=1.28.1` 等——**根 Apache 文本不覆盖这些第三方依赖与 `images/` 第三方 logo 资产的权利**。
- 未跟踪 `agent/` 研究树：SPDX 计数 `56 × GPL-2.0`、`2 × (LGPL-2.1 OR BSD-2-Clause)`；`agent/monitor-agent/README.md:1–11` 自述“二进制符号+反编译重建、非官方、非可编译”。

## 1. 分类总表（A=复用候选 / D=仅设计参考 / X=排除）

路径均相对 `/home/avaarg/workspace/agentaliyun/` 或 `/home/avaarg/sre/holmesgpt/`。“准入条件”是进入提取前必须逐项打勾的门槛，缺一即保持不可复制。

### A. 复用候选（reuse-after-review）

| 模块 | 行锚（本轮核对） | 覆盖能力 | 准入条件 |
| --- | --- | --- | --- |
| `client/agent/session/shell/shell_unix.go`（203 行）、`shell_linux.go`（5 行，`shellCommand = "bash"`） | `:1` build tag `linux\|\|freebsd`；`:36 StartPty`、`:112 waitPid`、`:127 stop`、`:140 SetSize`、`:160 onInputStreamData`、`:168 checkHomeDirPerm`、`:188 checkShellCmd` | PTY 执行端：启动/窗口尺寸/停止/home 权限与 shell 校验 | ① 该路径被 `client/LICENSE` 覆盖的书面依据存档（LICENSE SHA256 + 路径 + revision）；② 依赖闭包收敛：`creack/pty v1.1.15`、`google/shlex` + 客户端内部 `agent/util/process`、`common/executil`、`common/fileutil`、`sessionresult`——要么证明闭包内均为 Apache 覆盖并独立编译，要么按 Go 标准库重写；③ 在 GPUPanel backend 模块独立 `go vet`/`go test -race`；④ 不带出任何 aliyun 网络/签名路径 |
| `client/agent/taskengine/host/processor.go`（459 行） | `:75 PreCheck`、`:105 Prepare`、`:377 SyncRun`、`:402 Cancel`、`:422 Cleanup`、`:433 SideEffect` | 主机任务进程的运行、超时、取消、清理 | ① 同上权利存档；② 导入闭包解耦：该文件 import 了 `agent/log`、`agent/metrics`、`agent/pluginmanager/acspluginmanager`、`agent/taskengine/scriptmanager`、`powerutil`、`hectane/go-acl` 等客户端内部件（见 `:14–28`），**未见** `common/requester`（无云端直连），但需逐个决定“随行拷贝/重写”，禁止把整个 taskengine 拖入；③ 取消语义必须以独立观测（进程退出码）验收，不能以 HTTP 200 代替；④ 单机范围先去周期任务/插件匹配（`:366 matchPlugin`、`:457 isPeriodic`）再评估 |
| `client/plugin/commander/container/docker/{docker,exec,processor,streaming}.go` | `docker.go:18 DetectDockerProcessor`、`:32 newDockerClient`、`:49 findTargetContainer`；`exec.go:13 createExec`（`:17 ContainerExecCreate`）、`:31 startAndAttachExec`（`:35 ContainerExecAttach`）、`:49 inspectExec`（`:53 ContainerExecInspect`） | 容器内命令 exec/attach/inspect（已存在容器） | ① 权利存档；② `docker/docker v24.0.4+incompatible` 与 Go 1.26.6 兼容性实测，**不拷贝 client/vendor**，在 backend `go.mod` 选受维护 SDK 版本；③ 明确 scope：**不含**镜像、网络、卷、Compose、应用生命周期；④ 不读 `DOCKER_HOST` 环境之外的配置面，执行前由后端授权容器白名单 |
| `client/agent/taskengine/sendfile.go`（存在 `sendfile_test.go`） | 目录列举本轮确认（`ls client/agent/taskengine/`） | 任务文件下发原语 | ① 权利存档；② 不冒充 Files 模块：路径约束、上传/下载、权限与浏览缺失，须另建 |

### D. 仅设计参考（design-only-until-rights）

**在拿到覆盖该路径的明确许可之前，只允许读行为、写设计，不允许复制代码、注释或文档原文。**

| 模块 | 行锚 | 可借鉴的行为 | 解除条件 |
| --- | --- | --- | --- |
| `controlplane/operator/` | `operator.go:1–20`（包文档）、`:14` “No submit/signing path (Slice B stays BLOCKED_TRUST_BOOTSTRAP)”、`:43–44` `/run/agentaliyun/operator.sock` 与 `/etc/agentaliyun/operators.allow`、`:49–51` 权限 0750/0660/0600、`:56–59` 分页上限（`DefaultLimit 50`…`MaxMaxBytes 1048576`）；`auth.go:15`、`:51` `GetsockoptUcred(...SO_PEERCRED)`；`handlers.go:32 route`、`:74 buildMux` | 本地管理面：仅 UDS、SO_PEERCRED uid allowlist、读能力静态断言、审计与脱敏（`redaction_test.go`、`conformance_test.go` 断言 body 不泄密） | `controlplane/` 无 LICENSE/NOTICE（已复核为 0）：需权利人书面许可覆盖该目录及 revision，或 GPUPanel 依公开文件格式/OS 语义**独立重写**（参照 `agent/app/hostops/types.go:2` 既有先例：参考设计、独立实现） |
| `controlplane/task-store/` + `store/migrations/` | `ownership.go:30 assertOwnership`；`postgres.go:658/:691/:754/:767/:831` finish 幂等/对账事务；`types.go:376 OutcomeReconciled`；迁移 `0006_task.sql`、`0007_task_output_delivery.sql`、`0008_request_replay_task_identity.sql`、`0009_task_finish_reconciliation.sql`、`0010_operator_audit.sql` | operation ID、request id 幂等重放、丢响应后的状态对账、失败/unknown 语义 | 同上；且 **Postgres/pgx 体系不能替换 GPUPanel SQLite/GORM**（§5），只借状态机与对账判据 |
| `controlplane/p2contract/`、`controlplane/p2recon/` | `p2contract/CONTRACT.md`、`running_idempotency_test.go`；`p2recon/measure.go`、`scenarios_c_f_h_k_l_test.go` | “重复确认只执行一次”、重启/丢响应测量场景设计 | 同上；测试 harness 绑定其 fork 构建管线，仅借场景清单 |
| `controlplane/gateway/`、`controlplane/registry/` | `gateway/router.go:20–31` `/luban/*` 路径、`:194` 403/实例注销语义、`:210` V2 签名后可达；`registry/register.go:177 ServeHTTP`、`:433 lookupTarget`、`:132 WithActivationCodes`；迁移 `0004_activation_code.sql` | 实例注册/心跳/激活码的生命周期与拒绝语义 | 同上；**单机产品不引入 `/luban/*` 实例协议**，不暴露为 GPUPanel 产品 API |
| `client/agent/taskengine/runningoutput.go`（313 行）、`finish_v2.go`（616 行） | `runningoutput.go:19–30` 幂等交付注释、`:87 retain`、`:108 beginDelivery`、`:128 settle`、`:149 abandon`、`:170 observe`、`:284 pendingWithIdentity`、`:11/:77` import/调用 `common/requester`；`finish_v2.go:19–28` V2 协议注释、`:131 verifyV2Receipt`、`:170 buildV2Finish`、`:218 postV2Finish`、`:371 beginAttempt`、`:426 decision`、`:444 classifyV2Attempt`、`:516 flushFrozenDelivery` | 输出缓冲的 retain/settle/abandon、终态台账与重试分类 | **协议强耦合**（import `common/requester`、面向 aliyun `/task/running`、`/task/finish/v2` 与 SM2 签名）：只借台账/对账判据，**在 GPUPanel 操作账本上按本地 API 重新实现**，不拷贝 wire 实现；拷贝代码需与 A 类同样的权利存档 |
| `client/` 其余内部包（`agent/util/process`、`common/executil` 等） | 被 A 类文件 import 的闭包 | 进程组、执行、路径工具 | 随 A 类逐文件审：闭包内每个路径都要被 `client/LICENSE` 覆盖的依据 + 影子编译验证 |
| HolmesGPT 源码（`holmes/`、`server.py`） | 见 §6 | 诊断工具契约、装配、审批与校验模式 | 根 Apache-2.0 是**正向证据但非充分证据**：需 `pyproject.toml` 依赖逐项、图标/品牌资产逐项、以及 GPUPanel 侧集成审查（§6）后才可复制 Python 源码；首期按“设计参考 + 独立重写”处理 |

### X. 排除（exclude，禁止进入源码与发行物）

| 对象 | 依据（本轮核对） | 说明 |
| --- | --- | --- |
| 未跟踪 `agent/` 研究树（`assist-agent/`、`monitor-agent/`、`security-agent/`） | `?? agent/`；SPDX 计数 `56 GPL-2.0` + `2 (LGPL-2.1 OR BSD-2-Clause)`；`monitor-agent/README.md:1–11` 自述反编译、非官方、不可编译 | 既无稳定 HEAD 覆盖，又有 GPL/逆向来源：不复制、不整体纳入、不作为 Apache 源。`agent/assist-agent/.git` 无可解析 HEAD 的既有结论本轮未重跑（NOT RUN） |
| `client/vendor/`（51M） | `du -sh client/vendor` | 混合许可第三方：整目录拷贝等于绕过依赖审查；依赖在 backend `go.mod` 重新解析 |
| `bou.ke/monkey`、`agiledragon/gomonkey/v2` | `client/go.mod` require 段 | 测试期猴子补丁库：不进 GPUPanel 生产依赖 |
| `controlplane/deploy/{certs,systemd,scripts}`、`controlplane/cmd/*` | 目录列举 | 部署/私钥痕迹与本机路径假设，不移植 |
| Holmes 依赖与服务端整机 | `pyproject.toml` 依赖段（fastapi/litellm/supabase/kubernetes/kafka/sentry…） | 单机后台不因 Holmes 被迫依赖这些服务；不把 Holmes 服务进程作为 GPUPanel 依赖 |
| `holmes/`、Holmes `images/integration_logos/`（`anthropic_logo.png`、`aws_logo.png`、`argocd-icon.png`…）、`docker.yaml` 的 `icon_url`（外部 `gilbarbara/logos`） | `ls images/`、`docker.yaml:1–6` | 第三方商标/logo 与外链资产不在根 Apache 覆盖推定内：未做资产级审查前排除 |
| aliyun `/luban/*` 客户端协议、V2 签名实现 | `gateway/router.go:20–31`、`finish_v2.go:40 GetFinishV2OutputService` | 与单机 `/api/v1` 产品面无关：不引入云端签名/注册依赖 |

## 2. 六条链路的追踪结论

1. **进程取消**：`processor.go:402 Cancel`（配 `:377 SyncRun`、`:422 Cleanup`）；本地执行、无 `requester` 直连，但依赖客户端内部 `agent/util/process`、`agent/log`、`metrics`、`acspluginmanager`（`:14–28`）。→ A 类先拆依赖再提取；取消成功必须由进程退出独立观测。
2. **输出/finish 对账**：`runningoutput.go:87–170` 的 retain/beginDelivery/settle/abandon/observe 实现“同 request id + 相同字节 = 幂等重放”；`finish_v2.go:371–444` 区分 in-flight/unknown/retryable；服务端对账在 `task-store/postgres.go:658–831` 与迁移 `0008/0009`。→ 判据可借（D 类），wire 与 Postgres 事务不拷贝；GPUPanel 以本地 operation ledger 实现 `planned→running→completed/verified/failed/unknown`，退出码 receipt 与业务 verified 分开。
3. **PTY relay**：执行端 A 类（`shell_unix.go:36 StartPty` 等）；**浏览器中继不存在**——`docs/architecture.md:117`（agentaliyun 根 docs/）“Session relay comes only after the task and update paths are proven”，`docs/roadmap.md:20/:78` 列 Session WSS relay 为 P5。→ GPUPanel 必须自建 WebSocket↔PTY 中继与断连/进程退出语义。
4. **Docker scope**：`docker/exec.go` 覆盖 ContainerExecCreate/Attach/Inspect（已存在容器内执行观察），不含镜像/网络/卷/Compose/应用生命周期——属 GPUPanel 自建面，须真实 Ubuntu 生命周期测试。
5. **用户 auth vs 实例 auth**：GPUPanel 是**浏览器用户身份**（`core/middleware/session.go:15 SessionAuth()`、`csrf_protect.go:14/:22`）；agentaliyun 是**实例身份**（`registry/register.go:177/:433` 注册/激活码迁移 `0004`、`gateway/router.go:20–31 /luban/*`、签名门 `:210`）；本地运维是 **uid allowlist**（`operator/auth.go:51 SO_PEERCRED`）；任务归属是**实例归属**（`task-store/ownership.go:30 assertOwnership(taskInstanceID)`）。→ 四种身份不可混用；执行器不得信任自报 owner header。
6. **Postgres vs SQLite**：`controlplane/go.mod` → `jackc/pgx/v5`，10 个 `.sql` 迁移（`0001…0010`），无 SQLite。GPUPanel：`core/init/db/db.go:10 Init()`（GORM/SQLite）、`core/init/migration/*`，且 Core 还打开 agent/task/alert 库。→ controlplane 迁移器**不是** GPUPanel 数据迁移方案，须按 `core/init/*` 另行设计。

## 3. 依赖方向与 API 输入权限边界（准入即约束）

```text
React(shadcn) ──/api/v1──▶ GPUPanel 应用后端（core 职责的后继）
                            │  持有：请求身份(SessionAuth/CSRF)、项目/主机资源授权、
                            │        DTO 转换、业务规则、持久 operation 账本、审计
                            ├─(私有 UDS/受认证通道，类型化命令)──▶ 受限本地执行器（agent 职责的后继）
                            │        │  Linux / Docker exec / PTY 执行端（§1-A 类候选）
                            │        └─▶ 独立观测(退出码/inspect/只读采集) ─▶ 回执 ─▶ UI
                            └─(可选，只读、脱敏)──▶ HolmesGPT 诊断
                                   └─ 建议 ─▶ 后端重新授权 + 用户确认 ─▶ 同一受控执行路径
```

- 禁止方向：前端 → 执行器；Holmes → 执行器；执行器 → 直接读写业务库；Holmes `user_id` → 授权决策。
- **API 输入权限边界**：`/api/v1` 变更的权威只能在后端认证会话；请求体/头中的 owner、uid、role、容器名、路径一律是“待验证输入”。Catalog 是声明，不是任意 shell 的执行权限；AI 建议不构成执行授权；`2xx/Desired state` 不构成完成证据。执行器只接受类型化命令 + 后端签发的 operation ID + 过期确认，拒绝自报身份。

## 4. 禁止 import/复制清单与解除条件（给未来 backend/ 任务）

| 禁止项 | 解除条件（全部满足） |
| --- | --- |
| 后端模块 import `controlplane/...`（module 名 `controlplane`，无域名、无 LICENSE） | ① 覆盖 `controlplane/` 的明确许可文本与权利人依据入档（路径+SHA+revision）；② 行为差异评审通过；③ 独立编译/测试；④ 不引入 PostgreSQL 作为隐式前提 |
| 复制未跟踪 `agent/` 树任何文件（含其文档原文） | **不可解除**：GPL SPDX 与逆向来源使其长期排除；除非取得独立书面权利依据并单独立项 |
| 复制 `client/` 文件 | ① `client/LICENSE`（Apache-2.0）覆盖性存档并核对上游 `8bbe05f…` 差异（`candidateTree`+`pre-v2.patch` 逐文件，**本轮 NOT RUN**）；② 该文件 import 闭包全部过审；③ 归属/NOTICE 义务落实（`client/` 无 NOTICE，需按 Apache-2.0 §4 保留版权与许可副本）；④ backend 独立 `go build/go vet/go test -race` 通过；⑤ 根 `LICENSE`/`NOTICE` 不改：Apache 代码可并入 GPLv3 作品，**不得据此把整体称为 Apache** |
| 拷贝 `client/vendor/`、`client/thirdparty/` | 逐依赖 LICENSE 清单 + 与 backend `go.mod` 真实版本比对；vendor 目录本身不进库 |
| 把 Holmes 服务、其 API key、其 `user_id` 接入产品面 | §6 全部门槛；首期仅“后端持有密钥 + 后端覆盖身份 + 只读脱敏工具” |
| 任何新增 shell 拼接执行、模型输出直连执行 | 永久禁止（AGENTS 契约 §1.5、§1.10）：执行入口只有类型化命令 + 后端授权 |

## 5. GPUPanel 侧已确认的对应物（替换时必须保住）

- 模块与版本：`core/go.mod` `module github.com/avaargsh/GPUPanel/core`、`go 1.26.6`；`agent/go.mod` 同版本（与 client 的 `go 1.20`、controlplane 的 `go 1.26.0` 均不一致，选取源码前必须实测编译）。
- 认证/CSRF：`core/middleware/session.go:15`、`csrf_protect.go:14/:22`；其余中间件（`password_rsa.go`、`ip_limit.go`、`password_expired.go`、`operation.go`、`websocket_origin.go`）同属须保留语义的登录面。
- 数据入口：`core/init/db/db.go:10`；`core/init/migration/{migrate.go,migrations}`。
- 已有“参考而非复制”先例：`agent/app/hostops/types.go:2`（“Design reference: agentaliyun assist controlplane; independently implemented”）——预览摘要绑定、session owner、原子 claim、超时 unknown、查询不重放、真实 Docker inspect 核验等行为在替换后保持。注：backend/hostmetrics 与 hostobserve 的注释/骨架相似性归属仍未裁定（见 GOVERNANCE_STATUS“许可来源”），先例不构成 blanket 豁免。
- 打包耦合：`scripts/gpupanel-release.py:105` 硬编码 `("core","gpupanel-core")`、`("agent","gpupanel-agent")`（`:80` 说明与 Makefile 路径一致）——删除旧模块时必须同步，否则发行物缺件。
- 其余工程契约（新文件行数、operation/超时/回执、证据预算、`.local/` 不入库）以 [AGENTS](../../AGENTS.md) 与 [evidence README](../evidence/README.md) 为准，本文不复述。

## 6. HolmesGPT 专项（根 Apache ≠ 免审）

- **许可层次**：根 `LICENSE` Apache-2.0（178 行）→ 对 `holmes/**`、`server.py` 是正向证据；但 `pyproject.toml` 依赖（litellm、supabase、kubernetes、boto3、sentry、kafka、opensearch…）与 `images/`、`docker.yaml:1–6` 外链图标各有各的权利状态 → **逐项审完前不复制、不打包**。
- **可选 API key**：`server.py:421` 读 `HOLMES_API_KEY`，`:423` 非空才启用，`:426` 装 http 中间件，`:438` 常量比较，`:934 auth_enabled`。→ 共享服务密钥不能替代用户登录；接入时密钥只由后端持有，Holmes 不对外直连。
- **user_id（身份覆盖点）**：`holmes/core/models.py:138`（`user_id: Optional[str]`）、`:216`（注释：relay session token 校验所得）；`server.py:572` skill catalog、`:610–612` 写入 `request_context`、`:688/:743` 传播到工具调用。→ 后端必须把 `user_id` 覆盖为可信身份映射，**浏览器自报值一律丢弃**；Holmes 侧 `request_context` 不是 GPUPanel 的授权源。
- **命令权限/审批**：`holmes/core/models.py:200 enable_tool_approval`；`server.py:710 chat_request.enable_tool_approval or False`；`holmes/core/tool_calling_llm.py:370`（处理决策时恒 True）、`:642`（`approval_callback is not None`）、`:920/:1088`（默认 False）。解析与名单：`holmes/plugins/toolsets/bash/validation.py:41–55`（组合命令的解析/重定向原语进 DENY 判定）、`:104 get_effective_lists`、`bash/common/default_lists.py`（`DEFAULT_DENY_LIST`）。执行：`bash/common/bash.py:36 shell=True`、`:54 process.kill`、`:112 terminate`、`:117 kill`。→ 允许名单只是**额外防线**，不是沙箱；`enable_tool_approval=False` 不等于放行；`shell=True` 以服务进程权限执行且 kill 不证明子进程组全终止——GPUPanel 必须在自己这层做最终授权与进程组回收。
- **日志/输出脱敏**：`holmes/core/tools.py:150 sanitize`、`:160 sanitize_params`、`:274` 将 `request_context` 键置 `***REDACTED***`；`holmes/core/truncation/compaction.py` 含 redact。→ 现有脱敏只覆盖部分路径；聊天 ask、完整命令、`docker inspect/logs`（`docker.yaml` 的 `docker_inspect`、`docker_logs` 工具）可带秘密。接入前须限定采集字段、输出大小、日志与模型上下文，并以 GPUPanel 审计为准。
- **Docker 工具范围**：`holmes/plugins/toolsets/docker.yaml` 自述 “Read access to Docker resources”，仅 `docker images/ps/ps_all/inspect/logs` → 只读观察，**不构成** Docker/Compose/App CRUD。
- **诊断工具契约**（D 类设计参考）：`holmes/core/tools.py:255 ToolInvokeContext`、`:284 class Tool`；装配 `holmes/core/tools_utils/tool_executor.py:100 get_tool_by_name(user_id)`、`:153 clone_with_extra_tools`。
- 验收入口 `tests/test_api_auth.py` 等**本轮 NOT RUN**（不装依赖、不调用模型）。

## 7. 首次提取清单（A 类按序执行，每步独立可回退）

1. **冻结证据**：记录三仓 SHA（§0）、`client/LICENSE`、`testdata/client/source-manifest.json`、`pre-v2.patch` 的 SHA256 与路径；确认两外部仓库仍只读（`git status` 复跑）。
2. **权利闸**：为第一个目标文件（建议 `client/agent/session/shell/shell_unix.go`，无云端 import、面最小）建立条目：路径 + LICENSE 覆盖依据 + 上游 revision `8bbe05f…` 差异清单（`candidateTree` diff，**必须补做**）。
3. **依赖闭包**：列出 `StartPty` 所需最小集合（`creack/pty`、`shlex`、内部 `process/executil/fileutil/sessionresult`），决定“重写为标准库+受维护依赖”或“逐文件拷贝”，在 `backend/`（host-observer 任务之后的后续切片，**本任务不创建**）独立 `go.mod` 解析，禁止 vendor 拷贝。
4. **实现边界**：只做“执行端 + 尺寸 + 停止 + 退出观测”；WebSocket 中继、会话归属、断连清理在 GPUPanel 侧另建。
5. **测试**：`go vet`、`go test -race`（含恶意/超大输入、取消、进程退出、PTY 关闭后无泄漏）；对照 §3 边界写“拒绝自报 owner/未授权容器/路径穿越”的否定测试。
6. **第二候选**（`processor.go` 的 SyncRun/Cancel）先完成 import 拆解与周期/插件功能裁剪，再重复 2–5。
7. **对账判据**（`runningoutput`/`finish_v2`/`task-store`）走 D 类：写成 GPUPanel operation 状态机与对账测试场景，**不拷贝 wire/SQL**。
8. **证据**：按 `docs/evidence/README.md` 留 commit、命令、输出摘要与 NOT RUN。

## 8. core/agent 完整移除前的延迟缺口（每项都是删除阻断项）

1. `/api/v1` 全量清单与路由所有权转移（api-data-inventory 任务产出）：网站/数据库/监控等已暴露端点必须“保留或显式退役”，无兼容别名、无双写。
2. 登录纵切片：Session/CSRF/RSA 密码/IP 限流/密码过期/WebSocket origin（`core/middleware/*`）语义等价替换 + 拒绝测试。
3. 主机执行纵切片：进程取消、PTY 中继、Docker exec/Compose/Catalog 生命周期、GPU 观测（client 只覆盖前三项的一部分）。
4. 数据迁移：`core/init/db/db.go`、`core/init/migration/*` + agent/task/alert 多库；密码哈希、加密凭据、会话不可假定沿用；停写备份、有界幂等、可恢复——**controlplane 的 Postgres 迁移不适用**。
5. 打包/安装耦合：`scripts/gpupanel-release.py:105` 双二进制与 Core Web；systemd/package/CI/embed 中的 `core/`、`agent/` 引用。
6. `agent/app/hostops` 既有行为不回归（预览绑定、原子 claim、超时 unknown、查询不重放）。
7. 归属义务：若采用 client 源码，落实 Apache-2.0 副本与版权声明；根许可证变更另行立项（本轮不改 `LICENSE`/`NOTICE`）。
8. 证据与验收：真实 Ubuntu 安装、中断恢复、旧数据前向迁移与回滚，全部通过后才删除旧模块源码（删除源码不删除主机数据/备份/版权证据）。

## 9. 本轮执行记录（诚实口径）

只读复核命令与结果见上文各节锚点。**NOT RUN / 未执行**：`client/` 与上游 `8bbe05f…` 的
全量 diff 及 `legacyPatchSha256` 还原校验（需外部上游对象/网络，超本任务边界）；两候选
仓库与 GPUPanel 的任何 Go/Python 构建、测试、vet（只读研究树，禁止在其执行测试/服务）；
模型调用、服务/容器/host 变更、凭据读取、复制候选源码、修改外部仓库或
`LICENSE`/`NOTICE`/公共 API（全部禁止）。

本文件即复用边界任务唯一交付；回退方式：删除本文件。后续任务状态见
[GOVERNANCE_STATUS](../STATUS.md)。
