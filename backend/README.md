# backend — 独立后端候选模块

状态：**源码评审候选，未接入任何运行服务**。本模块是 Apache 后端替换方向的
首个独立实现切片（见 [APACHE_BACKEND_MIGRATION](../docs/engineering/APACHE_BACKEND_MIGRATION.md)、
[替换调研](../docs/gpupanel/APACHE_BACKEND_REPLACEMENT_RESEARCH.md)），
当前包含两个只读 Host 采集器（`hostobserve`、`hostmetrics`）及内存操作状态机 `operation`，
不包含 HTTP 服务、登录、路由、安装器或数据库，也未接入任何运行服务。

- 模块路径：`github.com/avaargsh/GPUPanel/backend`
- Go 版本：`go 1.26.6`（与 `core/`、`agent/` 声明一致；无 `go.work`、无根模块改动）
- 依赖：**仅 Go 标准库**，无第三方模块，`go.mod` 之外无 `go.sum`
- 三个 Go module 的分工：`core/`、`agent/` 为在役模块（认证、`/api/v1`、主机执行），
  `backend/` 为实验性替换候选，不参与当前发行与运行。

## 布局

```text
backend/
├── go.mod
├── README.md
├── internal/hostmetrics/     # 已接收：loadavg/PSI 只读采集（见下"接收状态"）
│   ├── README.md             # 包内契约、来源与许可说明（文件级 Apache-2.0 SPDX）
│   ├── metrics.go / collector.go / loadavg.go / pressure.go / numbers.go
│   └── *_test.go             # 解析、取消、并发、真实 Linux 只读冒烟
└── internal/hostobserve/
    ├── snapshot.go        # Status、Snapshot 视图类型、sentinel 错误、读取上限常量
    ├── collector.go       # Collector 构造、Collect（context 检查）、有界读取、状态映射
    ├── osrelease.go       # /etc/os-release 解析（独立于原始字节与 Snapshot）
    ├── meminfo.go         # /proc/meminfo 解析
    ├── uptime.go          # /proc/uptime 解析
    ├── collector_test.go  # fixture 行为测试（有效/缺失/超限/取消/部分可用/并发）
    ├── malformed_test.go  # 畸形内容与数值校验表驱动测试
    └── smoke_test.go      # 真实 Linux 只读冒烟
```

包位于 `internal/`：目前没有第二个使用方，不对外部模块开放，也没有建立
provider registry 或泛化接口。

## 用法

```go
ctx := context.Background()

// 真实系统路径：/etc/os-release、/proc/meminfo、/proc/uptime
snap, err := hostobserve.New().Collect(ctx)
if err != nil {
    // 仅当 ctx 取消/超时；此时返回零值 Snapshot，未读任何文件
}

// fixture 路径（测试或固定部署根）：绝对路径、内部可信构造参数
c, err := hostobserve.NewWithPaths("/fixtures/os-release", "/fixtures/meminfo", "/fixtures/uptime")
```

`Collect` 对每个数据源返回独立的 `Status` + `Err`，失败源不影响其它源：

| Status | 含义 | 典型 Err |
| --- | --- | --- |
| `available` | 在读取上限内读出并解析成功；零值是真实零（如开机瞬间 uptime=0） | `nil` |
| `missing` | 文件不存在（ENOENT，含断裂符号链接） | `ErrMissing` |
| `unavailable` | 存在但有界读取失败（权限、I/O、目录）或超限 | `ErrUnavailable`、`ErrTooLarge` |
| `malformed` | 已读出但内容违反文档格式，**包括必需字段缺失** | `ErrMalformed`、`ErrMissingField` |

部分可用是正常结果：`err == nil` 且某一节为 `missing`/`malformed` 不是错误。

## 采集范围与安全契约

- 只打开三个文件：`/etc/os-release`、`/proc/meminfo`、`/proc/uptime`
  （`NewWithPaths` 的替代路径为内部可信构造参数，不是外部可写 API 输入，
  本包没有任何 HTTP 处理器）。
- **硬读取上限先于分配生效**：上限是编译期常量（os-release/meminfo 各 16 KiB、
  uptime 1 KiB），缓冲区恰为 `limit+1` 字节且在打开文件前分配；超过上限的文件
  以 `ErrTooLarge` 拒绝，内容不进入解析。
- **context 取消**：每次有界读取之前检查 `ctx.Err()`（读前、两次读取之间），
  预取消上下文不执行任何读取；取消/超时返回零值 Snapshot 与 context 错误。
- 不执行任何 shell 或子进程命令；不读取环境变量、进程表、凭据、用户配置；
  不写任何系统状态；不做网络访问；解析层不进行变量/环境展开。
