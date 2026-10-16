# 运维诊断与受控变更契约（HolmesGPT 思路借鉴，仅设计）

日期：2026-10-16。任务：`operations-holmes-contract`（独立于运维实现作者）。
状态：**设计文档，不含实现**。本文件是本轮唯一允许新增的受版本控制文档；
`backend/internal/operation` 源码与测试保持只读，其实现者仍是唯一实现所有者。

调研基线（只读、无网络、无模型、无 Poetry 执行）：

- GPUPanel：`AGENTS.md`、`docs/README.md`、`docs/engineering/APACHE_BACKEND_MIGRATION.md`、
  `backend/internal/operation/{README.md,DECISIONS.md}`。
- HolmesGPT 研究树：`/home/avaarg/sre/holmesgpt`，固定 `5e983c17f30e93099c7d775167266d4cd1d586c4`，
  根 `LICENSE` 为 Apache-2.0；工作树 `CLAUDE.md` 处于 dirty 状态且**不在 HEAD 覆盖范围内**，本轮未改动。
- 本设计**只借鉴思路**，不复制任何 Python 实现、不做源码翻译、不引入新依赖。

## 1. 目标与非目标

- **目标**：为「已认证管理员在单机 Ubuntu 上发起**有界只读 Host 诊断**」建立可审查的
  授权、结果分类、脱敏与回执契约，并为**将来**的有类型变更（mutation）预留一个
  仅提案级别的授权绑定格式。诊断证据用于**说明主机状态**，**永不构成操作授权**。
- **非目标**（见 §11）：不实现通用工具注册表、不实现 LLM 循环、不做 shell 前缀白名单权限、
  不新建令牌服务、不新建执行器、不改 `/api/v1` 语义、不解除 operation 包的集成封锁。

## 2. 参与者、有界上下文、所有者与信任边界

| 角色/上下文 | 所有者 | 职责 | 信任级别 |
| --- | --- | --- | --- |
| 浏览器（已登录管理员） | 前端 | 展示、发起请求、呈现状态 | 不可信输入源 |
| Core API（认证/CSRF/资源归属） | core | **权威鉴权**、请求 DTO 校验、绑定 actor/resource | 唯一授权权威 |
| 诊断读取（hostobserve） | backend | 只读 `/etc/os-release`、`/proc/meminfo`、`/proc/uptime` 等 | 受限只读 |
| 操作生命周期（`backend/internal/operation`） | 原实现作者 | 有界内存状态机与回执 | 未接线、**变更用途封锁** |
| 执行器（未来） | 未定 | 真正产生主机副作用 | **尚不存在** |

- **信任边界**：浏览器→Core API 是唯一跨信任边界入口；Core→backend 为进程内受信调用。
  Agent/host 属另一边界，**任何前端提交的特权命令都不得直通 Agent/Docker**。
- **依赖方向**：前端 → Core 认证 API → 有界应用操作 → hostobserve/执行器 → 独立观测 →
  Core 回执/审计 → 视图。诊断与变更是两个不同 bounded context，禁止共用授权判定。

## 3. 第一个用例（最小、可落地、无需模型）

**已认证管理员请求有界只读 Host 诊断**，输入仅为宿主标识，无自由参数。

- 数据流：`POST /api/v1/...`（会话 cookie + CSRF）→ Core 校验身份、CSRF、资源归属 →
  调用 `hostobserve.Collector`（只读、受 `context.Context` 取消、按字段设读取字节上限）
  → 组装诊断视图 → 记录操作回执 → 返回视图。
- **快照字段来源（现状事实）**：`backend/internal/hostobserve/snapshot.go:87-105`
  当前仅含 `OS`/`Memory`/`Uptime` 三项；**`load` 与 `/proc/pressure`(PSI) 尚不存在于 backend**
  （`grep -rln 'loadavg|/proc/pressure' backend/` 无命中）。因此设计上把 load/PSI 标为
  `unavailable`，**不得用零值冒充成功**——这正符合「unavailable/error 显式保留」的要求。
- **结果分类（互斥，禁止合并）**：`request accepted`（已受理）、`executed`（已执行）、
  `observed`（已独立观测）、`success`、`unknown`、`denied`、`unavailable`。
  诊断只读路径只允许出现 `accepted / observed / success / unavailable / denied / unknown`；
  `executed` 保留给未来变更。
- **失败与恢复**：文件缺失/超限/格式坏 → 该字段 `unavailable` 并带错误类别；context 取消 →
  `unknown`（而非 `success`）；Core 侧超时 → 显式 `unknown` + 有界重试**由调用方决定**，
  包内不自动重放。所有状态都可由操作 ID 独立查询（查询不产生迁移、不产生执行）。
- **脱敏**：结果先按**字段白名单**过滤，再做**字节上限截断**，之后才可能进入任何未来模型
  上下文；不读取环境变量、进程命令行、任意用户路径。

