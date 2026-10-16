# Apache-2.0 后端替换调研：agentaliyun 与 HolmesGPT

日期：2026-10-16。状态：**源码调研结论，未迁移、未删除、未重新许可**。“Apache 化”指采用
Apache-2.0 许可，不代表申请 ASF 孵化。逐项来源/权利明细以
[复用边界](BACKEND_REUSE_BOUNDARIES.md) 为唯一详细表格；产品能力分期以
[迁移映射](AGENT_GO_MIGRATION_MAP.md) 为准。本文只保留结论、证据锚点与顺序建议。

## 结论

可以朝移除继承的 `core/`、`agent/` 实现推进，但两个候选项目组合不是完整替代品。建议独立
实现 GPUPanel 应用后端和受限主机执行器，精选 agentaliyun 已版本化 `client/` 的执行基础；
HolmesGPT 只作为可选诊断服务。用户登录、资源授权、文件管理、Docker/Compose/App Catalog、
GPU 观测及数据迁移仍需独立建设。

不能把所有 `agentaliyun` 代码视为 Apache；也不能以删除两个目录作为整个 GPUPanel 已完成
Apache 转换的证明。本轮不改根 LICENSE、NOTICE 或现有服务；本建议尚未取代 ADR-0001 和
现行运行契约。

## 1. 调研基线与证据等级

| 工作区 | 当前 HEAD | 工作区差异与限制 |
| --- | --- | --- |
| GPUPanel | `e133f405481e08cc7dd9130e1d87c20e49fbbb97` | 存在前端 shadcn 迁移、浏览器脚本及未跟踪测试修改；本轮保留 |
| `/home/avaarg/workspace/agentaliyun` | `57a0eec76667fcc12855dbf8decc9fc305b00a31` | `?? agent/`；该未跟踪研究树不受此 HEAD 覆盖、无版本身份 |
| `/home/avaarg/sre/holmesgpt` | `5e983c17f30e93099c7d775167266d4cd1d586c4` | `CLAUDE.md` 已修改；本轮未改动 |

依据：各仓库 `git rev-parse HEAD`、`git status --short`，本地许可证、模块清单及源码路径
（精确行号锚点见复用边界 §0–§2）。源码中存在实现不等于运行通过；本轮无真实模型调用、
服务启动或主机修改。

## 2. Apache 转换范围

GPUPanel 根 [LICENSE](../../LICENSE)、[NOTICE](../../NOTICE.md) 仍声明 GPL-3.0 1Panel
fork；已有 [转换计划](LICENSE_MIGRATION.md) 和 [文件级 Apache 例外](APACHE_FILE_SCOPE.md)，
后者不覆盖应用后端或 React 前端。

`scripts/gpupanel-license-audit.py` 的 `inventory(Path.cwd())` 对上述 HEAD 与固定基线
`d9dc5d7aa981c3b04ad284e93420aca9888f7e5a` 比较：

| 范围 | 跟踪文件 | 原路径继承未改 | 原路径继承已改 | 新路径未核权 |
| --- | ---: | ---: | ---: | ---: |
| 全仓 | 1420 | 313 | 575 | 532 |
| core/ | 241 | 71 | 146 | 24 |
| agent/ | 757 | 238 | 413 | 106 |
| frontend/ | 185 | 0 | 2 | 183 |

这是 Git 来源类别，不是法律结论；不含未提交修改、依赖和最终二进制。即使排除 core/agent，
仍有继承路径、前端来源、图片字体、脚本和产物要审核。

