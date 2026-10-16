# agentaliyun 能力 Go 重写

范围：参考 `~/workspace/agentaliyun/agent/` 的能力，在独立 `backend/` 中实现。
该研究树许可混合，不直接复制或逐行翻译。运行中的 Core/Agent 保持原契约。

| 范围 | 当前结果 | 后续门槛 |
| --- | --- | --- |
| `internal/hostmetrics` | `1acab29ad169` 独立审查 ACCEPT；集成 `c69d036d0455`，race/vet 退出 0 | API 映射逐源 Status；固定路径；自定义路径 stat/open 阻塞风险未消除 |
| `internal/operation` | 返工 `6b600eaf9409`；race/vet 退出 0，独立复审 ACCEPT，已集成 | 持久结果防重放、owner 生命周期回收；当前不接执行器 |
| 能力清单 | `f5ef92e14b4a` 已集成 | [来源、范围与分期](../gpupanel/AGENT_GO_MIGRATION_MAP.md) |
| Holmes 参考设计 | `20d9887896b8` 已接收并校正集成树事实 | 只读 Host 诊断先行；诊断建议不授予执行权限 |

当前只证明包级行为，未接 API/UI、登录或安装。先接收观测与状态机，再明确
持久账本/认证边界，随后推进受限执行、Files/PTY/Docker 和迁移恢复。

来源审查发现 hostmetrics 与 hostobserve 有注释和读取骨架匹配，归属及文件级
Apache 范围仍未决；根 GPL/NOTICE 保持。security 研究树中的 GPL/内核/eBPF
部分不整体纳入。详情见 [复用边界](../gpupanel/BACKEND_REUSE_BOUNDARIES.md)。

测试：`cd backend && go test -race -count=1 ./... && go vet ./...`。
按 [治理状态](GOVERNANCE_STATUS.md) 的接收规则集成；任务交接保留于
`.local/agent-go-migration/`。回退仅撤回相应源码提交，不影响主机数据。
