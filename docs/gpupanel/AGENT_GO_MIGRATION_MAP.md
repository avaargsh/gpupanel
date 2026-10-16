<!-- SPDX-License-Identifier: Apache-2.0 -->
# assist / monitor / security 研究树能力 → GPUPanel Go 改写分阶段映射

日期：2026-10-16。任务：`capability-map`（OpenCode 批次 `agent-go-migration`）。状态：**规划映射，未复制任何源码、无 Go 变更、无交付声明**。
本文把 `/home/avaarg/workspace/agentaliyun/agent/` 研究树（未跟踪、许可混合）的可辨识能力，映射为本仓库 backend 方向的分阶段 Go 独立实现计划。研究树只作**行为/功能需求证据**（只读），不作代码来源。权利口径以[复用边界](BACKEND_REUSE_BOUNDARIES.md)与[执行契约](../engineering/APACHE_BACKEND_MIGRATION.md)为准；本文不给出任何外部法律结论。

## 0. 复核基线与锚点（本轮实测）

| 对象 | 命令 | 结果 |
| --- | --- | --- |
| GPUPanel 本 worktree | `git rev-parse HEAD` | `5fd75f8403ba08d491dad762a054b0cbe457374e`（= 本批次 base，工作区干净） |
| agentaliyun 仓库 | `git rev-parse HEAD` / `git status --short` | `57a0eec76667fcc12855dbf8decc9fc305b00a31`；脏范围仅 `?? agent/`——**未跟踪研究树不受该 HEAD 覆盖，无版本身份** |
| `agent/assist-agent/.git` | 只读 `git rev-parse HEAD` | `fatal: unknown revision`（复核了 reuse-boundaries 的既有 NOT RUN 项：无可用 HEAD，全部文件 untracked） |
| 研究树 SPDX 计数 | `grep -rho 'SPDX-License-Identifier:.*'` | 56 × `GPL-2.0`、2 × `(LGPL-2.1 OR BSD-2-Clause)`；三个子树均无统一 LICENSE 文件 |

文档锚点（`sha256sum`，只取相关文档，**不哈希整树**）：

| 锚点（相对研究树 `agent/`） | sha256 |
| --- | --- |
| `monitor-agent/README.md` | `4f6aae1c…a200c41` |
| `monitor-agent/cloudmonitor-architecture.md` | `ed12c843…48b3a4f` |
| `security-agent/README.md` | `782e9eae…ecdb6be9` |
| `security-agent/docs/aegis-replica-plan.md` | `fcdb4774…23fd7ad3` |
| `security-agent/rules/catalog.json` | `bdc71d19…bd127788` |
| `assist-agent/README.md` | `f8528eb5…da0a82` |
| `assist-agent/aliyun-assist-architecture.md` | `d0d263ff…ad7ca75` |
| `assist-agent/inventory/02-package-map.md` | `4d379349…260b23b3` |

本仓库契约锚点：`docs/gpupanel/BACKEND_REUSE_BOUNDARIES.md` = `db6c0e01…e32c4dc`；`docs/engineering/APACHE_BACKEND_MIGRATION.md` = `0a4f8735…7819b57`。

## 1. 能力分类映射（研究树行为 → 期望 Go 切片）

四类通则：① Go 切片全部**按本文功能规格 + 公开 Linux 文件格式独立实现**，标准库优先，不 import 继承 core/agent；② 信任边界固定为「浏览器 → 认证 Core/backend API → 类型化内部命令 → 受限执行/只读采集 → 独立观测回执」，前端与研究树均不构成执行授权；③ 研究树自带测试（`monitor-agent/tests/`、`security-agent/agent/tests/` 等）为**历史证据，仅参考场景清单**，永远不作验收；④ 新文件 ≤500 行、SPDX `Apache-2.0`（文件级声明，不改变继承代码许可）。

### A. Host 监控（`monitor-agent/`：argusagent 反编译重建，C++ 伪代码，不可编译）

