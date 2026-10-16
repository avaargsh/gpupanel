<!-- SPDX-License-Identifier: Apache-2.0 -->
# backend/internal/hostmetrics — Linux 负载与 PSI 压力只读采集

状态：**源码评审候选，未接入任何运行服务**。独立实现的 `/proc/loadavg` 与
`/proc/pressure/{cpu,memory,io}` 有界只读采集器，按 [Apache 后端替换执行契约](../../../docs/engineering/APACHE_BACKEND_MIGRATION.md)
作为 `backend/` 模块的监控切片交付。无 HTTP、无登录、无路由、无 schema、无执行器。

## Actor 与资源边界

- **Actor（调用方）**：内部可信调用方 —— 未来 backend 服务层的已认证进程内代码。
  本包**没有**外部输入面：没有 HTTP handler，fixture 路径仅由内部构造参数
  `NewWithPaths` 指定（必须非空、绝对路径），任何请求数据不得转发到这里；
  路径注入测试即 `TestNewWithPathsValidation`。
- **资源（恰好读四个固定文件）**：`/proc/loadavg`、`/proc/pressure/cpu`、
  `/proc/pressure/memory`、`/proc/pressure/io`。只读、有界；不读环境变量、
  进程表、凭据、用户配置；不执行 shell/子进程；无网络；不写任何主机状态；
  不启动后台 goroutine、无轮询、无缓存（`TestCollectStartsNoGoroutines` 守护）。
- **依赖方向**：仅 Go 标准库（`context/errors/fmt/io/io/fs/math/os/path/filepath/
  runtime/strconv/strings` + 测试用 `syscall` 建 FIFO）；不 import 继承的
  `core/`、`agent/`，也不 import 兄弟包 `hostobserve`（按契约独立实现）。

## 接口与结果类型

```go
c := hostmetrics.New() // 或 hostmetrics.NewWithPaths(...4 个绝对 fixture 路径)
snap, err := c.Collect(ctx) // err 仅在 ctx==nil/取消/超时时非 nil
```

`Snapshot{Load, CPU, Memory, IO}`，每节独立携带 `Status` + `Err`：

| Status | 含义 | 典型 Err |
| --- | --- | --- |
| `available` | 在读取上限内读出并解析成功；零值是真实零（空闲系统 load=0.00） | `nil` |
| `missing` | 文件不存在（ENOENT，含断裂符号链接）；**PSI 缺失的显式状态，绝不冒充成功零** | `ErrMissing` |
| `unavailable` | 存在但有界读取失败（权限、I/O、非普通文件）或超限 | `ErrUnavailable`、`ErrTooLarge` |
| `malformed` | 已读出但违反文档格式：字段缺失/为空（`ErrMissingField`）、字段或行重复（`ErrDuplicateField`）、数值非法/越界/溢出（`ErrMalformed`） | 同左 |

部分可用是正常结果：`err == nil` 且某一节为 `missing`/`malformed` 不是错误。
被拒绝的解析**不返回部分值**（解析函数错误路径返回零值结构）。

## 数值与格式校验（对抗性输入）

- 数字先做字符扫描再进 `strconv`：仅允许纯十进制数字与至多一个 `.`，
  两侧必须有数字 —— `NaN`/`Inf`/`-1`/`1e3`/`0x1p0`/`0_0`/`.5`/`5.`/NUL 等
  一律 `ErrMalformed`，不会被静默置零。
- loadavg：单行恰五字段；少于五字段（或空文件）`ErrMissingField`，多于五字段
  或第二行 `ErrMalformed`；tasks 必须是 `running/total` 两个非负 uint64
  且 `running <= total`（可运行实体是既有实体的子集），分隔符缺失为
  `ErrMissingField`，非法/溢出/倒挂为 `ErrMalformed`；last pid 必须是无符号整数。
- PSI：必须同时含恰好一条 `some` 与一条 `full` 行（顺序不限，重复行为
  `ErrDuplicateField`）；每行必须恰好 `avg10/avg60/avg300/total` 四个
  `key=value`（缺失 `ErrMissingField`、重复 `ErrDuplicateField`、未知键/无 `=`
  `ErrMalformed`）；百分比 ∈ 0..100；`total` 为 uint64 微秒，
  超出 `18446744073709551615` 为溢出 `ErrMalformed`（`uint64 overflow` 表项）。
  未知行标签（含大写 `SOME`）先于字段检查按 `ErrMalformed` 拒绝。

## 有界读取、阻塞与取消（复核要点）

