# 全仓治理执行契约

2026-10-16，用户授权继续迁移并治理整改整个仓库。冻结基线
`f5bb5342dbf6c9ab14a96ed2deca6d4d0dd9f6c8`，来源为隔离集成分支
`integration/agent-go-20261016`；主分支未被本轮任务直接修改。

## 分工与执行边界

| 所有者 | 独占范围 | 本轮目标 |
| --- | --- | --- |
| quality-gates | source-policy 脚本、对应测试、专用 workflow | 新增源码 500 行门禁，继承大文件仅列债务；backend race/vet CI |
| documentation | 工程目录/开发/测试文档、backend README、GOVERNANCE_STATUS | 校正实际命令、模块状态、验收和许可边界 |
| security-architecture | GOVERNANCE_FINDINGS | 全仓关键安全/架构路径审计及按风险排序的整改包 |
| operations 原作者 | backend/internal/operation | 关闭独立审查问题、保留 unknown 可观测窗口 |
| 协调者 | 本契约、共享入口、任务调度、复验及串行集成 | 独立验收、来源裁定、跨任务冲突和后续任务 |

前三任务独立 worktree、同基线、15 分钟；operations 保留原 worktree、8 分钟
收尾。每个文件只有一个作者。日志、PID、提示与交接在忽略目录
`.local/repo-governance/` 和 `.local/agent-go-migration/`。限时停止需保留工作，
不能把退出/中断视为验收完成；不无限重试。

## 优先级和验收

先阻断可复现的认证/权限、数据丢失、执行重放和秘密泄露，再收敛 CI、来源和
文档，最后按真实领域拆分遗留大文件。按 Impact/Risk/Effort 记录排序，不按文件
数量判断治理成果。审计须给路径/行号、可达前提、现有否定测试和确切整改门槛。
行为变更先明确 owner、资源、状态机、超时、取消/恢复和 API/数据契约。

每项提交带精确 SHA 和实际命令/退出码；实现者 PASS 后还需独立源码审查、串行
集成、集成 SHA 复验。本轮源构建或 fixture 不证明安装、生产多租户或真实 AI。
现有 G3–G6、旧数据迁移、独立 backend 接线保持原有门槛，不因文档清理升级状态。

## Apache 与恢复

保留 GPL 根 LICENSE/NOTICE 和继承文件归属；新增 SPDX 不等于整仓核权完成。
来源审查发现 hostmetrics 与 hostobserve 有注释/读取骨架匹配，需记录来源并裁定
文件级授权范围，不能继续宣称完全无复用。已接收功能不等于许可审核通过。
不从未知/GPL 研究实现翻译代码，不以换路径、换语言或删声明实现 Apache 转换。

禁止本轮任务部署、改主机服务/容器/数据库、读凭据、清理活跃状态/备份/外来
worktree。保留外部 /api/v1 和持久模式；无兼容 facade、双写或全仓机械重写。
回退限于本轮源码提交；主机、用户数据和恢复材料不随治理清理。

## 已观测基线

主分支 `5fd75f8403ba` 的 Python 契约：
`python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py'`，
退出码 0，256 项通过；只证明本机 Python 契约，不覆盖其他门禁。
frontend/Core/Agent 在集成分支的基线检查已启动，结果待记录。
