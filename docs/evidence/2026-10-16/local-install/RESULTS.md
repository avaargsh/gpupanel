# 本地 VM 安装测试结果 — 2026-10-16

**本轮本地安装与限定 smoke 通过；完整 M0 发布仍为 NO-GO。**
只在本机一次性 Ubuntu 24.04.5 VM 中运行真实安装器，没有在 Ubuntu 26.04.1 宿主机
安装或卸载面板。VM 保留运行，方便本机复核；SSH/面板只转发到 127.0.0.1。

当前工程文件指纹：`6f8f3fd724441649be7eb1ce63a6327987d0b69ed3d3b1535606792afa6eb60d`。范围与摘要见 [文件清单](source-manifest.json)，不包含私有配置与证据目录。

## 被测对象

- 安装候选：`gpupanel-local-20261016-r2-linux-amd64.tar.gz`。
- 归档 SHA-256：`94e994f6a67f810f1862e1634a1943632a85abf1f4d890013c9d1a0d71070f2e`。
- Core：`4138440d34cb8ba2e7d7b9f53e162380db9ba00ccc0c3b9ef52ea11f02b24a07`。
- Agent：`1393df7b88c05d30d13dffdaafdfd35600d9703e28e4cccad0809f284b90fb7b`。
- 安装后二进制摘要与宿主构建产物逐项相符，见 [产物](artifacts.json)、[运行记录](runtime-live.json)。
- 镜像来自官方 20261008 Ubuntu Minimal 24.04，已核对签名清单与固定镜像 SHA-256，
  见 [来源](image-provenance.json) 和 [签名输出](image-signature.txt)。
- 工具环境：go version go1.27.1 linux/amd64，Node v24.21.0，pnpm 12.8.1；
  guest 中 Docker 29.1.3；具体输出见 [环境](guest-environment.txt)。
- 根仓库尚无初始提交，不将远程 main SHA 作为这些本地文件的提交身份。

## 实际通过的检查

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| 全新 VM 安装 | 安装器执行成功；Core、Agent、Docker 均 active；实际浏览器/Unix 健康读取通过 | [脱敏安装日志](install-redacted.txt)、[浏览器](browser-live.json) |
| 安全入口与首次登录 | 已验证入口以 HttpOnly Cookie 交接到 `/login`，随机密码真实登录；未暴露入口 Cookie 给 JavaScript | [浏览器](browser-live.json)、[截图](dashboard-live.png) |
| 访问拒绝 | 匿名 Core/Host/evidence 拒绝；有效会话的合法列表读取成功；错误 CSRF 明确返回 403 | [浏览器](browser-live.json) |
| Core→Agent→Docker 读取 | 真实 Host 信息可读，Docker daemon 的 isExist/isActive 均为 true | [浏览器](browser-live.json) |
| 空已安装应用列表 | 真实响应为 code=200、total=0、items=null；React 正常显示，不误报加载失败 | [浏览器](browser-live.json)、[截图](installed-live.png) |
| 权限 | socket 目录 0700、socket 0600、pctl 0700 | [运行记录](runtime-live.json) |
| 正常重启 | 连续两次 Agent 重启均重新提供真实 Unix HTTP 健康响应 | [运行记录](runtime-live.json) |
| 覆盖拒绝 | 重复运行安装器在预检阶段被拒绝，Core/Agent 进程 ID 未改变 | [运行记录](runtime-live.json) |
| 限定故障与恢复 | guest Agent SIGKILL 后保留异常 socket；在停止服务、确认无活跃 socket 且 inode 未变后，由明确的 fixture 操作员清理并恢复 | [运行记录](runtime-live.json) |
| 保留范围 | fixture 标记文件及用户名/入口设置摘要保持一致；不是所有用户数据的无损升级证明 | [运行记录](runtime-live.json) |
| Go 回归 | Core/Agent 全包通过；需要外部隔离环境的专用用例没有冒充 live 通过 | [Core](core-tests.txt)、[Agent](agent-tests.txt) |
| 原生 socket 竞态检查 | `go test ./server -race -count=1` 通过 | [输出](socket-lifecycle-tests.txt) |
| Python / 目录规范 | 229 项通过，包含忽略规则、文档链接、自有 VM PID 身份拒绝 | [输出](python-tests.txt) |
| React | 类型检查、10 项 Node 测试、生产构建通过；模拟浏览器另行通过 | [构建](build-r2.txt)、[模拟浏览器](browser-simulated.txt) |
| 受限源码预览 | 已用当前源码重新构建并验证结构，仍 installable=false、source_commit=unknown | [验证](preview-verify.json) |

## 安装测试实际发现并修复

1. 第一候选的安全入口直接返回 React HTML，动态路径没有前端路由，真实访问落入
   404。先以 [Go 测试](entrance-unit-before.txt) 和真实浏览器复现，再增加服务器端
   入口验证→HttpOnly Cookie→固定 `/login` 交接；MFA 同样支持读取服务端入口 Cookie。
   未将知道入口等同于已通过用户认证。
2. 后续候选正常停止 Agent 后留下 Unix socket，重启进程反复退出，见
   [失败状态](restart-before.txt)。增加仅针对进程自有监听器的有界正常关闭，保留
   对已有/异常 socket 的拒绝。原生测试及真实双重启、受控崩溃恢复均通过。

每个全新安装候选使用新的 overlay；失败候选已经停止，磁盘与原始日志留在私有
`.local/install-test/` 供复核。测试辅助脚本不在宿主机运行安装器，不共享宿主目录，
不调用全局 pkill 或 Docker prune。

## 已观察到的限制和未执行项

- 运行期尝试获取额外 shell 语言包和 GeoIP 数据失败，见 [资源错误](optional-resource-errors.txt)。
  本轮基本登录/Host/Docker 读取仍通过；不宣称这些可选资源可用，后续需补充可信分发与验证。
- 本轮没有进行真实 GPU、模型提供方、企业多租户、完整 Docker/App 安装卸载、
  安装中副作用/丢失 ACK 恢复、VM/主机升级与无损回滚、远程 CI。受控空闲 Agent 崩溃
  恢复只是 G6 的一个片段，不代表以上门槛通过。
- 工作流 YAML 与 Bash 语法检查不是远程工作流执行；Git 来源归属仍受本地无提交阻塞。
- 宿主机小范围前后核对发现 `/opt/1panel` 从存在变为不存在；本轮没有对该目录执行
  安装、卸载或清理，也没有 VM 共享挂载，**归因未确定**。其余采样路径未变，原有 5 个
  测试进程仍在；不将其表述为“宿主机全部状态未变化”。见 [观察](host-observation.json)。

## 本机复核与停止

面板：`http://127.0.0.1:19998/itest20261016`。
实际随机密码仅在 `.local/install-test/credentials.json`（0600），不在本证据目录。
停止自有 VM 使用 `make install-test-stop`，保留磁盘；重新启动见
[操作手册](../../../operations/local-install-test.md)。

工程组织与文档入口见 [docs/README](../../../README.md)。本轮没有提交、推送或部署远程站点。
