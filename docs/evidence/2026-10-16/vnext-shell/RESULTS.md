# vNext Shell 与工作台结果（历史）

> 历史验收摘要；2026-10-16 精简资料时**未重跑**下列测试。重复日志、逐文件源码清单与多余截图
> 的原附件见 Git `87c64f6ed2a52ea106a2d57a870165c3f1ce54e2`，保留规则见 [归档规则](../../README.md)。

日期：2026-10-16（Asia/Shanghai）。三轮版本锚点：

- 第一轮基线：远程 main `c237280d3a4f614f3360b8a4c35601bdf1d1d270`。
- 第二轮（BioAI 视觉重构）工作区快照 HEAD `bd0ebc50604b551f6ba5c86fe4a27b990475a415`；记录时未提交，
  后由 OpenCode 修复 `ed228acac439`，独立浏览器复验基线 `8ef8abb5713a20be4e824e8e42b3da2a6bb5e7ba`。
- 整合基线 `9fa6e4b5cc2821c4d2159c4d7e845eb5c51f11ec`。
- 源码指纹见 [source.sha256](source.sha256)（91 个改动文件清单的聚合摘要；逐文件清单按其说明从
  冻结基线恢复）。提交后以 PR 精确 HEAD 关联，不把旧 VM 或旧提交的通过结论挪用到当前产物。

## 已实现

- 固定侧栏 240/64px、顶栏 56px、品牌蓝双主题；导航按个人工作站、资源与运维、管理分组。
  第二轮主题令牌重写（浅色墙面 `#f5f7fa`、深色 `#0a0c12`，卡片 `#ffffff` / `#131822`），
  11 个模块入口收敛为 `module-shell` 外壳与全站统一的表格/工具条/分页/空状态原语。
- 开发者首页优先终端、应用模板、近期项目；项目服务未接入时显示不可用、创建按钮禁用，
  不生成示例项目或编造运行状态。真实 dashboard/GPU API 适配与刷新：缺失或非法百分比显示
  未知，刷新失败清除旧观测；GPU 独立 `/gpu` 路由复用原组件。
- `/apps?tab=installed`、`/logs?tab=task` 直达既有页面；旧 Host、容器、数据库、网站、
  OpenResty、AI 高级设置路由保持可达。顶栏显示主机作用域，页面按节点重新挂载，助手草稿随节点清除。
- 修复 Host 终端把 `operateNode` 写死为 local 的问题：HTTP 探测与 WebSocket 均用当前节点。
- 助手默认关闭，右侧原生模态面板可键盘访问、Esc 关闭，仅内存草稿与显式复制，不发送上下文或执行命令。
- 视觉重构修复：`workbench.css` 未挂载、主页失效导入、Eric Meyer reset 覆盖 `font-sans`
  导致的全站衬线回退、27 个缺失 i18n 键（zh/en 现各 1949 键、双向零差集）、5 处手写分页改用
  共享 `TablePagination`（并修掉每页条数无效的真实缺陷）、失效 CSS 与死代码比较清理。
- 设计依据与验收门禁见 [vNext 基线](../../../gpupanel/VNEXT_WORKBENCH.md)、
  [视觉审计](../../../gpupanel/UI_VISUAL_AUDIT_2026-10-16.md)、[领域术语](../../../../GLOSSARY.md)。

## 本地执行（历史，未在本轮重跑）

| 检查 | 结果 |
| --- | --- |
| `cd frontend && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build` | 通过；单元测试 11 → 20 项通过；锁文件未变；构建 index 1368.53 kB / gzip 379.50 kB，CSS 128.09 kB |
| `python3 scripts/browser/run-react-tests.py` | 三组模拟浏览器回归通过（回执 [browser.json](browser.json)） |
| 无头 Chromium 走查（本机 9998 只读模拟 core，注入登录态） | 14 条路由 × 浅/深色，0 页面脚本异常 |
| `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v` | 229 → 246 → 256 项通过（按轮次递增） |
| Core / Agent `go test ./... -count=1 -timeout=120s`、backend `go test -race ./...` | 命令通过；受环境门槛保护的测试不代表真实 Docker/Agent 验收；后端源码自基线未变 |
| `python3 scripts/gpupanel-evidence-budget.py`、`git diff --check` | 通过 |

浏览器覆盖：中英文、浅深色、1440/1280/1024/640px、侧栏折叠记忆、主要内容跳转、键盘搜索、
模态焦点约束与 Esc/焦点返回、项目禁用状态、失败刷新清除旧指标、恢复读取、作用域切换清除草稿、
终端 HTTP 与 WebSocket 目标一致、已安装应用直达，以及安装防重、UNKNOWN 拒绝、MFA、脱敏负向断言。
走查中发现并修复原始 key、双语硬编码、监控页标签与主页悬挂卡片四类问题。

仅保留 [home-dark.png](home-dark.png) 作为模拟 API 视觉示例。**图中主机名、24%/38% 百分比与设备数是
测试夹具数据，不是本机或真实 GPU 测量**；应用实现只读取 API，不内置这些数字。

许可证旁证：`python3 scripts/gpupanel-pnpm-license-evidence.py --output .local/bugfix-integration/pnpm-license-evidence.json`
退出 0，但 `rights_clearance=false`，仅表示证据采集完成，不代表许可证审查完成（合规资料属发布产物）。

## 未完成与证据边界（NOT RUN）

- 未连接真实 core 登录会话（无凭据），未执行真实终端/GPU/容器操作；未改 Go/API/DB/Docker，
  因此未跑 VM 安装、升级回退演练与真实设备验收；模拟夹具初期的错误 JSON 形状属夹具问题，已在夹具侧修正。
- 模拟远程作用域只证明请求参数、缓存与页面行为，不证明远程节点注册或远程执行。
- 未做键盘/读屏自动化（仅人工确认标签与 aria 属性未移除）；远程 CI 以对应提交检查为准。
- 项目/环境持久化接口、四步创建、IDE、重启数据恢复、应用/模型全生命周期及 Wails 宿主尚未完成；
  M0 G3–G6 与产品 10 项整体验收不因 Shell 改动解除阻塞。

## 恢复

本轮无业务数据迁移，未改 schema、已安装服务、宿主机目录或运行中 VM。回退：撤销对应 UI 提交
（或丢弃工作区改动）后重新构建前端嵌入产物；原始补丁与恢复 stash 保留。未执行部署回退测试。
