# vNext Shell 与工作台首批结果

> 历史验收摘要；本次仅整理资料，没有重跑以下测试。重复日志、整树清单和多余截图已清理，
> 原附件可从 Git `87c64f6ed2a52ea106a2d57a870165c3f1ce54e2` 找回。保留范围见 [归档规则](../../README.md)。

日期：2026-10-16（Asia/Shanghai）。基线：远程 main
`c237280d3a4f614f3360b8a4c35601bdf1d1d270`。本轮源码由 `source.sha256` 标识；
提交后以 PR 的精确 HEAD 关联，不将旧 VM 或旧提交的通过结论挪用到当前产物。

## 已实现

- 固定侧栏 240/64px、顶栏 56px、蓝色中性双主题；导航按个人工作站、资源与运维、管理分组。
- 开发者首页优先终端、应用模板、近期项目区域。项目服务未接入时显示不可用，创建按钮禁用，不生成示例项目或编造运行状态。
- 真实 dashboard/GPU API 适配与刷新入口；缺失或非法百分比显示未知，刷新失败清除旧观测。GPU 独立 `/gpu` 路由复用原组件。
- `/apps?tab=installed`、`/logs?tab=task` 可直达既有页面；旧 Host、容器、数据库、网站、OpenResty、AI 高级设置路由保持可达。
- 顶栏显示主机作用域；页面按节点重新挂载，助手草稿随节点清除。
- 修复 Host 终端将 `operateNode` 写死为 local 的问题；现在 HTTP 探测和 WebSocket 均使用当前节点。
- 助手默认关闭，右侧原生模态面板可通过键盘访问与 Esc 关闭；显示页面和主机上下文，仅内存草稿和显式复制，不发送上下文或执行命令。
- [vNext 开发基线](../../../gpupanel/VNEXT_WORKBENCH.md) 与 [领域术语](../../../../GLOSSARY.md) 已落档。

## 本地执行

| 检查 | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 通过，锁文件未变 |
| `pnpm typecheck` | 通过 |
| `pnpm test` | 11 项通过 |
| `pnpm build` | 通过 |
| Python 完整工具/契约 | 229 项通过 |
| `scripts/browser/run-react-tests.py` | 两套模拟 API 浏览器回归通过 |
| `git diff --check` | 通过 |

保留的模拟检查摘要见 [browser.json](browser.json)。

新增模拟浏览器覆盖：中英文、浅深色、1440/1280/1024/640px、侧栏折叠记忆、
主要内容跳转、键盘搜索、模态焦点约束与 Esc/焦点返回、助手打开时阻止全局搜索叠层（修复前已复现失败）、项目禁用状态、失败刷新
清除旧指标、恢复读取、作用域切换清除草稿/旧指标、终端 HTTP 与 WebSocket
目标一致、已安装应用直达。旧验证码/MFA、回执恢复、重复安装拒绝、UNKNOWN
拒绝与脱敏证据用例仍运行。无页面脚本异常。

仅保留 `home-dark.png` 作为模拟 API 视觉示例，其余尺寸与语言截图已清理。**截图中的 24%、38%、设备数及主机名称是测试
夹具数据，不是当前机器或实际 GPU 测量。** 应用实现仍只读取 API，不内置这些数字。

## 未完成与证据边界

本轮未改 Go/API/DB，未执行新 UI 的全新 Ubuntu 安装或真实终端命令/GPU 测试；
模拟远程作用域仅证明请求参数、缓存与页面行为，不证明远程节点注册或远程执行。
此前 VM 安装与 GeoIP 报告保持其原有版本含义。项目/环境持久化接口、四步创建、
IDE、重启数据恢复、应用/模型全生命周期及 Wails 宿主尚未完成。

新 GitHub CI 的结果以当前提交对应检查为准，此本地报告不预先标记 hosted CI 通过。
M0 G3–G6 与产品 10 项整体验收不因这次 Shell 改动解除阻塞。

本轮无业务数据迁移；如需回退，可回退此 UI 提交并重新构建前端嵌入产物。
没有更改已安装服务、宿主机目录或运行中 VM，未声称执行过部署回退测试。

---

# 第二轮：BioAI 工作站视觉语言重构（工作区快照，未提交）

> 本页上方章节保留其原版本含义（远程 main `c237280d`）。以下为第二轮的**工作区**结果：
> 记录时 HEAD 为 `bd0ebc50604b551f6ba5c86fe4a27b990475a415`，改动尚在工作区，
> 以[源码指纹](source.sha256)（91 个改动文件）标识；提交后以 PR 精确 HEAD 关联，
> 届时本节的指纹只表示记录时的快照，不代表提交内容。

## 已实现（仅外观与信息呈现，API/鉴权/状态管理未变）

- 主题令牌重写：品牌蓝保持不变（浅色 `#306FE6`、深色 `#7aa5ff`），浅色墙面 `#f5f7fa`、
  深色 `#0a0c12`，卡片 `#ffffff` / `#131822`；去掉渐变洗与全大写分组标题。
- 11 个模块入口统一为 `module-shell` / `module-tabs` / `module-tab-content` 外壳；
  表格卡片、工具条、分页、空状态在全站收敛为同一组原语。
