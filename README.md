# GPUPanel

基于 1Panel 开源实现演进的 Linux/GPU 工作站管理面板。当前工程使用独立 Go Core、
Agent 和内嵌 React 19 前端；保留 Host、Docker、本地应用等现有能力，并加入安装
回执、`UNKNOWN` 状态保护和只读资源证据。

当前是开发版本。源码测试、模拟浏览器、真实本地 VM 安装分别记录，不能互相替代；
**GPUPanel system installation 的完整发布验收仍为 BLOCKED / M0 NO-GO**。单次本地
安装不等于升级回滚、完整应用生命周期或生产多租户已通过。

- [文档入口](docs/README.md)
- [工程目录](docs/engineering/project-structure.md) · [开发指南](docs/engineering/development.md)
- [本机 VM 安装测试](docs/operations/local-install-test.md) · [当前执行结果](docs/evidence/2026-10-16/local-install/RESULTS.md)
- [远程 1Panel 优化整合](docs/gpupanel/LOCAL_REMOTE_INTEGRATION.md)

## 开发与验证

环境：Go 按 `core/go.mod` / `agent/go.mod`，Node 24，pnpm 按
`frontend/package.json`。前端 API 前缀为 `/api/v1`。

```bash
cd frontend
pnpm install --frozen-lockfile
```

只启动前端；后端地址应指向已经验证过的测试实例：

```bash
make dev-web DEV_WEB_HOST=127.0.0.1 PANEL_PORT=19998
```

编译 React、更新 Go embed，再编译 Core/Agent：

```bash
make build_all
```

测试入口与前置条件见 [测试指南](docs/engineering/testing.md)：

```bash
make test-frontend
make test-python
make test-core
make test-agent
```

`make help` 列出构建、验证和 VM 生命周期命令。不要在有旧面板或用户数据的机器
上直接运行 `sudo make install`。本地真实安装在本任务拥有的一次性 VM 中进行：

```bash
make install-test-vm
```

## 运行架构

```text
浏览器 React -> Core 认证/会话/CSRF/代理 -> Agent 私有 Unix socket -> Linux/Docker
```

- Core 处理 `/api/v1/core/*`，其他主机请求经认证边界代理给 Agent。
- 默认面板端口 `9999`，安全入口由安装器生成；验证入口后以 HttpOnly Cookie
  交接到 `/login`。初始密码随机生成，不进入安装日志。
- 本地 Agent socket 为 `/etc/gpupanel/agent.sock`，目录 0700、socket 0600；
  重复实例不能摘除活跃 socket。
- 远程应用源停用。本地应用可发现与提交，已安装资源保留管理；结果不明时禁止
  自动重试。只读证据的一致性不是安装成功或恢复授权。
- AI 草稿入口不连接聊天/执行服务。GPU 硬件和模型服务需对应设备与独立实际验证。

目录中 `build/`、`dist/` 为可再生产物，`.local/` 为本机 VM、凭据与原始日志，均不
入库；源码、锁文件、模板与脱敏证据保留。不要将 `.env.local` 中的秘密放进 `VITE_*`。

## 贡献与来源

遵守 [AGENTS.md](AGENTS.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和
[SECURITY.md](SECURITY.md)。保留根 GPL-3.0 与 [NOTICE.md](NOTICE.md)，独立文件
Apache-2.0 范围由对应清单限定，不代表整个 1Panel 衍生工程重新许可。

