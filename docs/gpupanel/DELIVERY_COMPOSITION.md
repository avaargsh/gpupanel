# GPUPanel 产品交付组合（候选 v1，2026-10-19）

> **产品入口优先，独立权威控制，成熟能力复用。** 本页是交付边界与执行优先级，
> 不是跨仓库集成完成声明；真实发布状态以 [STATUS.md](../STATUS.md) 为准。

## 用户与第一价值闭环

- 第一目标用户：拥有 Ubuntu 24.04 单机的 AI/GPU 开发者、个人工作站维护者。
- 第一结果：安全安装 → 登录 → 真实 Host/Docker 观察 → Project →
  可恢复的 Workspace → 本地开发环境。不要求 Kubernetes、Temporal、外部 OIDC。
- 用户切换理由待证：比重新搭建 Linux、Docker、Python/uv、IDE、Jupyter 和应用管理
  更简单；不应使用“功能比 1Panel 多”替代真实用户验证。
- **首发硬门槛**：同一可追溯候选的 G3 安装/升级/回滚、G4 真登录/Host、
  G5 Docker/App 和 G6 恢复。当前 M0 NO-GO；M1 未完成。

## 最终交付组合

| 用户可见交付物 | 仓库与形式 | 权威与职责 | 对 GPUPanel Host 的依赖 |
| --- | --- | --- | --- |
| GPUPanel Host / Workstation | `gpupanel`，Ubuntu 安装包 + React Web + CLI | 本地 Host、Docker、Project/Workspace、App | 无 |
| GPU Compute / Fleet | `gpu-compute-platform`，Go API + Agent + Helm | 多主机 ComputePool/Workload、独立 PostgreSQL；Kueue 负责准入 | 无；未来可选门户入口 |
| Trusted Execution | `agent-control-plane`，SDK/CLI + 可选服务 | 精确计划授权、fence、UNKNOWN 对账、独立证明 | 无；未来高风险操作扩展 |
| AI Factory Acceptance | `ai-factory-engineering`，CLI + Profiles + Evidence | DCGM/NCCL/RDMA/推理 SLO 验收与工件 | 无；未来可选质量门 |

### 支撑性仓库而非同等级首发产品

- `cloud-agent-runtime`：Run/Workflow/Sandbox 参考适配；持久工作流交给 Temporal，
  不在 GPUPanel 中开发第二个 Agent Loop。
- `agent-decision-lab`：可评测的决策能力，不让其写入资源权威状态。
- `agentic-aiops`：真实故障 Golden Incident 的参考应用，不重建控制面。
- `temp-runner`：固定 SHA 的跨仓库验证工具，不承载产品代码。
- `wechat-ahp-client`：移动审批实验；保持 VS Code/AHP 既有 Host 权威，
  真实设备通过前不作为首发组件。
- `lerobot-data-platform`：具身数据领域独立候选产品，不把 Dataset/Episode
  数据模型吸收到通用 GPUPanel；其他垂直应用各自演进。
- 研究 Fork 与实验仓库不自动算作已发行的原创产品。

## 权威边界

1. 浏览器只调用认证 Core；Core 调用经授权 Agent 操作本地 Linux/Docker。
2. GPU Compute 自管多节点资源真相；GPUPanel 只通过有界 API/身份映射展示。
   不让本地 `core.db` 与 Compute PostgreSQL 形成双写。
3. Agent Control Plane 管批准后的精确资源变更，不接管 AHP Channel 状态或
   ACP Provider 运行时。AHP/ACP 兼容适配**尚不是 GPUPanel Host 依赖**。
4. 模型/RAG/IDE 服务首选 Catalog/外部应用集成：Jupyter、MLflow、
   Dify、RAGFlow、Coder 等按真实需求独立选型，不复制其工作流/IDE/知识系统。
5. GPUPanel 源自 1Panel，保留仓库 GPL-3.0 与 NOTICE 原有许可义务；
   不把 Fork 的公开代码等同于 Apache-only 可再许可资产。

## 最近两轮开发控制

**R0 — 只做 M0 Release Evidence：**
- Issue [#69](https://github.com/avaargsh/gpupanel/issues/69) 汇总 G3–G6。
- [#70](https://github.com/avaargsh/gpupanel/issues/70) 安装升级回滚，
  [#72](https://github.com/avaargsh/gpupanel/issues/72) 真实浏览器和恢复，
  [#71](https://github.com/avaargsh/gpupanel/issues/71) AppInstall UNKNOWN。
- 这轮给浏览器和 guest 生命周期回执绑定**安装二进制 SHA-256**及
  **checkout commit**，提供同候选的只读交叉检查：
  `python3 scripts/install-test/candidate_identity.py review`。
  它只做局部回执一致性检查；**不能证明构建来源，也不签发 M0 GO**。
  后续一致性检查还要求浏览器与恢复脚本回执来自同一 QEMU guest
  的伪匿名 machine-id 指纹；不同 guest 的相同二进制不能拼成一次验收。
  该指纹不能防御克隆 machine-id 或伪造回执，仍需独立审核真实 VM。
- 缺 Linux/QEMU、真实 Ubuntu、升级/回滚、Docker/App 和独立观察时继续 NO-GO。

**R1 — 可用的开发者 Workspace：**
- 基于已存在的 Project/Workspace 元数据与用户态 uv 执行器，
  完成明确的 Core Session → Linux UID 绑定、一次性授权、受控回执，
  直到能在真机创建、重新打开、重启恢复同一工作区。
- 不在这一轮加入 Fleet、Kubernetes、多租户、GPU 厂商扩展或通用 Agent UI。
- 任一 Workbench 按钮必须与真实可操作状态对应；NotProvisioned 不能冒充已启动。

## 产品验证门槛

- 让非项目开发者在一次性或全新 Ubuntu 环境独立安装并创建恢复工作区；
  测量失败率、手动修复次数和完成时间。
- 企业 GPU Fleet 优先级由真实共享调度/成本/配额场景驱动；
  不因已经拥有 Go Control Plane 而强制所有 Host 用户安装 K8s。
- 所有外部系统只集成稳定接口，按实际发布版本审查许可、运维升级和退出方案。
- 所有用户功能同时评估 **Install → Use → Observe → Fail → Recover → Uninstall**，
  CI 单元成功与 UI Demo 不等同真实可用。

**变更原则：**先验收 R0，再扩大 R1；仓库合并与项目删除不是本决策的前提。
