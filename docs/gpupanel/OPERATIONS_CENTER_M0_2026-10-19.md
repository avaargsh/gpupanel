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

## 2026-10-19 增量：按安装任务精确关联 AppInstall 证据

操作中心对 Agent Task Logs 增加 **只读「核对安装资源证据」** 按钮。
只有 `type=App`、`operate=TaskInstall`、`resourceID` 为正的安全整数，
且任务 ID 有效时才显示。调用既有
`GET /apps/installed/evidence/{resourceID}`，不新增执行、恢复或审批 API。

现有 Agent 证据处理只读检查 AppInstall 行、最近的同 resourceID
TaskInstall 回执及 Docker 资源状态，并给出
`CONSISTENT / PARTIAL / CONFLICT / UNKNOWN`。证据响应返回
`taskId`：界面 **仅在它与用户选中的 task.id 完全一致时** 才展示
相关资源快照。因为同一安装可有不同历史尝试，若最新关联任务变更、
资源 ID 对不上或 taskId 缺失，界面只显示「不能归因」，不把其他
任务的结果错认成本次结果。

分类为 CONSISTENT 仍然只代表有限时间点的元数据与容器观测一致，
**不证明健康检查、业务就绪、存储完整性或用户批准安装成功**。
状态为 Success 的任务只在 Activity 作为执行回执展示，
不自动升级为 Verified，也不允许自动重复安装。
证据视图复用原 App Evidence Sheet、`Cache-Control: no-store`
和本机管理员权限边界，查询失败和刷新中隐藏旧快照。

回归测试覆盖：非 App/非 TaskInstall、零或非整数资源 ID、
关联到不同任务、响应缺少 taskId、后台 verified 标志异常、
证据解析边界与不修改原始任务数据。此增量没有服务端迁移，
没有将两个数据库记录写成单一事务或新的审计保证。

真实浏览器登录、当前候选安装升级/回滚、Docker 运行结果与 G3–G6
完整矩阵仍然 **NOT RUN / M0 NO-GO**。

## 本轮增量：真实 Chromium / 模拟 API 浏览器负向验收

`scripts/browser/operations-center.py` 已加入现有
`scripts/browser/run-react-tests.py`，由
`gpupanel-vnext-visual-smoke.yml` 在涉及前端或浏览器脚本的
Pull Request 中运行**真实 Chromium 浏览器**。使用独立的
本地 Vite 页面和受控模拟 Core/Agent API，测试：

- Host 当前会话回执和 Agent 持久任务必须分别呈现；
  `planned` 仅未过期才能待确认，Task `Success` 不能冒充 Approval；
- 当前所选任务与 Agent 返回的最近关联 `taskId` 不一致时，
  **不显示 CONSISTENT 证据**，不将另一次安装归因给旧任务；
- 相同任务 ID/资源 ID 的只读观察必须继续标记为
  **非安装证明**；接口失败或刷新期间隐藏旧快照；
- Host 和任务日志单侧故障不会遮蔽另一来源；
  当前节点切到远程时禁止请求本地专有任务/资源证据；
- 不触发安装、重试、确认等变更类 API；检查窄屏布局，
  不渲染敏感日志、错误消息和环境变量。

浏览器 JSON/screenshot 保存在独立的
`.local/install-test/operations/` 目录并作为 CI 附件；
明确写有 `REAL CHROMIUM / SIMULATED Core+Agent API`，
**不代表真实登录、持久服务、Docker 生命周期或 G3–G6 完成**。

这条证据只对对应 PR 完全一致的构建提交有效。
生产前仍须在同一个不可变候选的获授权 Ubuntu 测试机，
逐项完成安装/升级/回滚、用户登录及越权拒绝、
实际 App/Compose 操作与中断恢复的 G3–G6 联合验收。