- 研究树证据（行为需求）：静态采集模块读 `/proc/stat`、`/proc/meminfo` 等并周期聚合（`README.md:62–72` 一条指标生命周期）；自身资源看护与计数持久化（`README.md:74–75`）；模块调度/状态机（`README.md:40–52` 子系统表）。
- GPUPanel 现有覆盖：`backend/internal/hostobserve/`（os-release/meminfo/uptime 只读，已提交 `8ff4a2b5…`，独立测试通过、待审查）；legacy core/agent 监控端点未审计归属（见 BACKEND_CONTRACT_INVENTORY 线索，本任务不认定）。
- 期望 Go 切片：**进行中候选**——monitor worker 的 `backend/internal/hostmetrics/`（loadavg + PSI cpu/memory/io 有界只读解析，per-source 可用/缺失/畸形状态，无后台轮询）。后续按需逐文件扩展（如 `/proc/stat` CPU/内存快照），每次一个可独立测试的小切片。
- 信任边界：包内仅接受内部受信调用者传入的构造期路径；无 HTTP 输入面、无 shell、无网络；缺失/畸形必须显式 unavailable，不得零值冒充成功。
- 许可/来源：全部独立实现；研究树反编译代码为 GPL-2.0 标记来源，**禁止复制/翻译**；`/proc` 公开格式为事实依据。
- 真实测试：fixture（缺失/超大/畸形/取消/并发）+ Linux 只读 smoke；真实读只证明本机采集，不证明安装或 UI。
- 阻塞依赖：协调者对 hostmetrics 与 hostobserve 的归属/去重裁决；接线（认证、API）属后续纵切片，本阶段不引入。

### B. 进程 / 任务 / PTY / 文件下发（`assist-agent/`：官方上游引用 + 实机二进制证据混合树）

- 研究树证据：上游官方 client（Apache-2.0 自述，**未随树分发**，`README.md:1–12`）覆盖任务引擎（host 命令运行/超时/取消/清理）、会话 PTY shell、文件下发、插件与自更新；`inventory/02-package-map.md` 给出实机二进制↔上游包映射；`STUDY/07` 会话与文件发放、`08` IPC 看护为行为文档。树内同时含逆向证据（`inventory/`、`symbols/`）与注释镜像（`annotated/`），来源层级不同，见 §3。
- GPUPanel 现有覆盖：`agent/app/api/v1/terminal*.go`（终端/PTY 会话）、`process.go`（进程）、`file.go`（文件）；`agent/cron/`（定时任务）；`agent/app/hostops/`（操作引擎与回执，先例：参考设计、独立实现，`types.go:2`）；legacy 实现未迁移前不得删除（BACKEND_REUSE_BOUNDARIES §8 阻断项）。
- 期望 Go 切片（顺序）：① **进行中候选**——operations worker 的 `backend/internal/operation/`（planned→running→completed/failed/unknown 生命周期、原子 claim、幂等重放、超时转 unknown、强制 reconciliation、内存态有界）；② 任务执行切片：类型化命令 → 有界超时/取消/进程组回收 → 退出码回执（独立观测，不以 2xx 代替）；③ PTY 执行端：openpty/窗口尺寸/停止/关闭后无泄漏；WebSocket↔PTY 中继是 GPUPanel 自建面，不在执行端切片内；④ 文件切片：路径约束的有界读写/列举，不冒充完整 Files 模块。
- 信任边界：执行器只接受后端签发的类型化命令 + operation ID + 过期确认，拒绝自报 owner/uid/路径；浏览器永不直连执行器。
- 许可/来源：研究树任何文件（含 `aliyun_assist_client@8bbe05f/` 本地快照、`annotated/`、`inventory/`）**一律不复制**；从行为规格与公开 OS 语义独立实现。上游 client 的 Apache 复用走 BACKEND_REUSE_BOUNDARIES §1-A/§7 的独立权利闸，与本映射不合并。
- 真实测试：race 测试覆盖同时 claim、digest 变更拒绝、跨 owner 拒绝、超时→unknown→reconcile、PTY 关闭泄漏、路径穿越否定用例；legacy 行为对照仅作回归参考。
- 阻塞依赖：operations 切片验收（本批次进行中）；认证/授权纵切片（Session/CSRF 等价替换）；打包耦合（`scripts/gpupanel-release.py:105`）处置方案。

