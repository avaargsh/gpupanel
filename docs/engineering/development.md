# 开发与构建

使用 Go module 声明的 Go 版本、Node 24 和 `frontend/package.json` 固定的 pnpm。
不使用 npm lockfile，也没有根 Bun workspace。

## 安装前端依赖

```bash
cd frontend
pnpm install --frozen-lockfile
```

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
