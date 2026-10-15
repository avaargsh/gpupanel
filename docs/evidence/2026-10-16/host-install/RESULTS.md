# 本地真机安装与链路验收（2026-10-16）

结论：当前 vNext 候选包已在本机真实安装。登录 → Core → Agent → 本机终端与
原生 Docker 链路通过，服务更新/重启后账号、测试文件和已成功任务仍可读取。
**不是 VM，不使用模拟 API；不等于全部产品、GPU 开发或 M0 G3–G6 已验收。**

## 精确产物与环境

- 已安装运行代码：`7599fd56c5cd09a46fa2b881709d3141ed6bc8f7`，Go build info 的 `vcs.modified=false`。
- 安装包：`build/gpupanel-v0.1.0-linux-amd64.tar.gz`，SHA-256 `27b1cced21d52b81c5f45cdbbdb0428bd10ab16c6b6ec21e537888929d4cbdf3`。
- Core：`afc3a23e02be50150aa64cdd236d35d87e46345abd45e1c8bac494244d24aa39`。
- Agent：`2b651f4d93f494d85d0f3cb6e13b210ec743819a0470cb118ab3ed213a5e3b9a`。
- Ubuntu 26.04.1 LTS / amd64，按用户明确要求使用 `--experimental-ubuntu-26`。标准 OS 默认门槛仍是 Ubuntu 24.04，实验选项不跳过数据/服务冲突。
- Go 1.27.1、Node 24.21.0、pnpm 12.8.1、Python 3.14.4。
- Agent 使用原生 `unix:///var/run/docker.sock`、Docker 29.9.0；用户默认 Docker Desktop context 保持 `desktop-linux`，两套引擎未混用。
- PCI 显示 Intel Arrow Lake-P / Arc Pro 130T/140T；当前加速器 API 返回 0 个已识别设备，`nvidia-smi` 不存在。

后续提交只完善验收脚本和证据时，不将其 Git HEAD 冒充上述已安装二进制版本。
源码预览另行构建/verify 成功，`source_commit=7599...`，仍为 `installable=false`，
不能把该预览归档当成安装包。

## 安装与恢复范围

原机器没有 `/opt/gpupanel` 业务数据，存在 inactive/disabled 的旧 units、失效链接
和无监听的旧 socket。先核对归属与无数据条件，再执行原件移动 → 原路径恢复 →
inode/字节/链接验证 → 最终隔离，没有删除原件。原始备份位于 root 私有：

```text
/var/backups/gpupanel/host-20261015T175213Z/
```

首次执行真实安装器，参数为：

```bash
--experimental-ubuntu-26 --bind-address 127.0.0.1 --no-auto-provision
```

监听仅 `127.0.0.1:9999`；Core/Agent systemd 均 active、enabled。自动启动配置
通过 Agent unit 保存，最终版本跳过自动防火墙、默认网络、ACME 账户及时间同步。
没有安装或替换 Docker、GPU 驱动，也未停止其他测试进程。

修复候选包更新前停服快照并恢复到私有临时目录，核对二进制字节、SQLite
`quick_check=ok` 和绑定设置；再只替换已核对的自有二进制并启动。备份包括：

```text
/var/backups/gpupanel/installed-20261015T175858Z/
/var/backups/gpupanel/installed-20261015T181101Z/
/var/backups/gpupanel/installed-20261015T181808Z/
```

这些是本次操作员快照/恢复验证，不是自动升级中断回滚验收。确切备份路径以
私有 `redeploy*.json` 为准。安装后发生并发会话修改密码与其他主机操作；用户明确
授权后仅重置本次管理员为新随机密码，再做后续验收，未覆盖其他设置或业务数据。

## 真机发现并修复的问题