### C. 完整性 / 安全 / 事件审计（`security-agent/`：aegis 复刻，内核 C + 用户态 Python）

- 研究树证据：用户态能力面（`agent/aegis_agent/` 模块清单）：资产/基线（`capabilities/baseline/proc/filewatch`）、规则引擎（`ruleengine` + `rules/catalog.json` 机读总表）、隐藏进程交叉验证（`hiddenproc`）、webshell/爆破/弱口令特征（`webshell/crack/weakpass`）、SCA 检查（`sca`）、自守护与上报（`selfguard/uplink/report`）；`README.md:1–11` 声明内核采集 20+ 事件/47 tracepoint、BTF 探测与非静默降级。
- GPUPanel 现有覆盖：**无**对应 Go 切片（grep 仅 `agent/app/service/ssh.go` 等零星关键词，非审计模块）。本阶段唯一相邻面是操作审计回执（legacy），未独立化。
- 期望 Go 切片（仅非特权、只读部分立项）：① 有界只读事件/登录记录解析（公开日志格式，脱敏输出）；② 已知路径的文件完整性快照（哈希比对、路径白名单、只读）；③ 与 operations 账本衔接的审计条目（operation ID + 独立观测结果）。**检测引擎、规则 DSL、网络上报不立项**（负需求）。
- 信任边界：只读采集器无执行权；输入（日志行、路径）一律不可信，有界解析；输出经脱敏后仅进审计视图；不引入 root 常驻进程。
- 许可/来源：整树 GPL-2.0 SPDX 标记 + 复刻性质 → **排除复制/翻译**；行为需求取自 README/catalog 的功能描述层面。
- 真实测试：fixture 日志（截断/超长/伪造字段）、路径白名单外拒绝、哈希稳定性、race；无内核依赖。
- 阻塞依赖：产品侧对审计范围的真实用例（AGENTS §0：无第二用例不建抽象）；内核部分见 §E。

### D. 云依赖能力（两树共有：心跳、上报、自更新、实例协议）——**排除，不立项**

- 研究树证据：`monitor-agent/README.md:43`、`:62–72`（POST 上报通道/签名/代理）、`assist-agent` 上游心跳/通道/自更新（`STUDY/02/06`）、实例注册与 `/luban/*`（见 BACKEND_REUSE_BOUNDARIES §1-X/§2-5）。
- 期望处理：单机产品**不实现**任何云心跳/上报/实例身份/云自更新；身份永远是浏览器用户会话。负需求写入后续切片评审：不得以实例凭据、allowlist 或自报 header 替代用户授权。
- 阻塞依赖：无（排除即结论）；若未来引入外部受控通道，另立 ADR 与信任引导设计。

### E. 特权 / 内核 / eBPF（`security-agent/src/bpf` + tracefs 降级）——**搁置，待独立许可策略**

- 研究树证据：`README.md:1–11`（CO-RE/ringbuf/47 tracepoint/tracefs 降级，需 root 与 clang/libbpf 工具链）。
- 现状：研究树内核层 GPL-2.0 标记；本仓库无内核采集面。
- 期望处理：**在获得独立书面权利依据与专门安全评审前，不进入 Go 改写范围**（不复制、不翻译、不打包）；GPUPanel 的 GPU/主机观测继续走只读用户态路径。解除条件：权利人依据入档 + 单独立项（含提权面威胁模型），缺一不启动。

## 2. 分阶段计划（候选均为进行中，无交付声明）

