# 本地 React 版本与远程 1Panel 优化整合

本轮按用户明确要求，以本地 React 19 / shadcn/ui + Tailwind 版本为主体，保留远程基于
1Panel 的优化。远程固定基线为 `main` 的
`82d34f0518e340fb0077dddd74ee004305ed56c6`，包含 `dev-v2` 的完整历史。
未合并的远程候选分支没有被当成已验收代码自动并入。

## 保留与适配

- 保留当前 React 页面、pnpm workspace、GPUPanel 二进制与数据路径，以及
  `github.com/avaargsh/GPUPanel/{core,agent}` 和 `/api/v1`。
- Core/Agent 远程源文件按上述本地契约适配：安装 TaskID 持久防重、同名准备锁、
  中断安装 `UNKNOWN`、孤立任务受理回执、只读 AppInstall/TaskDB/Docker 证据、
  本地管理员与远程节点拒绝、Docker 名称精确匹配、socket 活跃实例与符号链接拒绝。
- 同步 Compose/备份恢复、网站与防火墙、告警测试脱敏和审计字段、AI Gateway/
  Hermes 版本约束、vLLM 请求指标及迁移、Go 依赖更新和对应后端消息目录。
- 恢复 GPL-3.0、NOTICE、限定文件的 Apache-2.0 声明、只读检查工具、离线 catalog/
  profiles、预览归档边界、负向测试和治理资料。上游真实第三方地址不做品牌字符串替换。
- React 应用商店只发现本地应用，保留已安装应用管理；旧远程应用源保持停用。
  提交前按 Host/App/UUID 保存非秘密回执；取消确认不提交；丢失响应、刷新和并发
  重复提交均保持阻断。`UNKNOWN` 不能通过普通操作恢复成“成功”。
- 接入只读证据抽屉，严格选择已脱敏字段；`CONSISTENT` 不是安装证明或恢复授权。
- 迁移工作站起步/普通操作入口及可选 AI 草稿入口；不连接聊天或执行服务。
  删除首页合成负载曲线，只呈现实际采样值。
- 补齐 MFA、验证码及服务端会话确认；取不到有效登录公钥时拒绝明文降级。
  Host 切换/退出登录清除 RTK Query 缓存，避免跨 Host 保留旧响应。
- 安装器在停止/复制前运行冲突检查，拒绝覆盖现存环境及符号链接父目录；日志权限
  为 0600，初始密码仅打印到终端。pctl 初始凭据载体权限为 0700。
  这些源码修复不构成真实安装、升级或无损回滚验收。

## 验证与证据边界

可复现命令：

```bash
python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v
```

```bash
cd frontend
pnpm install --frozen-lockfile --offline
pnpm typecheck
pnpm test
pnpm build
```

```bash
cd core
go test ./... -count=1 -timeout=120s
```

```bash
cd agent
go test ./... -count=1 -timeout=120s
```

浏览器负向验证使用 Playwright 及模拟 API，运行本任务拥有的 Vite 服务，结束时
仅关闭该服务的进程组。需要本机已安装 Playwright Chromium：

```bash
python3 scripts/browser/run-react-tests.py
```

源码预览构建和结构验证（不会安装或执行二进制）：

```bash
python3 scripts/gpupanel-release.py build --version local-integration-20261015 --offline
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

2026-10-15 的旧整合记录已从当前树清理，可通过治理前主线 `33d6176a51dfb3dccdae1a688ebe645a4f6972d2` 的 Git 历史恢复。该记录不具有当前 main 的验收效力；请查看 [当前状态](../STATUS.md)。
Python 中原先读取 Vue 文件的断言已替换为当前 React 契约；回执与证据解析另有
10 项 Node 可执行测试，浏览器负向场景独立运行。没有将找不到 Vue 文件变成跳过。

vLLM 模型变更通过真实迁移函数，在临时 SQLite 中验证旧数据保留、重复迁移及
离线备份恢复；不代表已安装主机升级已被验证。

**NOT RUN / BLOCKED：**真实 Core+浏览器端到端登录、实际 Docker 安装生命周期、
真实 Unix→Agent→Docker 组合、Ubuntu VM 安装/升级/恢复、远程 CI。本机 Go 测试中
需要隔离 Docker 或 Agent socket 的测试按其显式环境门槛跳过，不记作通过。
CI 配置已经迁移到 pnpm/React/API-v1，但 YAML 解析不等于工作流执行成功。

本地尚无初始提交，预览包 `source_commit=unknown`，来源归档验签检查正确阻断；
不能将远程 SHA 冒充当前文件的提交身份。归档结构验证通过也仍然
`installable=false`，M0 G3–G6 继续 NO-GO。提交并保留远程祖先后，需重建归档，
重新运行来源/依赖归属验证和真实验收门槛，方可讨论发布。

## 回退

本轮开始前的完整源码快照：
`/home/avaarg/GPUPanel-integration-backups/local-before-remote-main-20261015.tar.gz`

SHA-256：`22edf495f41e1340a56f9f9ae624343ba00632aafce8f02f68547d132c2e9eee`。

回退时先保留本轮工作，在新目录解开快照后对比；不要直接覆盖现有目录或删除用户
运行数据。快照不包含 node_modules、Git 元数据及构建目录。没有改动已安装服务、
数据库、Docker 资源或远程分支；本轮没有提交或推送。

历史资料中 Vue/npm/API-v2 和上游运行路径的证据仅属于对应历史基线，不能作为
当前 React 版本的命令或安装验收结论。
