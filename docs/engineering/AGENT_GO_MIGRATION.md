# agentaliyun 研究能力的 Go 重写执行

2026-10-16，用户指定研究源 `~/workspace/agentaliyun/agent/`，要求由 OpenCode
迁移相关能力到 GPUPanel，并保持 Apache-2.0 转换方向。

共同基线：`5fd75f8403ba`。本轮在 `backend/` 独立实现，不向继承的 GPL Agent
复制代码，也不替换现有服务。遵循 [后端替换契约](APACHE_BACKEND_MIGRATION.md)。
源树包含未跟踪研究代码、许可未知代码及 GPL 组件；它是能力研究资料，不是可整体
复制的 Apache 软件包。Go 翻译不消除原代码许可要求。

## 已下发任务

使用 OpenCode 2.0.29、`opencode/mimo-v2.6-flash-free`，各独立 worktree，
单任务最多 20 分钟，无自动无限重试。实际版本以本地 CLI 和任务日志为准。

| 任务 | 独占范围 | 验收目标 |
| --- | --- | --- |
| monitor | `backend/internal/hostmetrics/` | 标准库实现 loadavg/PSI 只读采集；有界读取、取消、畸形数据、缺失与并发测试 |
| operations | `backend/internal/operation/` | 内存操作状态机；owner/resource/digest、幂等、原子 claim、超时 unknown、有限容量及拒绝测试 |
| capability-map | `docs/gpupanel/AGENT_GO_MIGRATION_MAP.md` | assist/monitor/security 能力、来源与许可边界、已有覆盖和后续 Go 切片 |

运行状态、PID、完整提示和日志保存在已忽略的 `.local/agent-go-migration/`。
monitor 已提交 `1acab29ad169`，operations 已提交 `96442b68fe48`，交接齐全；
协调者在各自提交独立执行 race 测试及 vet 均通过，独立源码审查进行中。
迁移清单经独立审查 ACCEPT 后修正为 `f5ef92e14b4a`，已纳入
`integration/agent-go-20261016`。主分支未变，Go 包尚未集成或运行接线。

## Apache 与运行边界

用户本轮明确要求 Apache 方向，允许独立原创的新文件标记 Apache-2.0；仅覆盖
本轮经来源复核的新文件。不得从 GPL/未知许可实现逐行翻译或复制。保留根
LICENSE、NOTICE 以及继承文件现有许可。新增例外范围须独立检查并更新文件级
许可清单；完整发行物未核权前，不声称 GPUPanel 整仓已 Apache 化。

所有工作者禁止改公共模块清单、认证、API/UI、存储模式、运行服务、安装路径或
外部源树；禁止云调用、凭据读取、主机 mutation、推送及自行合并。监控仅固定
Linux 文件；操作包不执行命令、不提供 HTTP，不将调用者自报 owner 视为认证。
内存账本不声称持久化；重启后不得据此自动重放真实操作。

## 验收与下一阶段

每任务提交限定路径，并记录 base/head、实际测试输出和阻塞项到本地 handoff。
实现任务须执行 `cd backend && go test -race -count=1 ./...` 与 `go vet ./...`。
协调者检查文件归属、500 行限制、依赖、源码来源、取消与拒绝测试；核心行为还需
独立审查，通过后串行集成并复跑测试、`git diff --check` 和 evidence budget。

后续顺序：明确三组能力清单 → 验收只读监控与状态机 → 持久账本和受限执行
→ 登录/资源授权接线 → Files/PTY/Docker 真实效果与恢复 → 安装和迁移验证。
security 中特权扫描、内核/eBPF、GPL 规则和云端协议按来源单独准入，不能整树搬迁。

恢复：仅回退本轮源码提交；不部署、不删除现有数据或备份。执行完成后更新本文件
及能力清单的真实状态，不复用旧任务的历史 PASS。
