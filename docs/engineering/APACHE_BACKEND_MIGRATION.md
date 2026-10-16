# Apache 后端替换：OpenCode 执行契约

日期：2026-10-16。用户指令：安排 OpenCode 推进后端替换及移除 core/agent 的方向。
本轮先交付可审核的契约清单与独立只读 Host 基础，不切换现有服务或根许可证。
调研依据：[候选复用与缺口](../gpupanel/APACHE_BACKEND_REPLACEMENT_RESEARCH.md)。

## 基线和运行边界

- 共同 Git 基线：`e133f405481e08cc7dd9130e1d87c20e49fbbb97`。
- 前端迁移另有运行中的 OpenCode；本批不得修改其 worktree、源码或任务状态。
- 每个任务独立分支/worktree；协调者唯一负责契约、审查和串行集成。
- 允许新增独立 `backend/` 实验模块，作为后续替换候选。这是对早期必须保留两个
  模块约定的有界研发扩展；现有模块、外部 API、存储与运行 namespace 暂不切换。
- 根 GPL/NOTICE 保持；新路径和独立实现声明不自动证明 Apache 权利。不得从
  1Panel 或许可未知目录复制实现，不得擅加许可授权声明。
- 不读取凭据、运行库、个人配置；不访问模型端点或云平台，不操作现有容器、
  systemd、安装路径、数据库；不部署、不推送、不合并、不清理其他任务。

## 本批任务与独占所有权

| 任务 | 独占文件 | 交付 |
| --- | --- | --- |
| api-data-inventory | `scripts/gpupanel-backend-contract-audit.py`、`scripts/tests/test_gpupanel_backend_contract_audit.py`、`docs/gpupanel/BACKEND_CONTRACT_INVENTORY.md` | 只读且确定性的源码契约索引；API、认证、数据迁移责任清单；无法静态解析项显式 unknown |
| reuse-boundaries | `docs/gpupanel/BACKEND_REUSE_BOUNDARIES.md` | 精确候选版本/路径/许可、可复用清单、禁止复制范围、剩余权利缺口与逐项接入门槛 |
| host-observer | `backend/` | 独立 Go module，只读 OS/内存/uptime 采集与 fixture/取消/真实只读测试；不提供 HTTP 或登录，不调用 shell |
| 协调者 | 本契约、调研报告、文档入口、任务调度与集成记录 | 检查边界，独立复验，决定接收或返工 |

后端首批 module 为 `github.com/avaargsh/GPUPanel/backend`，Go 1.26.6，优先标准库。
Host 采集只读取 `/etc/os-release`、`/proc/meminfo`、`/proc/uptime`，禁止读取
环境变量、进程命令行或任意用户路径。受控 fixture 路径仅由内部构造参数指定，
不可成为外部请求参数。设置读取大小上限与 context 检查；缺失、格式坏、超限、
取消返回可观察错误/不可用状态，不用零值冒充成功。分离原始读取/解析与 view；
没有第二用例不建泛化 provider registry。新文件不超过 500 行。

不复制继承实现；依需求和公开 Linux 文件格式独立实现。数据结构及采集范围只服务
Host 观测。新包是源码候选，尚未连接 UI、认证、特权执行器或真实安装。

## 交接和验收

每任务提交自己所有文件，并在忽略目录 `.local/backend-task/handoff.json` 记录：
task、base/head SHA、changed files、commands/exact results、blockers、接口/数据/许可
影响。不能 `git add -A` 跨范围，不得代替其他任务修改公共文件。

- 清单工具：fixture 验证动态路径 unknown、非法输入、确定性输出与只读性；执行
  最小 Python 用例，再按仓库契约执行相关 `test_gpupanel_*.py`。
- 复用报告：每个事实定位实际源码，区分版本化 client、controlplane、未跟踪研究树。
  根许可不代替依赖审查；旧测试报告不算本次通过。
- Host：`cd backend && go test -race ./... && go vet ./...`；fixture 覆盖恶意/超大
  输入与缺失字段；真实 Linux 读操作只证明本机采集，不证明 Ubuntu 安装或 UI。
- 集成前独立检查提交 diff/文件所有权、执行测试、检查无 shell/网络/特权入口和
  核心依赖；运行 evidence-budget 与 diff-check。未通过不集成。

下一批由 API/数据清单冻结登录协议，再实施登录→Host 的完整纵切片；文件、
终端、Docker/Compose/Catalog 和迁移恢复逐项验收，最后才能删除旧模块。
新后端不得用弱化 RSA、验证码、MFA、CSRF 或伪造 session 达到“登录通过”。
所有仍受支持 `/api/v1` 由同一运行路由所有者承担，不引入兼容别名或双写。

## 状态与恢复

当前进度（首轮后检查）：

- reuse-boundaries 已提交 `79208fe111a6c4a09b1ce371ca3eced3ea87254f`，有完整交接，
  仅修改独占报告；待协调者独立审查，尚未集成。
- api-data-inventory 首次遇到 `provider.invalid-output` 流中断，已原会话恢复。
  最新检查：已恢复工具执行并生成审计脚本，尚无提交/交接。最近一次运行失败为
  `IndexError: no such group`，所见脚本 618 行超过 500 行约束；仍在实现，未通过验收。
- host-observer 已修复此前 `undefined: timeInThePast` 编译错误并提交
  `8ff4a2b58e46fbc784a51bd3a860d2a65861bb7d`（仅 backend/，11 文件）。
  协调者独立执行 `go test -race -count=1 ./... && go vet ./...`，退出码 0。
  最终 handoff 已生成；尚未完成源码审查、UI/API 接线或集成验收。

OpenCode 2.0.29 / `opencode/mimo-v2.6-flash-free`；具体 PID/session/返回状态在
`.local/apache-backend/jobs.json`。恢复任务仍使用独立 worktree 与写入隔离。

用户确认额度恢复后，新增 `independent-review` OpenCode 任务，模型
`opencode/big-pickle`，独立 worktree 固定 Host 候选 SHA，源码及 Git 元数据只读，
仅允许写 `.local/` 审查回执，20 分钟时限。已观察到实际源码读取工具事件，当前
没有额度错误。复核 Host 采集与复用报告，完成后返回 ACCEPT/REQUEST_CHANGES；
拒绝项由原实现者修复后再验。API 清单任务继续运行，已观察到脚本修改事件，
仍须满足 500 行上限、测试、报告和交接后才能接收。
完整会话和临时日志不进入 evidence。工作者完成不等于独立验收通过。
任务使用 25 分钟时限，不自动无限重试；停止后保留 worktree、提交和交接。
回退仅撤回已审核的源码提交，不改主机状态或删除数据库；当前服务仍使用旧实现。
