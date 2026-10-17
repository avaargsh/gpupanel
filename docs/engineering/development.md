# 开发与构建

使用 Go module 声明的 Go 版本（`core/`、`agent/`、`backend/` 均为 `go 1.26.6`）、
Node 24（`.github/workflows/gpupanel-mainline.yml` 的 `node-version: '24'`）和
`frontend/package.json` 的 `"packageManager": "pnpm@12.8.1"`。
不使用 npm lockfile，也没有根 Bun workspace 或 `go.work`。

## 安装前端依赖

```bash
cd frontend
pnpm install --frozen-lockfile
```

前端是 React 19 + shadcn/ui + Tailwind 的 pnpm workspace
（`frontend/pnpm-workspace.yaml`、`frontend/apps/panel/`），命令必须在 `frontend/` 目录执行，
根目录没有 `package.json`。

纯前端热更新不会启动或改写宿主机已安装服务：

```bash
make dev-web PANEL_PORT=19998
```

Vite 默认监听 `0.0.0.0:4005`；仅本机访问时使用：

```bash
make dev-web DEV_WEB_HOST=127.0.0.1 PANEL_PORT=19998
```

`PANEL_PORT` 必须指向实际后端。真实登录涉及 Cookie、安全入口和 CSRF；完整
部署验收请访问 Core 服务的入口地址，而不是将 Vite 打开算作安装成功。

`.env.example` 只放公开构建选项；需要时复制为 `.env.local`。Vite 的 `VITE_*`
会进入浏览器资源，不能存任何 API 密钥。生产默认 API 前缀为 `/api/v1`。

## 编译与打包

```bash
make build_all
```

该命令编译 React 并更新 Core 的 embed 资源，再编译两项 Go 二进制。
只生成后端可用 `make build_backend`，但它不更新已有前端资源。
注意 `make build_backend` 实际目标是 `build_core_on_linux build_agent_on_linux`
（`Makefile:68`），**不编译实验模块 `backend/`**；`backend/` 只能用
`cd backend && go test -race -count=1 ./...` 之类的模块内命令验证，
不进入发行产物，也没有安装入口。

待验收安装 payload：

```bash
make deploy
```

未设置 `VERSION` 时默认版本为 `v0.1.0`；显式环境变量可覆盖。
产物位于 `build/release/` 和 `build/*.tar.gz`，不能因成功打包就宣称生产可安装。
受限源码预览是另一类产物，不带系统安装授权：

```bash
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
```

## 后端运行边界

当前安装启动需要 `/usr/local/bin/pctl`、数据库初始化、Agent 私有 Unix socket。
不要直接在工作站上运行 `sudo make install` 来绕过冲突检查。使用
[本地安装测试](../operations/local-install-test.md) 的一次性 VM。

宿主机默认仍可能有其他项目、旧 1Panel 或 GPUPanel 数据；`make dev` 会尝试通过
sudo/pctl 拉起已安装后端，因此不作为默认开发入口。源码改动需要重建和重新验收，
不能用旧后端服务的运行状态验证新源码。

## 状态与证据口径

本文件只描述**如何执行**，不代表任何命令本轮已运行。历史 VM/真机结果按
[证据索引](../evidence/README.md) 的 historical/source/live 分级阅读，
当前交付状态、整改所有权与 NOT RUN 清单见 [GOVERNANCE_STATUS](../STATUS.md)。
未执行的命令一律记为 NOT RUN，不改写为 PASS。

## DEV / TEST / RELEASE 分层

- **DEV 快速迭代**：PR 默认运行 Python 合约/单测、React build/typecheck/test、
  Core/Agent Go 安全回归。不得依赖已部署的生产实例来为当前源码背书。
- **TEST 系统联调**：在 `GPUPanel mainline baseline` 里点击
  `workflow_dispatch` 手动跑 Chromium 浏览器负向测试；真实 Host/Docker
  实验继续用现有独立可复现的 Canaries，不作为改文案的前置条件。
- **RELEASE 发布**：创建 `v*` 标签时重新运行完整 baseline + Chromium；
  源码许可、GPL 继承、安装包和环境安全审查仍按发布路径执行。
  CI 模拟通过不能写成真机或发布验收。