| 阶段 | 内容 | 状态 / 候选 | 真实测试门槛 | 阻塞 |
| --- | --- | --- | --- | --- |
| 0 | 观测与账本基座：hostmetrics（A）、operation 生命周期（B①） | **进行中**：monitor worker 分支 `backend/agent-go-monitor-20261016`（`backend/internal/hostmetrics/`）、operations worker 分支 `backend/agent-go-operations-20261016`（`backend/internal/operation/`），同 base `5fd75f84`；本批次状态 `running-tools-confirmed`（读取 `.local/agent-go-migration/jobs.json` 时点） | `cd backend && go test -race -count=1 ./... && go vet ./...`；协调者独立复验 | 完成≠验收；需源码审查与集成裁决 |
| 1 | Host 观测扩展（A 后续切片）与 legacy 监控端点归属裁定 | 未开始 | 每切片 fixture+negative+只读 smoke | 阶段 0 验收；api-data-inventory 端点清单 |
| 2 | 任务执行→PTY→文件切片（B②③④），接 operation 账本 | 未开始 | 取消/进程组/路径穿越/race；操作回执独立观测 | 认证纵切片；阶段 0 验收 |
| 3 | 非特权只读审计切片（C①②③） | 未开始，待产品用例确认 | fixture 日志/白名单/哈希稳定性 | 真实用例；阶段 2 回执模型 |
| 4 | 云依赖（D）与内核/eBPF（E） | 排除/搁置 | —（不启动） | D 永不自动转正；E 需权利依据+立项 |
| 5 | legacy `core/agent/` 删除 | 不在本任务范围 | 沿用 BACKEND_REUSE_BOUNDARIES §8 八项阻断 | 阶段 1–3 全部验收 + 安装/迁移证据 |

## 3. 许可与来源立场（保留审查项）

- Apache-only 目标**排除**：研究树 GPL-2.0 标记实现、`(LGPL-2.1 OR BSD-2-Clause)` 两处标记文件、无许可的逆向/反编译内容，以及 §E 内核部分；root `LICENSE`/`NOTICE`（GPL-3.0 面）在全量发行物权利清理前保持不变。本文的 `Apache-2.0` SPDX 仅声明**本新文件**的文件级许可。
- 不作外部法律结论：本文与复用边界均不认定任何第三方权利状态，仅记录事实与缺口。
- 保留的权利审查项：① 研究树无统一 LICENSE、GPL SPDX 与逆向来源并存（已计数，未逐文件核）；② `assist-agent/README.md` 头部自述上游 Apache-2.0，而 `README.md:93` 构建段又称“第三方 MIT 项目”——**自述互相矛盾，待上游 `client/LICENSE` 路径级核验**（不采信任一方）；③ `assist-agent/.git` 无 HEAD（本轮复核），树内容无版本身份，仅锚点哈希可追溯；④ 上游 client 快照与 `pre-v2.patch` 差异比对仍为 reuse-boundaries 任务的 NOT RUN 项；⑤ 若未来任何 Apache 源并入发行物，归属/NOTICE 义务按该源许可单独落实。

## 4. 本任务执行记录（诚实口径）

| 动作 | 结果 |
| --- | --- |
| 三处 `git rev-parse/status`、SPDX 计数、8+2 锚点 sha256 | 已执行，见 §0 |
| 研究树文档/目录只读阅读（README×3、子系统表、模块清单、jobs.json） | 已执行；未 edit/build/test/复制任何研究树文件 |
| Go 变更、构建、`go test`/`go vet` | **无 Go 变更（本任务按契约不运行 Go 套件，改跑链接检查/diff-check/证据预算）** |
| 与上游 `8bbe05f` 的差异核验、模型/网络/shell 产品调用、宿主变更 | **NOT RUN / 禁止（超边界）** |
| 验证 | 见交接 `.local/handoff.json`：文档内链接逐项存在、`git diff --check`、`python3 scripts/gpupanel-evidence-budget.py` |

回退方式：删除本文件（仅本任务唯一交付，`docs/gpupanel/AGENT_GO_MIGRATION_MAP.md`）。本文件被 docs/README.md 入口引用属协调者集成职责，本任务不改公共入口。
