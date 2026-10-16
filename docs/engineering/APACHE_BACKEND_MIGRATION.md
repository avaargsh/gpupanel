# Apache 后端替换：OpenCode 执行契约

日期：2026-10-16。目标：在不切换现有服务、外部 `/api/v1`、存储或根许可证的前提下，以独立
`backend/` 模块验证替换继承 `core/`、`agent/` 的方向。候选来源与缺口见
[复用边界](../gpupanel/BACKEND_REUSE_BOUNDARIES.md)，能力分期见
[迁移映射](../gpupanel/AGENT_GO_MIGRATION_MAP.md)。运行中任务的进度、审查结论与候选提交
一律以 [GOVERNANCE_STATUS](GOVERNANCE_STATUS.md) 为准；本文只保留稳定契约。

## 基线和运行边界

- 共同 Git 基线：`e133f405481e08cc7dd9130e1d87c20e49fbbb97`。每任务独立分支/worktree；
  协调者独占契约、审查与串行集成；不得修改其他任务的 worktree、源码或任务状态。
- 允许新增独立 `backend/` 实验模块，作为对“保留两个既有模块”约定的有界研发扩展；现有
  模块、外部 API、存储与运行 namespace 暂不切换。
- 根 GPL/NOTICE 保持；新路径和独立实现声明不自动证明 Apache 权利。不得从 1Panel 或许可
  未知目录复制实现，不得擅加许可授权声明。
- 不读取凭据、运行库、个人配置；不访问模型端点或云平台，不操作现有容器、systemd、安装
  路径、数据库；不部署、不推送、不合并、不清理其他任务。

## 首批任务范围（历史基线）

| 任务 | 独占文件 | 交付 |
| --- | --- | --- |
| api-data-inventory | `scripts/gpupanel-backend-contract-audit.py`、`scripts/tests/test_gpupanel_backend_contract_audit.py`、`docs/gpupanel/BACKEND_CONTRACT_INVENTORY.md` | 只读且确定性的源码契约索引；API、认证、数据迁移责任清单；无法静态解析项显式 unknown |
| reuse-boundaries | `docs/gpupanel/BACKEND_REUSE_BOUNDARIES.md` | 精确候选版本/路径/许可、可复用清单、禁止复制范围、剩余权利缺口与逐项接入门槛 |
| host-observer | `backend/` | 独立 Go module，只读 OS/内存/uptime 采集与 fixture/取消/真实只读测试；不提供 HTTP 或登录，不调用 shell |
| 协调者 | 本契约、调研报告、文档入口、任务调度与集成记录 | 检查边界，独立复验，决定接收或返工 |

后端 module 为 `github.com/avaargsh/GPUPanel/backend`，Go 1.26.6，优先标准库。首批 Host 采集
只读 `/etc/os-release`、`/proc/meminfo`、`/proc/uptime`；禁止读取环境变量、进程命令行或
任意用户路径。受控 fixture 路径仅由内部构造参数指定，不可成为外部请求参数。设置读取上限
与 context 检查；缺失、格式坏、超限、取消返回可观察错误/不可用状态，不用零值冒充成功。
分离原始读取/解析与 view；没有第二用例不建泛化 provider registry。新文件行数遵守
[AGENTS](../../AGENTS.md) §1.1。不复制继承实现，依需求和公开 Linux 文件格式独立实现；
新包是源码候选，尚未连接 UI、认证、特权执行器或真实安装。

## 交接和验收

每任务提交自己所有文件，并在忽略目录 `.local/backend-task/handoff.json` 记录 task、
base/head SHA、changed files、commands/exact results、blockers 与接口/数据/许可影响。
不能 `git add -A` 跨范围，不得代替其他任务修改公共文件。

- 清单工具：fixture 验证动态路径 unknown、非法输入、确定性输出与只读性。
- 复用报告：每个事实定位实际源码，区分版本化 client、controlplane、未跟踪研究树；根许可
  不代替依赖审查；旧测试报告不算本次通过。
- Host：`cd backend && go test -race ./... && go vet ./...`；fixture 覆盖恶意/超大输入与
  缺失字段；真实 Linux 读只证明本机采集，不证明 Ubuntu 安装或 UI。
- 集成前独立复验提交所有权与测试，检查无 shell/网络/特权入口和核心依赖，运行
  evidence-budget 与 diff-check（规则见 [evidence README](../evidence/README.md)）；未通过
  不集成。工作者完成不等于独立验收通过。

## 顺序与回退

下一批由 API/数据清单冻结登录协议，再实施登录→Host 完整纵切片；文件、终端、
Docker/Compose/Catalog 与迁移恢复逐项验收，最后才能删除旧模块。新后端不得用弱化 RSA、
验证码、MFA、CSRF 或伪造 session 达到“登录通过”；所有仍受支持 `/api/v1` 由同一运行路由
所有者承担，不引入兼容别名或双写。

回退仅撤回已审核的源码提交，不改主机状态或删除数据库；当前服务仍使用旧实现。任务限时
停止后保留 worktree、提交与交接；完整会话和临时日志不进入 evidence。