- **硬上限**：loadavg/PSI 各 `1 << 10` 字节；缓冲恰为 `limit+1` 且在读内容前
  分配；`io.LimitedReader{N: limit+1}` —— 恰好等于上限的文件可解析，
  超一字节即 `ErrTooLarge` 且内容不进解析（`TestReadBoundsExactAndOversize`，
  含 200KB 垃圾文件）。
- **阻塞防护**：先 `os.Stat` 判普通文件再 open —— FIFO/设备/socket/目录在
  open 之前被拒，避免不可取消的 open 阻塞（`TestNonRegularSourcesRejectedWithoutBlocking`
  用真实 FIFO + 5s 超时守护）；open 后 `f.Stat` 复查防路径替换。符号链接
  被跟随（指向普通文件可读，断裂链接为 `missing`，`TestSymlinkHandling`）。
  残余风险：stat 与 open 之间被换成 FIFO 的 TOCTOU 仅可能来自内部可信构造的
  路径，非外部输入。
- **取消**：`ctx.Err()` 在四次读取**各之前**检查一次且仅此一次；预取消上下文
  打开数为 0（`TestPreCancelledContextOpensNothing` 用 open 计数实证），
  读取间取消丢弃部分数据（`TestCancellationBetweenReads` 表驱动四点，断言
  Err() 调用次数与实际打开次数）；成功路径恰 4 次检查/4 次打开
  （`TestSuccessfulPassChecksBeforeEveryRead`）。普通文件上的 ≤1KiB 读取快速
  完成，因此逐读前检查即有效取消。
- Collector 构造后不可变，可并发 `Collect`（`TestConcurrentCollect`，
  8 goroutine × 50 次，`-race` 覆盖）。包级无任何 goroutine/轮询。

## 失败与回滚

- 失败面：每源独立 `Status`+`Err`，可观察、可分类（`errors.Is` 对 sentinel）；
  ctx 取消返回零值 `Snapshot` + context 错误，**调用方可重试**；无无限重试、
  无静默回退、无全局队列。本包不产生持久状态、不迁移数据、不安装组件，
  回滚 = 回退本包源码提交（删除 `backend/internal/hostmetrics/`）即可，
  不影响任何主机状态、数据库、既有 API 或运行中的 core/agent 服务。
- 局限（诚实口径）：`smoke_test.go` 只证明**本机**四个文件的只读采集与值域
  不变量，不证明 Ubuntu 安装、登录/API/UI 纵切片或运行接入；PSI 在
  `CONFIG_PSI=n` 内核上为 `missing`，冒烟接受并记录该状态。

## 测试与命令

```bash
cd backend
GOTOOLCHAIN=local GOCACHE=<worktree>/.local/go-cache go test -race -count=1 ./...
GOTOOLCHAIN=local GOCACHE=<worktree>/.local/go-cache go vet ./...
```

覆盖：合法/对抗/畸形解析表（NaN/Inf/负数/指数/十六进制/下划线/NUL/双点/
float 与 uint64 溢出/重复字段/重复行/未知键/缺字段/tasks 倒挂与溢出/百分比
越界）；恰好上限与超上限；缺失与断裂链接；非普通文件（目录、FIFO）；不可读
文件（root 跳过）；部分可用语义；取消四点；并发；无后台 goroutine；真实
Linux 只读冒烟。本轮执行结果见 `.local/handoff.json`。

## 来源、许可与权利审查

- **来源**：依任务功能规格与公开 Linux 文件格式（proc(5)、内核
  `Documentation/accounting/psi.rst`）**独立实现**；未读取、未复制、未翻译
  混合许可研究树（`agentaliyun/agent/`，GPL/未知许可逆向产物）的任何实现，
  未从继承的 `core/`、`agent/` 或兄弟包复制代码；仅标准库调用。
- **许可**：本包每个新原创文件首行 `SPDX-License-Identifier: Apache-2.0`，
  系**所有者明确要求的文件级声明**；这不是对继承代码、`backend/README.md`
  或仓库根 `LICENSE`/`NOTICE`（GPL-3.0 fork 声明）的再许可，根文件未改动。
- **剩余权利审查**：文件级 SPDX ≠ 证明整个 backend 模块或仓库已获 Apache
  授权；共享 `backend/README.md` 仍写有“不添加 SPDX 声明”，与本批所有者指令
  存在表述冲突，留待协调者在集成时统一（本任务不改该共享文件）。本包无第三方
  依赖，故无依赖许可闭合问题；无 NOTICE 增补义务评估待模块级许可决定时一并处理。
