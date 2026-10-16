# Apache-2.0 后端替换调研：agentaliyun 与 HolmesGPT

日期：2026-10-16。状态：**源码调研与实施建议，未迁移、未删除、未重新许可**。
本文将“Apache 化”解释为采用 Apache-2.0 许可；不代表申请 ASF 孵化。

## 结论

可以朝移除继承的 `core/`、`agent/` 实现推进，但两个候选项目组合仍不是完整替代品。
建议独立实现 GPUPanel 应用后端和受限主机执行器，精选 agentaliyun 已版本化
`client/` 的执行基础；HolmesGPT 只作为可选诊断服务。用户登录、资源授权、
文件管理、Docker/Compose/App Catalog、GPU 观测及数据迁移仍需独立建设。

不能把所有 `agentaliyun` 代码视为 Apache；也不能以删除两个目录作为整个
GPUPanel 已完成 Apache 转换的证明。本轮不改根 LICENSE、NOTICE 或现有服务。
本建议是后续替换方向，尚未取代 ADR-0001 和现行运行契约。

## 1. 调研基线与证据等级

| 工作区 | 当前 HEAD | 工作区差异与限制 |
| --- | --- | --- |
| GPUPanel | `e133f405481e08cc7dd9130e1d87c20e49fbbb97` | 存在前端 shadcn 迁移、浏览器脚本及未跟踪测试修改；本轮保留 |
| `/home/avaarg/workspace/agentaliyun` | `57a0eec76667fcc12855dbf8decc9fc305b00a31` | `?? agent/`；该研究树不受此 HEAD 覆盖 |
| `/home/avaarg/sre/holmesgpt` | `5e983c17f30e93099c7d775167266d4cd1d586c4` | `CLAUDE.md` 已修改；未改动 |

依据：各仓库 `git rev-parse HEAD`、`git status --short`，本地许可证、模块清单及
下文源码路径。agentaliyun 的根 AGENTS 与 HolmesGPT 的 AGENTS→CLAUDE 指引已读取。
本轮由两个只读研究任务分别检查候选，主任务复核关键许可证、鉴权和执行源码。
源码中存在实现不等于当前版本运行通过；无真实模型调用、服务启动或主机修改。

## 2. Apache 转换范围

GPUPanel 根 [LICENSE](../../LICENSE)、[NOTICE](../../NOTICE.md) 仍声明 GPL-3.0
1Panel fork；已有 [转换计划](LICENSE_MIGRATION.md) 和
[四个文件的 Apache 例外](APACHE_FILE_SCOPE.md)，后者不覆盖应用后端或 React 前端。

本轮使用 `scripts/gpupanel-license-audit.py` 的 `inventory(Path.cwd())`，对上述
HEAD 与固定基线 `d9dc5d7aa981c3b04ad284e93420aca9888f7e5a` 比较：

| 范围 | 跟踪文件 | 原路径继承未改 | 原路径继承已改 | 新路径未核权 |
| --- | ---: | ---: | ---: | ---: |
| 全仓 | 1420 | 313 | 575 | 532 |
| core/ | 241 | 71 | 146 | 24 |
| agent/ | 757 | 238 | 413 | 106 |
| frontend/ | 185 | 0 | 2 | 183 |

这些是 Git 来源类别，不是法律结论；新路径不等于独立原创，继承文件也需按实际
版权与许可逐项判断。表格不含未提交修改、依赖、下载资源和最终二进制。
即使排除 core/agent，仍有继承路径、前端来源、图片字体、脚本和产物要审核。
旧依赖审计文档包含 npm/package-lock 历史描述，不能代替当前 pnpm lock 的审查。