1. 安装器只支持 24.04，且名称匹配的 pkill 可能影响其他测试进程：新增仅针对 26.04 的实验选项，保留碰撞检查，移除安装器的名称清理。
2. 默认对外绑定及启动自动配置不适合本机验收：支持首次数据库回环绑定，显式关闭自动配置；已有数据库不被监听种子覆盖。
3. dashboard 真实响应将主机名置于基础元数据、实时指标放在 `currentInfo`，OS 使用 `kernelArch/prettyDistro`：新增适配层、根文件系统选择与实际 DTO 回归测试，未改变外部 API。
4. 本地终端依赖 localhost SSH 凭据，初装报 `no such ssh conn info in db`：改为 Agent 本机 PTY，复用身份/会话/回连机制，最多 16 个本地 PTY；远程 SSH 入口独立保留。
5. Core 监听早于 Agent 就绪，冷启动曾短暂返回 502：安装器现在联合检查 Core 端口与私有 Agent HTTP 健康，测试工具也等待真实就绪。

## 实际执行的链路

`browser-live.json` 的 13 项检查全部通过，无页面脚本异常：

- 匿名访问 Core、主机、应用证据和终端拒绝；真实入口登录、HttpOnly 入口 cookie 通过。
- 无效 CSRF 被拒绝；主机名与操作系统真实节点一致，Docker daemon 可访问。
- 浏览器 WebSocket 终端执行测试命令，宿主机独立读取指定文件核对内容。
- 主动制造一次终端断线后恢复同一 session ID，第二条命令再次写文件并独立核对。
- 通过认证的浏览器会话调用 Core/Agent API 创建专用 Python 容器，UI 容器列表可见，Docker 独立观测 running 与预期日志。
- 停止 → exited、启动 → running、删除 → 无该对象均经独立 Docker 检查；操作绑定确切 ID 和本次 run label，不使用 prune。
- 容器无主机挂载、无发布端口、network=none、非特权、UID/GID 65534、内存 64 MiB、CPU 配额 0.25，使用本机已存在镜像，不拉取未知镜像。
- 4 条容器任务记录达到 Success；应用已安装列表、GPU、任务路由实际可进入。没有声称完成真实应用模板安装。

`runtime.json` / `retention.json` 另核对：两个二进制与构建相同、Agent Unix HTTP
健康、目录/socket/pctl 权限、回环监听、更新后文件/凭据/旧 4 条成功任务保留、
既有容器 ID 与状态保留、Docker 网络不变、其他已知测试进程仍在、测试容器无残留。
IPv4/IPv6 防火墙规则比较仅忽略计数器与生成时间，规则和策略保持相同。
GeoIP 实际文件摘要仍为 `fcad15...c80b`，真实文件查询 8.8.8.8 返回 United States / 美国。

创建、启停、删除由浏览器会话中的真实 API 请求执行；UI 验证了页面及列表。
不把这些 API 操作描述成每个 UI 表单/按钮均已人工验收。

## 本地源码检查

- Python 231 项通过；前端类型、13 项单元测试与生产构建通过。
- Core/Agent 全包 Go 测试通过；Agent server、终端和 API 包的 race 测试通过。
- 两套模拟浏览器回归通过，单独保留为源码/UI 证据，不替代上述真机结果。
- 安装包及源码预览均构建成功，预览 verify 成功；`git diff --check` 通过。

命令与输出见本目录 `*-tests.txt`、`build.txt`、`preview-verify.json`、`artifacts.sha256`。
原始安装输出、失败跟踪、会话、凭据、iptables 快照及完整数据备份只在私有目录。
截图是对应真机页面；容器截图只保存本次测试行，不展示其他项目的容器详情。

## 未验收

Intel 显卡尚未被当前适配器识别，未验证 GPU 计算、CUDA/PyTorch 或模型服务。
Project/Workspace/Session 后端尚未实现，不能创建项目/环境；终端文件保留不等于
项目/Notebook 生命周期。未验证全新 24.04 上的最终版本安装、完整 Compose/App
安装恢复、生产迁移、异常终止升级回滚或企业/远程权限边界。

可选 shell 语言包下载仍有资源不存在日志，停用的上游 App Store 同步仍输出失败
日志；本轮实际主机/终端/容器检查未被阻断，不据此宣称完整应用商店功能可交付。
M0 NO-GO 与此前未通过的完整产品门槛保持不变。