ASF 的 [GPL 兼容说明](https://apache.org/licenses/GPL-compatibility.html)：Apache 代码可以
进入 GPLv3 作品，不能据此把 GPLv3 派生作品改称 Apache。正式转换需证明独立实现或取得
权利人许可，并审核实际分发组合。

## 3. agentaliyun 概要（明细见复用边界 §0.1、§1、§2）

- `client/`（`client/LICENSE` Apache-2.0；上游 `aliyun_assist_client@8bbe05f…` 经
  `source-manifest.json` 溯源；外层历史是合并快照）是最优先复用候选，能力限于：主机任务
  进程/超时/取消、容器内 exec/attach/inspect、PTY 执行端、文件下发原语。选取前必须逐文件
  过权利闸、依赖闭包与独立编译；浏览器链路、Files 模块和 Compose/应用生命周期都不在覆盖内。
- `controlplane/` 无 LICENSE/NOTICE：仅设计参考（UDS + SO_PEERCRED、uid allowlist、幂等
  重放与丢响应对账、任务归属）；复制或分发前需书面许可。PostgreSQL/SQL 迁移体系不是现有
  SQLite/GORM 的替换迁移器；`/luban/*` 实例协议不暴露为产品 API。
- 未跟踪 `agent/` 研究树：`assist-agent/.git` 无 HEAD；monitor README 自述逆向、非官方、
  不可编译；SPDX 混合 GPL-2.0。整体排除出 Apache 源码与发布包，只作行为证据（能力映射见
  [迁移映射](AGENT_GO_MIGRATION_MAP.md)）。
- Go 版本差异：client `go 1.20`、controlplane `go 1.26.0` vs GPUPanel 两模块 `go 1.26.6`，
  选取源码前必须实测编译，不直接复制旧 vendor 目录。

已有先例：[host-operations](../engineering/host-operations.md) 记录 GPUPanel 对未跟踪
assist 树管理/主机操作**参考设计、独立实现**于 `agent/app/hostops/`；本轮复核两参考文件
SHA256 与文档一致（`04c720bc…`、`08fb6403…`）。替换后要保留预览摘要绑定、session owner、
原子 claim、超时 unknown、查询不重放、真实 Docker inspect 核验等行为；实现是 fork 新增
也不自动获得 Apache 授权。

## 4. HolmesGPT 概要（明细见复用边界 §1-D/§6）

根 `LICENSE` 为 Apache-2.0；依赖（FastAPI、LiteLLM、Supabase、Kubernetes 等）和第三方图标
仍需逐项审核，单机后台不应因此被迫依赖这些服务。定位为可选只读诊断服务，不能承担主机
控制权限。关键安全边界：

- `HOLMES_API_KEY` 共享密钥不能替代用户登录与项目授权；接入时密钥只由后端持有，Holmes
  不对外直连。
- `user_id` 是待验证输入：后端必须覆盖为可信身份，浏览器自报值一律丢弃。
- 允许名单与审批只是额外防线，不是沙箱；`shell=True` 以服务进程权限执行，kill 不证明
  子进程组全部终止——GPUPanel 必须在自己这层做最终授权与进程组回收。
- 聊天 ask、完整命令、`docker inspect/logs` 可带秘密；接入前限制采集字段、输出大小、
  日志与模型上下文。`docker.yaml` 只是 Read access，不构成 Docker/Compose/App CRUD。

其 `tests/test_api_auth.py` 等本轮未执行。未发现能替代完整 Files、PTY WebSocket、App 管理、
GPU provider、用户/项目后台、持久操作账本与已有数据迁移的实现证据。

## 5. 目标职责与依赖方向（建议，尚未实施）

依赖方向、禁止方向与 API 输入权限边界以[复用边界 §3](BACKEND_REUSE_BOUNDARIES.md) 的图
为唯一表述：React/shadcn → 应用后端（身份、授权、DTO、业务规则、持久 operation 账本）→
受限本地执行器 → 独立观测回执；Holmes 仅只读建议，重新走后端授权与同一受控执行路径。
operation 状态机 `planned -> running -> completed/failed/unknown`（verification 独立记录）：确认绑定 owner、
资源、参数摘要、过期时间与 operation ID；持久幂等与原子 claim；退出码 receipt 与业务
verified 分开；审计保存失败不得报告已核验成功。AI 不可绕过后端执行。

## 6. 替换与删除顺序

1. **冻结最小产品面与来源清单。** 按前端 `src/api/`、Core/Agent router 和实际使用入口
   盘点；首期登录→Host→Files/Terminal→Docker→Catalog→恢复；已暴露 API 须明确保留或
   单独退役，不能静默删除。
2. **独立后端登录与只读 Host 纵切片。** 保留 `/api/v1`、响应信封、Cookie、CSRF、401 行为
   和资源拒绝测试；新实现直接拥有原路由，不新增兼容别名。
3. **受限执行与操作账本。** client 进程/PTY 基础经许可与依赖审核后选取；controlplane
   获授权前只研究行为。先诊断与指定容器操作，再扩展。
4. **补齐不能复用的业务面。** 经审核的 Docker SDK/Compose 能力及独立文件、Catalog、GPU
   观测实现，每项通过真实 Ubuntu 行为测试再切换路由所有权；Holmes 可后置。
5. **数据迁移与部署切换。** `core/init/db/db.go`、`core/init/migration/` 是 SQLite/GORM
   入口且 Core 还打开 agent/task/alert 库；停写备份、有界幂等离线转换并验证恢复。密码
   哈希、加密凭据及会话不能假定可直接沿用。
6. **删除继承后端并审核发行物。** 所有仍受支持路由已替换、数据库可恢复、安装验收通过后
   才删除旧模块/import/embed/CI/systemd/package 依赖；`scripts/gpupanel-release.py` 硬编码
   双二进制需同步。删除源代码不删除主机数据、备份和版权证据；全产物核权后再单独改根许可。

不做双写；实际运行路由只有一个所有者。回退恢复经核验的旧二进制/配置及一致性快照；已产生
新操作审计后禁止盲目恢复旧库覆盖新记录。

## 7. 验收要点与本轮结果

后续必须覆盖：匿名/错误 owner/伪造 header/过期确认拒绝；路径穿越与符号链接；终端断连与
进程退出；重复确认只执行一次；服务重启、丢响应、取消与 unknown 对账；Docker/Compose/
Catalog 真实生命周期与失败恢复；旧数据前向迁移、重复运行与恢复。模型输出不能作为主机
完成证明；UI 需完整的加载/错误/重试/进度/完成状态与键盘可达性。

| 本轮动作 | 结果 |
| --- | --- |
| 三仓库版本/差异、源码和许可证检查、GPUPanel 来源统计、参考文件 SHA256 复核 | 已完成，见上文（来源统计不是完整 SBOM） |
| 候选业务测试、前端构建、真实 Ubuntu 安装迁移、模型调用、Holmes 集成、后台替换 | **NOT RUN / 未实施**，本轮仅调研文档 |

本轮回退：删除本调研文档及入口链接即可，无运行状态或数据改变。下一个最小实施项是
“API/数据/版权清单 + 独立登录/只读 Host 纵切片”，不是先删除 core/agent，也不是把两个
候选整体拷入。