ASF 的 [GPL 兼容说明](https://apache.org/licenses/GPL-compatibility.html) 说明兼容方向：
Apache 代码可以进入 GPLv3 作品，不能据此把 GPLv3 派生作品改称 Apache。
正式转换需证明独立实现或取得相应权利人许可，并审核实际分发组合。
[Apache 许可证正文](https://www.apache.org/licenses/LICENSE-2.0) 是采用许可的依据；
ASF 内部贡献者政策不应误当作本项目必须加入 ASF 的要求。

## 3. agentaliyun：优先选择 client，区分三种来源

路径均相对 `/home/avaarg/workspace/agentaliyun/`。

| 候选 | 证据 | 结论 |
| --- | --- | --- |
| 已跟踪 `client/` | `client/LICENSE` 为 Apache-2.0；`testdata/client/source-manifest.json` 记录官方 `aliyun/aliyun_assist_client@8bbe05f476a172f7c7d9233011f7bc80d4f2686b` 与恢复候选来源 | 最优先的源码复用候选，仍要审核本地 patch、vendor、NOTICE 和实际打包依赖 |
| 已跟踪 `controlplane/` | 根及该目录未发现 LICENSE/NOTICE；不能由 `client/LICENSE` 推导其授权 | 可研究设计；复制或分发前补齐权利人与 Apache 授权 |
| 未跟踪 `agent/` 研究树 | `agent/assist-agent/.git` 无可解析 HEAD；monitor README 声明逆向学习、非官方且不可编译；security 多处 GPL-2.0 SPDX | 不整体纳入 Apache 源码或发布包 |

`source-manifest.json` 明确说明恢复提交不继承旧验收结果；上游版本也不是整个
本地 client 的唯一版本。应同时固定外层 HEAD、恢复树、patch 与 vendor 来源。

| 能力 | 实现定位 | 替换价值与缺口 |
| --- | --- | --- |
| 主机任务进程、超时、取消 | `client/agent/taskengine/host/processor.go` 的 `SyncRun` / `Cancel` | 可提取为主机 provider；浏览器不得直接提交特权脚本 |
| 输出分块、终态回执、对账 | `client/agent/taskengine/runningoutput.go`、`finish_v2.go`；`controlplane/{task-store,taskapi,p2contract,p2recon}/` | 适合借鉴 operation ID、重放、丢响应后的对账；receipt 仍不等于业务效果已独立验证 |
| 容器命令执行 | `client/plugin/commander/container/docker/{docker,exec,processor}.go` | 有 exec/attach/inspect，不能代替镜像、网络、卷、Compose 和应用生命周期 |
| PTY/session | `client/agent/session/shell/{shell_linux,shell_unix}.go` | 可复用执行端；控制面 README 将 session relay 列为后续范围，浏览器链路需新建 |
| 文件下发 | `client/agent/taskengine/sendfile.go` | 不覆盖文件浏览、权限、压缩、上传下载与受限路径管理 |
| 注册/心跳/通知 | `controlplane/{registry,scheduler,notifier}/`、`gateway/router.go` | `/luban/*` 实例协议；单机不必引入整套注册调度，不暴露为 GPUPanel 产品 API |
| 本地只读运维观测 | `controlplane/operator/{operator,auth,handlers}.go` | UDS + SO_PEERCRED、UID allowlist、审计值得借鉴；其写入/签名 Slice B 仍标注 BLOCKED_TRUST_BOOTSTRAP |
| 身份与任务所有权 | `controlplane/gateway/`、`task-store/ownership.go` | 实例凭据与任务归属，不是浏览器用户、项目、主机资源授权 |

client 声明 Go 1.20，vendor Docker SDK v24.0.4；GPUPanel 当前两个模块声明
Go 1.26.6。选取源码前需独立编译和依赖收敛，不直接复制旧 vendor 目录。
controlplane 的 PostgreSQL/SQL 迁移体系也不是现有 SQLite/GORM 的替换迁移器。

### 已有 GPUPanel 复用不能遗漏

[host-operations 文档](../engineering/host-operations.md) 已记录参考未跟踪 assist
树的管理/主机操作设计，GPUPanel 独立实现于 `agent/app/hostops/`，并未复制该树。
本轮重新计算两个参考文件 SHA256，与文档一致：

- `agent/assist-agent/controlplane/mgmt/mgmt.go`：`04c720bc65558eebb4d6e7d8820e6ca5d516c1b75b09cebf7098ad6cd98d4e27`
- `agent/assist-agent/controlplane/hostops/host.go`：`08fb64036cd81a0da6f1fb77a6e03592b570eb65c58972da51997fb17668eaa7`

替换后要保留预览摘要绑定、session owner、原子 claim、超时 unknown、查询不重放、
真实 Docker inspect 核验等行为；不能因实现是 fork 新增就自动给它 Apache 授权。

## 4. HolmesGPT：可选诊断服务，不能承担主机控制权限

路径均相对 `/home/avaarg/sre/holmesgpt/`。根 `LICENSE` 为 Apache-2.0；依赖和
图标等资源仍需各自审核。`pyproject.toml` 声明 Python `>=3.10,<3.14`，包含
FastAPI、LiteLLM、OpenAI、Supabase、Kubernetes 等依赖；单机后台不应因此被迫
依赖这些服务。是否调用外部平台取决于所启用功能，不能把清单存在等同于运行必需。

| 模块 | 源码定位 | 建议 |
| --- | --- | --- |
| 工具参数、执行上下文、结构化结果 | `holmes/core/tools.py` | 可作为诊断工具契约来源 |
| 工具注册/筛选 | `holmes/core/tools_utils/tool_executor.py` | 复用诊断工具装配；不能代替资源权限检查 |
| Bash 解析和审批 | `holmes/plugins/toolsets/bash/{validation.py,bash_toolset.py,common/default_lists.py}` | 仅作为额外防线，不视为沙箱 |
| Docker 观测 | `holmes/plugins/toolsets/docker.yaml` | 定义是 Read access；含 ps/inspect/logs 等，无 Docker/Compose/App CRUD |
| 指标/日志诊断 | `holmes/plugins/toolsets/` 中 Prometheus、Grafana、Kubernetes、MCP 等 | 按需启用，限制为授权观测数据 |
| 聊天流和工具审批 | `server.py`、`holmes/core/tool_calling_llm.py` | 可选诊断 UI 的服务端候选，需 GPUPanel 后端转换并控制权限 |

关键安全边界：

- `server.py:421–445` 仅在 `HOLMES_API_KEY` 非空时安装 API-key 中间件。
  共享服务密钥不能替代用户登录和项目授权；接入时必须由后端持有，服务不公开直连。
- `holmes/core/models.py` 的 ChatRequest 接收 `user_id`，`server.py` 将其用于
  工具上下文等；后端必须覆盖为可信身份，不能接受浏览器自报身份决定访问范围。
- `enable_tool_approval=False` 不代表未知命令无条件放行；审批不可交互时存在
  安全错误路径。应保留校验，并由 GPUPanel 独立执行最终授权。
- `bash/common/bash.py` 的 `execute_bash_command` 使用 `shell=True`，以服务
  进程权限执行；超时路径可见 `process.kill()`，不能据此证明子进程组全部终止。
- 聊天 ask、完整命令会进入部分日志路径；inspect/logs 可带秘密。接入前应限制
  采集字段、脱敏、输出大小、日志和模型上下文。首期不给 Holmes Docker socket、
  root 或任意主机 shell，仅提供后端已授权的观测工具。

现有 `tests/test_api_auth.py` 等测试仅是候选验收入口，本轮未执行。
未找到能够替代完整 Files、PTY WebSocket、App 管理、GPU provider、用户/项目
后台、持久操作账本与已有数据迁移的实现证据。

## 5. 目标职责与依赖方向（建议，尚未实施）

目标是单 Ubuntu 工作站，参与者为本机管理员、普通用户、后端、执行器和可选诊断服务。
目录名不决定许可；以下为职责划分，不是要求新增分布式控制面。

```text
React/shadcn -> GPUPanel 应用后端 /api/v1
                 | 身份、资源授权、DTO、业务规则、持久操作账本
                 +-> 受限本地主机执行器 -> Linux / Docker / PTY
                 |      -> 独立观测 -> 回执/审计 -> UI
                 +-> 可选 HolmesGPT -> 授权且脱敏的只读观测
                        -> 建议 -> 后端重新授权及确认 -> 同一受控执行路径
```

应用后端拥有请求身份与操作；执行器仅接受私有 UDS/受认证通道上的类型化命令，
验证目标和能力，不能接受自报 owner header。初期仅明确单机管理员范围，不声称
多租户隔离。Catalog 是声明，不是任意 shell 的执行权限。AI 不可绕过后端执行。

首期 operation 状态：`planned -> running -> completed/verified/failed/unknown`。
确认绑定 owner、资源、参数摘要、过期时间和 operation ID；持久幂等与原子 claim；
超时、进程重启或响应丢失时先观察真实目标再查询/对账，禁止自动重复 mutation。
退出码/finish receipt 与业务 verified 分开记录。取消以操作能力为准，Docker 重启
不承诺自动回滚；审计保存失败不得报告已核验成功。

## 6. 替换与删除顺序

1. **冻结最小产品面与来源清单。** 从前端 `src/api/`、Core/Agent router、CLI 和
   实际使用入口盘点，不只按菜单。首期登录→Host→Files/Terminal→Docker→
   Catalog→恢复；网站/数据库等已暴露 API 须明确保留或单独退役，不能静默删除。
2. **建立独立后端登录与只读 Host 纵切片。** 保留 `/api/v1`、响应信封、Cookie、
   CSRF、401 行为和资源拒绝测试。新实现直接拥有原路由，不新增兼容别名。
3. **落实受限执行与操作账本。** client 进程/PTY基础经许可和依赖审核后选取；
   controlplane 获授权前只研究行为，不复制。先诊断与指定容器操作，再扩展。
4. **补齐不能复用的业务面。** 使用经审核的 Docker SDK/Compose 能力及独立文件、
   Catalog、GPU 观测实现；每一项都通过真实 Ubuntu 行为测试再切换路由所有权。
   Holmes 可后置，缺少模型配置时普通操作仍可用。
5. **数据迁移与部署切换。** 现有 Core/Agent 的 `init/db/db.go`、`init/migration/`
   是 SQLite/GORM 入口；Core 也打开 agent/task/alert 库，不能只迁用户表。
   盘点全部配置、任务、应用安装、监控和审计记录，停写备份，执行有界幂等离线
   转换，并验证旧数据与恢复。密码哈希、加密凭据及会话不能假定可直接沿用。
6. **删除继承后端并审核发行物。** 所有仍受支持路由均已替换、数据库可恢复、
   安装验收通过后，再删除旧模块/import/embed/CI/systemd/package 依赖。
   `scripts/gpupanel-release.py` 仍硬编码两个二进制与 Core Web；需同步替换。
   删除源代码不删除主机数据、备份和版权证据。完成全产物核权后再单独改根许可。

不做双写。源码研发可逐个纵切片验证；实际运行路由只有一个所有者。回退时恢复
经核验的旧二进制/配置及一致性快照；已产生新操作审计后，禁止盲目恢复旧库覆盖
新记录。需要保留并导出新增记录，再按迁移契约恢复。

## 7. 验收与本轮结果

后续必须覆盖：匿名/普通用户/错误 owner/伪造 header/过期确认拒绝；路径穿越与
符号链接；终端断连与进程退出；重复确认只执行一次；服务重启、丢响应、取消与
unknown 对账；Docker/Compose/Catalog 真实生命周期及失败恢复；旧数据前向迁移、
重复运行与恢复。模型输出不能作为主机完成证明。UI 需要加载、空、不可用、错误、
重试、进度、完成、键盘操作及陈旧响应隔离。

| 本轮动作 | 结果 |
| --- | --- |
| 三仓库版本/差异、源码和许可证检查 | 已完成；结果与限制见上文 |
| GPUPanel HEAD 来源统计 | 已运行 inventory，结果见第 2 节；不是完整 SBOM |
| 未跟踪 assist 参考文件 SHA256 | 已复核，与现有文档一致 |
| evidence-budget / 文档链接检查 | 见本轮交付消息中的实际结果 |
| Go / Python 候选业务测试、前端构建、真实 Ubuntu 安装迁移 | **NOT RUN**，本轮仅新增调研文档 |
| 模型调用、Holmes 集成、后台替换、Apache-only 发行 | **NOT RUN / 未实施** |

本轮回退：删除本调研文档及入口链接即可，无运行状态或数据改变。
下一个最小实施项建议为“API/数据/版权清单 + 独立登录/只读 Host 纵切片”，
不是先删除 core/agent，也不是把两个候选整体拷入。
