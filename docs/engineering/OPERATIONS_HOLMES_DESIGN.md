# 只读诊断与受控变更

参考 HolmesGPT `5e983c17f30e93099c7d775167266d4cd1d586c4`，仅借鉴契约，未引入代码、依赖或模型服务。
目标：管理员读取有界 Host 诊断；诊断结果不授予变更权限。

## 最小用例与边界

浏览器 → Core 会话/CSRF/资源校验 → 诊断应用服务 → 固定路径采集 → 字段白名单视图。
Core 拥有授权；frontend 只展示；backend 负责采集和结果转换。API 不接收 shell 或文件路径。

| 数据 | 已有包 | 接入要求 |
| --- | --- | --- |
| OS、内存、uptime | `internal/hostobserve` | 保留逐源 Status 与错误 |
| load、PSI | `internal/hostmetrics`（已在集成树） | 直接复用，不重复实现；缺失不填零 |
| 操作状态 | `internal/operation` | 已获功能复审 ACCEPT；未接执行器，不是持久防重放账本 |

结果分维度记录：阶段（accepted/executed/observed）、结果（success/unknown/denied/unavailable/error）、
逐源可用性。阶段与结果不混作互斥枚举，不能以“受理”代替执行成功。
响应使用字段白名单和字节上限；原始日志、命令、凭据不进入视图或未来模型上下文。
取消后停止后续采集并返回明确状态；已有 collector 的读取限制见包说明。

## 变更操作的接入门槛

未来提案必须绑定服务端确认的 actor、resource、operation ID、tool、参数摘要、到期时间及一次性标识。
浏览器或模型的 `owner/user_approved/pending_approval` 不作为授权依据。
签名只能证明真实性；执行前还要原子消费与持久防重放决策。

operation 的 [D1/D2](../../backend/internal/operation/DECISIONS.md) 未落地前不接变更：
清除/重启后必须有持久结果判断是否允许重试；认证生命周期负责回收离开的 owner。
超时 unknown 保留观测窗口；查询不触发执行；执行回执与独立效果观测分别记录。
未知结果不得自动重放，恢复先查询实际资源，再由服务端重新判定。

## Holmes 参考锚点

以下为本地源码观察，不是对整个上游安全性的结论；其 dirty `CLAUDE.md` 不受固定 SHA 覆盖。

| 路径 | 借鉴 / 限制 |
| --- | --- |
| `holmes/core/tools.py:64,96,255` | 结构化结果、调用上下文、敏感上下文隐藏；不照搬其布尔授权 |
| `holmes/utils/approval_tokens.py:64,76,91` | 参数摘要、调用/工具/过期绑定与校验；本轮未建立一次性消费保证 |
| `tests/test_approval_token_security.py:71,102,135` | 伪造审批、参数篡改、跨调用令牌拒绝用例 |
| `tests/test_approval_tokens.py:85,113,129,141` | 签名、过期及算法篡改拒绝用例 |
| `holmes/core/tool_calling_llm.py:807` | 主体工具选择边界需由 Core 权威身份约束 |
| `holmes/plugins/toolsets/bash/bash_toolset.py:260` | 完整命令日志不照搬；shell 转义不等于授权或隔离 |

## 下一切片与验收

先实现模块内只读诊断服务，组合现有两个 collector；不加通用注册表、LLM 循环、令牌服务或执行器。
测试覆盖缺失/畸形/超大/取消、字段白名单、结果维度及不可变快照；未来 HTTP 接线另测未登录、
跨资源和 CSRF 拒绝。变更接线另测审批重放/篡改/过期/异主/改参及持久恢复。
命令：`cd backend && go test -race -count=1 ./... && go vet ./...`。

设计随真实切片落地替换为实现契约；D1/D2 门槛以实际测试和独立审查解除。
根许可不变，文件级 Apache 声明和来源核权见 [治理状态](GOVERNANCE_STATUS.md)。