- 页面内联样式清空：仅保留真正动态的四处（`descriptions` 网格列数、ECharts 高度、
  StatCard 颜色、shadcn 原语内部）。静态壳层样式移入 `layout/workspace.css` 与 `pages/workbench.css`。
- 修复三轮前遗留缺陷：`workbench.css` 未挂载、主页失效导入、`.workspace-nav-heading` 大写。
- **修复全站字体回退缺陷**：Eric Meyer reset（未分层）的 `html { font: inherit }` 盖过了
  分层内的 `font-sans`，整个界面回退到浏览器默认衬线字体。字体声明移出层并补齐 Linux CJK 字族。
- **修复 27 个缺失文案键**：`t()` 使用的键在 zh/en 中均未定义，界面直接显示原始 key
  （例：`settings.panel.languageHelper`、`host.monitor.disk`、`cronjob.library.empty`、
  `database.redis.*`、`settings.apikeys.*`）。现 zh/en 各 1949 键、双向零差集。
- 修正错键引用（`cronjob.day` → `cronjob.operate.day`、监控页选择器改用已有的
  `networkLabel`/`diskLabel`，`all` 哨兵值本地化），并把应用商店的硬编码双语串改为 i18n。
- 统一分页：5 处手写分页改用共享 `TablePagination`，同时修掉「每页条数选择无效」的真实缺陷。
- 清理失效 CSS（`host-operations-output`、`app-detail-readme`、`container-log-output` 等）
  与死代码比较（`false || x`、`(a ? 'x' : 'y') === 'x'`）。
- 主页 GPU 快捷入口由半宽悬挂卡片改为整行；顶栏主机作用域去掉与模式芯片重复的一行。

## 本地执行

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @gpupanel/panel typecheck` | 通过 |
| `pnpm --filter @gpupanel/panel build` | 通过（index 1368.53 kB / gzip 379.50 kB，CSS 128.09 kB） |
| `pnpm --filter @gpupanel/panel test` | 20 项通过 |
| 无头 Chromium 走查（模拟 core） | 14 条路由 × 浅/深色，0 页面异常 |
| `pnpm-workspace` 依赖变更 | 无（未新增依赖） |
| `python3 scripts/gpupanel-evidence-budget.py` | 通过 |

浏览器走查使用本机 `9998` 上的**只读模拟 core**（真实响应信封，夹具数据）加注入的登录态，
覆盖 `/`、`/host`、`/host?tab=monitor`、`/containers`、`/databases`、`/websites`、`/openresty`、
`/apps`、`/ai`、`/gpu`、`/cronjobs`、`/toolbox`、`/logs`、`/settings`。走查中发现并修复了
原始 key、双语硬编码、监控页标签与主页悬挂卡片四类问题。保留一张 `home-dark.png`：
**图中主机名、百分比与设备数为夹具数据，不是本机或真实 GPU 测量。**

## 未完成与证据边界

- 未连接真实 core 登录会话（无凭据），未执行真实终端/GPU/容器操作；模拟夹具的
  `apps/tags`、`ai/accounts/providers`、`databases/db/list` 初期返回了错误 JSON 形状，
  属夹具问题、非应用缺陷，已在夹具侧修正。
- 本轮未改 Go/API/DB/Docker/宿主目录，因此未跑 Go 套件，也未做 VM 安装或升级回退演练；
  未做键盘/读屏自动化（仅人工确认标签与 aria 属性未移除）。
- 未提交：改动仍在工作区。回退方式为丢弃前端工作区改动并重新构建；无 schema、迁移、
  业务数据或运行中服务受影响。

## OpenCode 修复与独立集成复验（2026-10-16）

本节更新上文“未提交”状态：原工作区完整保存为 `c67bc597ca83`，
OpenCode 修复为 `ed228acac439`，独立浏览器复验基线为
`8ef8abb5713a20be4e824e8e42b3da2a6bb5e7ba`。修复五处迁移后失效的断言：
恢复按钮语言、GPU 快捷入口数量、深色卡片颜色、Host 名称位置、窄屏 Host 标识。
保留安装防重、UNKNOWN 拒绝、MFA、脱敏与作用域切换行为断言。

协调者独立执行（均退出 0）：
- `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build`：20 项单元测试通过，生产构建通过。
- `python3 scripts/browser/run-react-tests.py`：三组模拟浏览器检查通过；覆盖键盘、深浅色、中英文、1440/1280/1024/640 布局、会话与安装负向场景。
- `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v`：246 项通过。
- Core、Agent 各 `go test ./... -count=1 -timeout=120s`，backend `go test -race ./...`：命令通过；受环境门槛保护的测试不代表真实 Docker/Agent 验收。后端源码自基线未变。
- `python3 scripts/gpupanel-evidence-budget.py`：通过。

最终清除 Header 文件末尾空行并同步文件指纹；不改变行为。完整任务日志及交接保留在
忽略的 `.local/bugfix-integration/`，不新增证据附件。
NOT RUN：远程 CI、真实安装/升级/恢复、线上业务操作与人工读屏审查。
回退：撤销本轮集成/修复提交后重新构建；原始补丁和恢复 stash 保留，未改 schema 或服务。