## 4. 诊断证据 ≠ 操作授权（硬边界）

诊断返回的字段（含 `host.state`、`memory.free`、任何 verdict）**不得**被任何后续变更
端点读取为授权依据。授权只能来自 Core 在**请求当下**重新判定的
`认证主体 + CSRF + 资源归属 + 操作标识`。证据只进入审计与展示。

## 5. 后续有类型变更：仅「提案」，且服务端绑定

在第二个真实用例被接受之前，本节**只是提案格式**，不实现。任何未来变更提案必须由
**服务端**绑定：`actor(主体标识) / resource(资源) / operation-id / tool /
parameter digest / expiry / nonce 或一次性身份`。判定要点：

- 客户端或模型侧的 `user_approved`、`owner`、`pending_approval` 布尔值**永远不是权威**；
  只能作为提示，服务端必须独立复核（Holmes 把 `user_approved` 放进
  `ToolInvokeContext` 由调用方携带，见 §10，本设计不采纳其权威性）。
- HMAC/JWT 审批令牌**只证明真实性（authenticity），不证明一次性**：令牌可被原样重放。
  必须另有**原子消费**与**持久 replay 决策**（同参重放 → 已受理回执；异参 → 拒绝），
  且该决策在令牌校验之外独立存在。缺此机制则**不得**开启变更。
- 一次变更的验收必须满足：权威鉴权、CSRF、资源归属、审批**重放/篡改/过期/异主/参数变更**
  五类拒绝、**独立观测到的副作用**（HTTP 2xx 不算完成）、`unknown` 保留且**查询不等于重放**。

## 6. operation 包现状：变更用途 BLOCKED

`backend/internal/operation` 是**内存内**生命周期库，无持久化、无跨重启身份、无执行器。
本轮独立复核（`96442b68` → `6b600eaf`）结论见 §9 回执；`DECISIONS.md` D1/D2 已把
「purge/重启后同参 Claim 等同全新请求」「容量回收归认证生命周期」写成硬契约。
**在 D1 持久化结果账本与 D2 回收责任落地并测试之前，该账本对任何变更操作保持 BLOCKED**；
只读诊断也**不**复用它来绕过该封锁（诊断回执使用独立、无执行能力的只读记录）。

## 7. API 边界必须强制的项

1. 权威认证与**会话级 CSRF**（不接受 API-key 作为可选旁路，见 §10）。
2. 资源归属判定：跨主体读取/变更一律 `denied`，错误不泄漏他主记录内容。
3. 审批拒绝矩阵（全部需有负向测试）：重放、篡改、过期、异主、参数变更。
4. 变更结果必须**独立观测**；`unknown` 保留至有界观测窗口，查询永不触发执行。
5. 所有错误对外统一文案，具体原因只进服务端日志（并脱敏）。

## 8. 下一个最小 Go 切片（建议，由实现者执行）

**范围**：`backend/` 新增只读诊断应用服务（不含 HTTP 路由、不含执行器）——
`Diagnose(ctx, HostRef) (Diagnosis, error)`，复用 `hostobserve`，新增 `load`/`PSI` 两段
**带读取上限与 context 检查**的只读采集（缺失/坏格式 → `unavailable`，不返回零值冒充），
输出按字段白名单 + 字节上限组装；结果枚举用 §3 的互斥集合；不引入 operation 包。

**必须同时具备的测试**：fixture 覆盖缺失/超大/坏格式/取消；`unavailable` 与 `success`
不可混淆；`grep` 断言无 `os/exec`、无网络、无环境变量/进程参数读取；字段白名单与字节上限
的负向测试；新文件 ≤500 行；`cd backend && go test -race -count=1 ./...` 与 `go vet ./...`
分别记录退出码。

**再下一片（须先被接受为第二用例）**：变更提案 + 一次性授权绑定 + 原子消费决策，
才允许讨论执行器与持久账本。

## 9. 独立复核结论（Part A，详情在回执）

`6b600eaf` 相对 `96442b68`：F1–F6 全部有对应处置（D1/D2 文档契约 + `ErrInvalidTransition`
拒绝 unknown 重放 + `ObservationWindow` 保留 + `Reconcile` `MaxOwnerBytes` 边界 +
`IndependentlyVerified` 警告 + `Verification.At` 顺序告示 + D6 全部绑定显式化）。
门禁：`go test -race -count=1 ./...` 退出 **0**，`go vet ./...` 退出 **0**。
**此为功能验收，不等于权利 clearance**，不构成执行器/持久化/API 集成声明。
证据见 `.local/review.json`。

## 10. HolmesGPT 思路锚点（证明的代码行为 vs 设计建议）

