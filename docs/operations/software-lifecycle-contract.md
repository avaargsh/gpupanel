# GPUPanel 软件生命周期契约

**状态：治理基线 / 待实现与验收。不是安装授权，也不是生产发布批准。**  
系统安装当前仍受 [M0 发布门禁](https://github.com/avaargsh/gpupanel/issues/69)约束；源码编译、单次安装或 AppInstall 卸载通过，均不能替代系统级生命周期验收。

## 1. 生命周期的边界

必须分开管理两类操作，不能互相借用验收结论：

- **系统包生命周期**：GPUPanel Core、Agent、pctl、systemd units、配置、数据库/schema、已安装应用元数据和用户数据。
- **应用生命周期**：Catalog/AppInstall/Compose 管理的具体应用、容器、镜像、网络和卷。

系统包升级不是 AppInstall；卸载某个 App 不等于卸载 GPUPanel；清理二进制不等于删除数据；恢复磁盘快照不等于数据库、Docker 卷与外部副作用都已恢复。

每个操作必须说明边界：操作者/授权主体、唯一目标主机、目标路径、服务与进程、修改的文件/数据库/容器资源、明确排除的资源，以及数据保留策略。

## 2. 操作状态机与不可变身份

每个修改操作必须先持久化唯一 operation ID 和目标身份，再进入下列流程：

```text
REQUESTED
  -> PREFLIGHT
  -> PLAN_REVIEWED
  -> BACKUP_SEALED
  -> APPLYING
  -> VERIFYING
  -> COMMITTED

失败分支：
PREFLIGHT -> FAILED_NO_MUTATION
APPLYING / VERIFYING -> ROLLBACK_PENDING -> ROLLED_BACK
APPLYING / VERIFYING -> UNKNOWN -> RECONCILIATION_REQUIRED
任何无法安全自动恢复的边界 -> RECOVERY_REQUIRED
```

UNKNOWN 表示请求执行结果不确定：它不是成功、不是失败，也不是自动重试许可。必须先用持久操作记录和独立宿主观测完成对账；存在不可逆外部副作用时，可能需要人工处理或前向修复。

每次操作的回执至少绑定：

- operation_id、操作者/授权范围、目标主机身份、创建时间和状态 revision；
- 源码 commit、release version、归档 SHA-256、Core/Agent 二进制摘要；
- 配置生成号、数据库/schema generation、备份/检查点 digest；
- 幂等键或明确的 no-replay policy、并发锁/租约、截止时间和取消结果；
- 执行步骤、独立观察结果、失败分类、补偿/回滚动作及其结果。

Tag、HTTP 2xx、systemd active、子进程退出码或“命令已发送”单独存在时，都不能作为生命周期操作成功证据。

## 3. Install：全新安装

1. **只读 preflight**：验证 OS 与架构、安装包来源/签名与哈希、磁盘空间、权限、端口、用户/组、路径及符号链接、已有 GPUPanel/1Panel 服务/数据、Docker daemon 身份和 schema 兼容性。
2. **规划与批准**：输出将创建/修改/保留的文件、目录、systemd units、用户、端口和数据位置。检测到未知所有权、碰撞或已有安装时默认拒绝；不得提供可跳过关键安全检查的 force。
3. **备份封存**：在任何不可逆修改前保存必要配置与数据，生成可校验的 manifest/digest；证明备份不依赖已被覆盖的文件。
4. **应用与验证**：将经过验证的候选包放入 staging 路径；执行有限权限变更和服务初始化。首次登录、监听地址、认证/CSRF、服务二进制与 unit 目标、数据库初始化及实际健康检查均需独立观察。
5. **失败处理**：在确认无副作用时报告 FAILED_NO_MUTATION；可安全补偿时恢复原状态并证明；结果不确定时标记 UNKNOWN 并禁止自动重放。

全新安装成功只证明新装路径，不证明升级、卸载或恢复。

## 4. Upgrade：版本升级

升级不能复用“全新安装”授权，也不能把重新执行 install.sh 当作升级。

1. 校验签名/发布 manifest 与不可变包摘要；记录当前安装生成号和健康基线。
2. 生成 upgrade plan：版本差异、路径与服务变更、配置变更、数据库迁移、应用数据影响、磁盘峰值空间及回滚条件。
3. **迁移兼容先于切换**：数据库与持久数据遵循 expand → migrate/backfill → verify → contract。只有证明旧二进制能读取新写入的数据且外部副作用可被对账时，才允许将二进制降回旧版本；否则必须选取显式前向修复/恢复计划。
4. 下载到同文件系统的 staging 目录、校验后准备版本化候选；确保候选文件和现有文件不是可变 tag 指针。停服务、切换、重启和健康观察都使用有界时间，保留失败时原始版本。
5. 覆盖断点故障注入：切换前、部分文件准备、数据迁移前/中/后、服务停止、服务启动、切换后确认、进程强杀、重启及 ACK 丢失。
6. 验收 A→B、B 运行时数据写入、B→A 或明确拒绝回退的路径，并逐项比较登录配置、数据库、已安装应用、Docker 容器/卷/镜像和用户项目。

如果 schema 已收缩、格式不兼容或副作用不可逆，禁止盲目二进制回滚。记录采用 forward-fix、隔离或从备份恢复的原因和剩余风险。

## 5. Rollback / Restore：回滚与恢复

快照、数据库备份、配置备份和应用/Docker 数据备份必须分别列明覆盖范围，不得将单个磁盘 digest 当作完整业务恢复证明。

- 对备份生成 manifest 与 SHA-256；检查普通文件、路径所有权、符号链接、目标盘身份、宿主/虚拟机身份和互斥锁。
- 恢复操作应使用 staging + 原子切换；每个提交点之前后都应存在确定且可重试的磁盘/文件布局。
- 进程强杀后重入时，恢复流程必须识别 PREPARED、OLD_RETAINED、NEW_ACTIVE 与 VERIFIED，不能静默覆盖含义不明的盘。
- 恢复后独立观察系统服务、实际运行二进制、数据库可读写性、配置、登录、Docker 资源和用户数据；预期不符时不返回 PASS。
- 备份恢复失败时保留两边可诊断的材料和明确 RECOVERY_REQUIRED，禁止自动删除最后一个有效备份。

一次性测试 VM 的人工快照恢复不是安装器自动回滚，不是 A→B→A 版本升级回滚，也不是完整数据恢复。此差异必须在证据 schema 与文档中保持显式。

## 6. Uninstall：卸载与数据保留

卸载必须拆分成预览计划、产品移除和数据清理三个独立动作。默认保留用户数据。

**默认卸载可移除**：经归属核验的 GPUPanel 自有服务/进程、对应 systemd units、可确认属于本产品的二进制和产品专属运行文件。服务停止或清理失败需作为明确步骤失败记录；不能以“忽略错误”隐藏关键清理失败后报告完整成功。

**默认必须保留**：配置与密钥（应在报告中提醒其敏感性）、数据库、用户项目/workspace、应用持久目录、Docker volumes、用户/应用数据、用户备份。镜像是否删除需单独展示，因为它可能被其他容器共享。

**数据 purge 是第二次、有范围的授权**：先列出规范化绝对路径、设备/inode、所有权、数据大小和预计影响；拒绝根目录、家目录、空路径、符号链接逃逸、越出已批准 GPUPanel data root 的路径。要求已有可验证备份或用户明确确认不可恢复风险；不能仅用一个泛化 purge 开关授权任意路径递归删除。

卸载后通过独立扫描证明：自有 unit/进程/入口已移除；保留的数据与 Docker 资源符合计划；无关服务、进程、容器、卷和网络未改变。随后重装不应静默接管遗留数据，必须要求显式恢复/迁移计划。

## 7. 并发、幂等、安全与审计

所有 host mutation 都应遵守：

- 单主机、单产品生命周期 operation 的串行化锁和 owner 检查；锁超时有界，不能通过 PID 名称猜测来杀死进程。
- 每个操作只对允许的状态转移有效；重复 operation ID、重复提交、冲突目标和过期 revision 在副作用前拒绝或回放同一持久回执。
- 不对 install/upgrade/uninstall/delete 等不确定副作用自动重试。取消/超时后先对账。
- 路径输入必须规范化，在边界拒绝 traversal、符号链接、路径别名、挂载点逃逸和不属于本产品的目标；业务逻辑不拼接特权 shell 命令。
- 证据/日志只输出 allowlist 字段；不能包含初始密码、Cookie、私钥、数据库内容、原始 Docker inspect payload 或完整环境变量。
- 每项结果区分 requested / authorized / applied / independently observed。审计事件记录主体、目标、operation ID、版本与摘要、批准、结果和恢复动作。

## 8. 验收矩阵与发布门禁

| Gate | 必需真实证据 | 负向/中断用例 |
| --- | --- | --- |
| L0 Contract | 状态机、所有权、数据分类、回执与错误语义已冻结 | 缺字段、额外字段、过期 generation、未知状态 |
| L1 Install | 固定签名/摘要候选、干净 Ubuntu 24.04 新装、真实登录和服务检查 | 已存在 1Panel/GPUPanel、路径链接、错误包、磁盘不足、端口冲突 |
| L2 Upgrade | 同一 VM、同一候选链 A→B、DB/配置/用户数据对比 | 每个切换/迁移点强杀、服务启动失败、丢 ACK、重启 |
| L3 Rollback | B→A 的兼容性与恢复结果独立确认，旧盘/备份留存 | 备份损坏、恢复进程中断、旧版本无法读新 schema |
| L4 Uninstall | 计划预览、默认保留数据、无关资源不变 | 权限不足、服务停止失败、伪造路径、symlink、purge 越界 |
| L5 Reinstall/Repair | 数据留存后的重装/显式导入或迁移 | 遗留状态冲突、重放、冲突版本、部分状态未知 |
| L6 Evidence | exact source SHA + package/binary digest + VM OS + 脱敏证据 + 独立审查 | 缺少回执、错误 candidate、证据被篡改、红/绿对照 |

以上每个 Gate 都要求同一精确候选的实际证据；模拟测试可以补充契约覆盖，不能替代真实 VM。当前 G3–G6/M0 的 NO-GO 决定保持不变，直到 [#69](https://github.com/avaargsh/gpupanel/issues/69) 的退出条件逐项满足。

## 9. 当前已知治理缺口

1. deploy/install.sh 是实验性的 fresh-install 路径，默认拒绝且只允许明确授权的 disposable VM；它尚未形成面向生产的完整升级契约。
2. 当前主线的 `deploy/uninstall.sh` 尚不能被认定为完整安全卸载。Draft [PR #194](https://github.com/avaargsh/gpupanel/pull/194) 正在补齐归属绑定的 systemd 服务拆除、drop-in/异常查询的 fail-closed 围栏、嵌套挂载点拒绝和整棵安装目录保留证据；其默认模式**只拆除已验证的 systemd 集成，保留二进制、配置、数据库及用户数据**，并非全量二进制卸载。显式 purge 与同候选真实 Ubuntu 24.04 验收/独立审查仍未接收，不得将 Draft 代码作为主线已通过结论。
3. `deploy/build.sh` 的 release tarball layout 被 Core 的升级代码消费。当前 `UpgradeService.Upgrade` 在异步 goroutine 完成前就返回，文件替换后的 Core/Agent 重启和数据恢复未独立确认；在线 `Rollback` 入口因停服与数据库恢复未验证而被拒绝。该拒绝应保持，直到同候选的升级状态回执、启动/健康对账、DB/schema 兼容和 A→B→A 或明确禁止回退的证据完整；不能把 API 接收请求视为升级已提交。
4. 当前 PR #190 只覆盖一次性 VM 的合成残留清除与安装前快照恢复；不是安装中断故障、系统卸载或 A→B→A 升级回滚证明。
5. 包完整性校验和发布者身份认证是两项独立保证。不能把内层 manifest/自校验 SHA 当作可信发布签名。

## 10. 实施顺序

- **P0**：冻结 operation/state/evidence 契约；修复快照/文件切换的进程中断窗口；合入后在 exact HEAD 重跑全部受影响 CI 和真实 VM。
- **P1**：安装预检计划与签名 release manifest；卸载预览与默认数据保留；拒绝越界删除和外部资源误杀。
- **P2**：真实同 VM A→B→A，覆盖数据库迁移、配置、应用持久数据、重启和断点故障。
- **P3**：默认卸载、显式 purge、数据保留后的重装/修复工作流。
- **P4**：将证据绑定到版本/工件/VM，独立审查和更新唯一的 [STATUS.md](../STATUS.md)。

不要一次性改写全部继承的安装/升级代码；先将每个操作的真实调用链、目标资源与数据 owner 画清，再按 vertical slice 引入实现和可重现测试。