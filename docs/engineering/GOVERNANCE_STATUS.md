# 治理状态

更新：2026-10-16。工作分支 `integration/agent-go-20261016`；主分支和运行服务未变。
工程规则见 [AGENTS](../../AGENTS.md)，风险及修复门槛见 [审计报告](GOVERNANCE_FINDINGS.md)。

## 当前工作

| 项目 | 状态 | 负责人 / 下一步 |
| --- | --- | --- |
| Host metrics | `1acab29ad169` 审查 ACCEPT，已集成；race/vet 通过 | 接入 API 时保留逐源状态，只用固定系统路径；内部自定义路径仍有 stat/open 阻塞窗口 |
| operation | `6b600eaf9409` 独立复审 ACCEPT，已纳入集成树；race/vet 通过 | 功能验收完成；变更接线仍受 D1/D2 限制，无执行器/持久账本 |
| 源码门禁 | 候选 `4d47768bfe66`，未接收 | quality-gates：新增源码 500 行限制、backend CI；待独立复验 |
| Core 本地 token | 已确认非空 token 获得认证豁免，修复中 | local-token-auth：真实 token 验证、精确 peer/路径/方法和拒绝测试 |
| MySQL 凭据 | 已确认备份/恢复 argv 含密码，修复中 | mysql-secret-argv：安全传递、失败清理、回归测试 |
| 许可来源 | 未决 | hostmetrics 与 hostobserve 存在注释/骨架匹配；核对归属及 Apache 文件清单 |
| 数据迁移、安装恢复 | 未验收 | 明确 GORM/存储所有者，在一次性 Ubuntu VM 验证迁移和恢复 |

## 本机基线

| 检查 | 版本/条件 | 结果 |
| --- | --- | --- |
| Python 契约 | main `5fd75f8403ba` | 256 项通过 |
| frontend install/typecheck/test/build | 集成树 `58dfb2f4d673` | 20 项通过，构建通过 |
| Agent 全量 Go 测试 | 同上 | 退出 0；环境门控的 Docker/socket 不算 live 通过 |
| Core 全量 Go 测试 | 同上 | 首次缺 embed assets 失败；放入本轮真实 React assets/index 后退出 0 |
| evidence budget | 集成树 | 35 文件，366581 / 1048576 bytes |

命令见 [测试指南](testing.md)。这些结果不证明当前业务登录、远程 CI、安装或升级回滚。
历史证据只对原 SHA/环境有效；未执行的门禁保持 NOT RUN。

## 接收规则与恢复

按权限/数据丢失/重放/秘密泄露风险优先修复。每个任务独立 worktree、固定基线、
单一文件所有者；先测试和独立审查，再串行集成并复验。任务交接与原始日志在
`.local/repo-governance/`、`.local/agent-go-migration/`，限时停止需保留工作。

根 LICENSE/NOTICE 保持 GPL；文件级 SPDX 不代表整仓 Apache 核权完成。
API、持久模式和运行 namespace 按现有契约保持。回退只撤回本轮源码提交；
不清理运行状态、凭据、备份或未提交工作。源码治理不执行部署和主机 mutation。