只读引用，固定 SHA `5e983c17f30e93099c7d775167266d4cd1d586c4`；
小文件指纹为 sha256 前 20 位（`approval_tokens.py` `26aa278f6a4f96727bc1`、
`test_approval_token_security.py` `7e57b70d31f0d871c810`、
`test_approval_tokens.py` `aaab59300f3d58170a3c`、`core/tools.py` `cfd6a5bdfa3c433b94a4`、
`bash_toolset.py` `18df57ed3c5227ff249b`、`tool_calling_llm.py` `3558249b383c2d172dd4`）。

**已被证明的 Holmes 行为**：

- `holmes/core/tools.py:64` 结果状态枚举含 `success/error/no_data/approval_required/frontend_pause`；
  `:96` `StructuredToolResult` 把 `status/error/return_code/data/params/invocation` 分字段承载 →
  支持本设计 §3 的**互斥结果分类**思路。
- `holmes/core/tools.py:150` `sanitize` 用 `shlex.quote` 逐参转义、`:160` `sanitize_params`；
  这是**参数级**防护，不是授权。
- `holmes/core/tools.py:255-281` `ToolInvokeContext` 携带 `user_approved`（`:259`），
  `model_dump` 把 `request_context` 键改为 `***REDACTED***`，`__str__` 只列键名不列值 →
  「日志不外泄上下文」思路可借鉴；但**布尔权威性不可借鉴**。
- `holmes/utils/approval_tokens.py:64` `args_hash` 用 `sort_keys` 规范化 JSON 后 sha256 →
  参数摘要规范化思路可借鉴；`:76` `mint_token` 绑定 `tool_call_id/tool_name/args_hash/iat/exp`；
  `:91` `verify_token` 校验三者；`:46` 签名密钥取自环境变量或随机 32 字节（**弱密钥属运维信任**）。
- `holmes/utils/approval_tokens.py:33` `ApprovalTokenError` 对外**统一文案**、具体 `reason` 只给服务端。
- `tests/test_approval_token_security.py:71` 伪造 `pending_approval` 无令牌被拒、`:102` 改参数被拒、
  `:135` **跨调用令牌复用被拒**；`tests/test_approval_tokens.py:85/113/129/141`
  统一拒绝、改签名、过期、`alg=none` 均被拒。→ 支持 §7 拒绝矩阵。
- **重要缺口（已核实为「无匹配」而非推断）**：`grep -n 'consum|nonce|replay|jti|single.use'`
  在 `approval_tokens.py` 与 `tool_calling_llm.py` **均无命中** → Holmes **没有一次性消费机制**，
  令牌只是真实性证明。这正是 §5 要求「原子消费 + 持久 replay 决策」的依据。
- `holmes/core/tool_calling_llm.py:807` 从 `request_context` 取 `user_id` 传给
  `tool_executor.get_tool_by_name(...)` → 「按主体取工具」的**边界**思路；
  但 `:959-963` 与 `bash_toolset.py:233-260` 的放行依据是 `context.user_approved` 布尔 →
  **不可作为 GPUPanel 授权模型**。
- `bash_toolset.py:260` 打印**完整命令**到日志 → 本设计**不复制**该做法。
- **API-key 可选认证**：Holmes 的旁路式 API 认证在 GPUPanel 边界**不可接受**，
  必须是会话 + CSRF + 资源归属的权威判定（§7）。

**属于设计建议（非已验证行为）**：§3 结果互斥集合、§4 证据/授权分离、§5 一次性绑定、
§8 下一切片切分。Holmes 未提供 GPUPanel 所需的资源归属、CSRF、持久 replay 语义。

## 11. 明确不在本轮范围（out of scope）

通用工具注册表、LLM 循环、shell 前缀权限、令牌服务、新执行器、任何 `backend/` Go 源码或
测试修改、HTTP 路由、数据库/持久账本、跨主机与多租户、模型调用与网络访问、合并/推送。

**移除触发条件**：
- §5 提案格式 → 当第二个真实变更用例被接受并实现时，替换为实际实现并退役本节；
- §3 load/PSI 的 `unavailable` 占位 → 当采集实现落地并通过 fixture 验收时删除；
- §6 BLOCKED → 当 `DECISIONS.md` D1/D2 的持久结果账本与回收责任实现、测试并评审通过时解除；
- §8 切分建议 → 当切片被实现者接收为正式实现时，从设计文档移除并转入对应 ADR/DECISIONS。

## 12. 许可与来源边界

根 `LICENSE`（GPL-3.0）与 `NOTICE.md` **不变**；`backend/` 新文件的 SPDX `Apache-2.0`
是**文件级**声明，不构成整仓或整个 backend 模块的 Apache 权利证明。
HolmesGPT 根为 Apache-2.0，本文件只记录**思路与路径锚点**，未复制其实现、未新增依赖、
未做源码翻译；**本文件不授予任何许可，也不提供来源无瑕疵的保证**——
相似性/归属扫描不在本轮执行，权利问题仍为开放项（与回执 `source_license_boundaries` 一致）。
