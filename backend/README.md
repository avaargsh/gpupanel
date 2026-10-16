# backend — 独立后端候选模块

状态：**源码评审候选，未接入任何运行服务**。本模块是 Apache 后端替换方向的
首个独立实现切片（见 [APACHE_BACKEND_MIGRATION](../docs/engineering/APACHE_BACKEND_MIGRATION.md)、
[替换调研](../docs/gpupanel/APACHE_BACKEND_REPLACEMENT_RESEARCH.md)），
当前仅包含一个只读 Host 采集器，不包含 HTTP 服务、登录、路由、安装器或数据库。

- 模块路径：`github.com/avaargsh/GPUPanel/backend`
- Go 版本：`go 1.26.6`（与 `core/`、`agent/` 声明一致；无 `go.work`、无根模块改动）
- 依赖：**仅 Go 标准库**，无第三方模块，`go.mod` 之外无 `go.sum`

## 布局

```text
backend/
├── go.mod
├── README.md
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
语义；四态与"成功零值"的区分；并发采集。`smoke_test.go` 在真实 Linux 主机上
只读三个系统文件并断言有意义的不变量（内存不为零、available≤total、uptime 为
正且合理），不写系统状态——它只证明本机采集，不证明 Ubuntu 安装、API 或 UI。

## 来源与许可限制

- 本模块代码为按需求独立实现，依据公开的 Linux 文件格式文档
  （os-release(5)、proc(5)）编写；**未从 `core/`、`agent/` 或任何第三方项目
  复制实现**，仅标准库调用。
- 不添加 SPDX/许可授权声明：作者身份不等于权利证明。仓库根 `LICENSE`/`NOTICE`
  仍为 GPL-3.0 fork 声明，**本提交不声明整个 backend 已获 Apache 批准**；
  许可结论待独立核权（见 `docs/gpupanel/APACHE_BACKEND_REPLACEMENT_RESEARCH.md`）。
- 当前无运行接入：无路由、无认证、无执行器、无数据迁移；验收时不得据此声称
  登录→Host 纵切片或安装已交付。