- 只输出非敏感数据：OS 标识（NAME/ID/VERSION_ID/PRETTY_NAME）、内存
  （MemTotal/MemAvailable 字节）、uptime/idle 秒数。
- `Collector` 构造后不可变，可并发调用 `Collect`（`-race` 覆盖）。

## 测试

```bash
cd backend
GOTOOLCHAIN=local GOCACHE=<worktree>/.local/go-cache \
  go test -race ./...
GOTOOLCHAIN=local GOCACHE=<worktree>/.local/go-cache go vet ./...
```

覆盖：带转义/引号的 os-release 有效数据；必需字段缺失与畸形行；数值
overflow/NaN/Inf/负数/非整数；恰好等于上限与超过上限的输入；缺失文件与断裂
符号链接；预取消与读取间隙取消（逐点计数断言检查次数）；目录不可读；部分可用
语义；四态与"成功零值"的区分；并发采集。`internal/hostmetrics/` 有独立的解析/
取消/并发/冒烟测试，命令相同（`go test -race ./...` 覆盖两个包），细节见
[hostmetrics 包说明](internal/hostmetrics/README.md)。`smoke_test.go` 在真实 Linux 主机上
只读三个系统文件并断言有意义的不变量（内存不为零、available≤total、uptime 为
正且合理），不写系统状态——它只证明本机采集，不证明 Ubuntu 安装、API 或 UI。

## 接收状态

- **接收状态（hostmetrics）**：`internal/hostmetrics/` 已由协调者接收至隔离集成分支
  `integration/agent-go-20261016` 的 `c69d036d0455`，monitor 独立源码审查 ACCEPT
  （`1acab29ad169`，无 BLOCKER/MAJOR），协调者复跑
  `cd backend && go test -race -count=1 ./... && go vet ./...` 退出 0。
  这只证明只读 Host 包测试通过，**不证明 API/UI/安装接线**；三项非阻断保留意见
  （内部自定义路径 stat/open FIFO 窗口、逐数据源 Status 映射到未来 API、CRLF 容忍）
  见 [AGENT_GO_MIGRATION](../docs/engineering/AGENT_GO_MIGRATION.md)，接线时必须使用
  固定系统路径。`internal/hostobserve/` 亦已接收（`8ff4a2b58e46` + 审查修订
  `a8d0e6187f82`）。
- **operation 状态机已在集成树内**：`backend/internal/operation/` 候选
  `6b600eaf9409` 独立功能复审 ACCEPT；变更用途仍受 D1/D2 门槛约束；不得据其存在宣称账本已交付。

## 来源与许可限制

- 本模块代码为按需求独立实现，依据公开的 Linux 文件格式文档
  （os-release(5)、proc(5)、内核 `Documentation/accounting/psi.rst`）编写；
  来源审查未在有界比对中发现第三方复制，但 `hostmetrics` 与同仓 `hostobserve`
  的注释和读取骨架存在匹配；不得将这解释为完全无复用的证明。仅标准库调用，
  共同来源的归属、文件级授权范围与声明仍待裁定。
- **文件级 SPDX 现状（按包区分）**：
  - `internal/hostmetrics/*`：每个新原创文件首行 `SPDX-License-Identifier: Apache-2.0`，
    为所有者明确要求的**文件级**声明（含 `README.md` 顶部的注释声明）。
  - `internal/hostobserve/*`：**无 SPDX 头**，仍未作许可声明。
- 上一条修订自旧表述“不添加 SPDX/许可授权声明”——该表述在 hostmetrics 接收后已过期；
  本文件是 `backend/` 的共享 README，故在此统一记录两个包的真实差异。
- 文件级 SPDX **不等于**模块级或仓库级许可结论：仓库根 `LICENSE`/`NOTICE` 仍为
  GPL-3.0 fork 声明，**本模块不声明整个 backend 已获 Apache 批准，不声明整仓已 Apache 化**。
  许可结论待独立核权（见 `docs/gpupanel/APACHE_BACKEND_REPLACEMENT_RESEARCH.md`）；
  已登记的文件级 Apache 范围清单为 `docs/gpupanel/APACHE_FILE_SCOPE.md`，
  **其与 hostmetrics SPDX 的对账仍 outstanding（归协调者，见
  [治理状态](../docs/STATUS.md)）**。
  `backend/README.md` 与 `internal/hostmetrics/README.md` 之间的表述冲突由本节消除。
- 当前无运行接入：无路由、无认证、无执行器、无数据迁移；验收时不得据此声称
  登录→Host 纵切片或安装已交付。
