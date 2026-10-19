# GPUPanel — Operations Center M0 (本机真实回执)

## 产品闭环

入口：左侧「操作中心」(`/operations`)。目标是在不增加新 Agent
执行后端、不绕过现有审批权限的前提下，让用户看见真实的本机受控操作。

本轮的 **Tasks / Pending confirmation / Activity** 是同一份
`GET /api/v1/hosts/operations` 受保护回执的三个视图：

- **待跟进（Tasks）**：有效的 planned、running、failed、unknown。
- **等待人工确认（Pending confirmation）**：仅在服务器返回的
  `planned` 且 `expiresAt` 可解析、严格晚于当前时间时显示；
  过期和无效日期不能进入待确认。
- **全部活动（Activity）**：当前登录会话最近最多 50 条，
  不声称是历史审计全量，也不等同 ACP 长期任务或审批。

界面只查询、不执行任何操作。用户点击「核对」跳转已有
`/host?tab=operations`，由现有 Core/Agent 受控流程重新核对
operation ID、计划 hash、owner/session、过期时间与资源状态后执行。
**本页没有 confirm Mutation、自由命令或 Agent side effect**。

## 权限和数据边界

现有 Core Host Operations 接口仅允许本机 superadmin 登录会话，
拒绝远程 CurrentNode、匿名、API token 和无权限用户，Agent 回执按
当前登录会话隔离；详见 [受控运维契约](../engineering/host-operations.md)。

本页针对非 local node 完全停止请求，显示明确不可用状态；
切回 local 后由 RTK Query 重新取数。连续拉取 5 秒一次，查询失败
不展示缓存回执为「当前结果」，但**不会自动重复任何操作**。
页面卸载和主机切换依赖 RTK Query 的订阅/cancellation；没有自建
计时器、跨节点缓存、浏览器持久令牌或独立 API。

`unknown` 强制提示人工核对；`completed` 不映射成 `verified`。
无法识别的状态按原始字面展示，不猜测成功。不展示执行输出
或原始诊断敏感快照；仅显示现有回执中的 kind/target/impact/status。
任务是现有 Host Operation 收据的投影，**不是新的持久任务表**。

## 演进门槛

未来 ACP Task/Approval/Activity 可以成为第二个明确 opt-in 来源，
但必须先在 GPUPanel **authenticated Core** 完成专门的 scoped
provider API / 身份与会话映射 / 外部 Token 服务端保管 /
授权拒绝测试。不得由浏览器直接访问 ACP、存储其 token、
把运维 planned 当作 Agent approval，或将历史轮询“伪装成”
来自 Temporal 的实时任务。此 M0 切片不引入 ACP 网络依赖。

## 本轮检查

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

`src/utils/operationViews.test.mjs` 验证过期计划、边界时间、
不确定态、不认识的状态、排序和不变更缓存输入。
导航、中文英文语言包、登录保护路由和读失败界面
受 frontend/mainline CI 编译；真实登录 Host 回执 UI 的
浏览器实测仍需在获授权的同版本 Ubuntu VM 上完成，不能凭
单元测试/源码构建标记 G4/G6 或整体 M0 GO。

## 2026-10-19 增量：第二来源 Agent 持久执行任务

现有受保护的 `POST /api/v1/logs/tasks/search` 由 Core 转发到
Agent `task.db` 中的持久 `Task` 记录。应用安装、资源操作等
使用这条已有日志通道；**不是“已安装应用当前状态”**，
也不是 Host Operation 的同一个表和审计作用域。

操作中心的 **Tasks / Activity** 各自显示两个独立、明确标记
数据来源的列表：

1. **Host 受控操作回执（当前会话）**：保留上述权限与有效
   planned、unknown、failed 等原始语义。
2. **Agent 持久执行任务（本机）**：只读调用现有
   `useSearchTasksQuery({page:1,pageSize:20,type:'',status:''})`，
   Tasks 仅展示 `Executing / Failed / Unknown / Canceled`，
   Activity 显示最新查询页里的全部任务。不以应用安装行的
   `Running` 推断某次安装成功，也不根据 task 的 `Success`
   推断 Docker/Compose 独立核验通过。

**重要差异：**Agent Task Log 是本机历史任务视图，并非按 Host
登录会话隔离；仅复用现有 GPUPanel 认证的 Core 任务日志通路，
不新增任何 backend 权限，也不在页面显示 logFile、errorMsg
或原始日志内容。完整回执通过现有受控的
`/logs?tab=task` 查阅。普通用户/多租户授权不能由
这个页面声称已经完成。

两个 API 彼此独立显示加载、失败、重试或空数据；任何一方
查询失败都不能遮蔽另一方的有效数据。远程节点直接跳过
两条 local 查询，切回本机后重新请求。没有后台自动重试
执行，没有将 Agent 任务伪造成可审批，Pending confirmation
仍只从有效 Host `planned` 回执产生。

数据分页边界：Agent 默认仅最近 20 条（可在任务日志页翻页），
Host 当前会话最近 50 条。两者不跨库去重、不合并时间线、
不宣称全量历史。ACP Control Plane 仍未接入。
