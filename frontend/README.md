# React 前端

`apps/panel/` 是唯一手写前端，使用 React 19、Redux Toolkit / RTK Query。
当前正迁移至 shadcn/ui + Tailwind，分工和验收见
[迁移契约](../docs/engineering/SHADCN_MIGRATION.md)。
依赖由 pnpm workspace 和根 `pnpm-lock.yaml` 管理；没有 npm/Bun 锁文件。

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

- `pnpm build` 生成 `apps/panel/dist/`，不会安装系统服务。
- `make build_frontend` 或 `deploy/build.sh` 将实际产物复制到 Core 的 embed 目录。
- `apps/panel/src/api` 负责 `/api/v1` 视图适配；页面不直接获得 Agent/Docker 执行权限。
- `src/utils/*.test.mjs` 验证回执与证据解析；`scripts/browser/` 使用模拟 API；
  `scripts/install-test/browser.py` 才连接本任务 VM 中真实安装的 Core。
- `.env.example` 可复制为 `.env.local`；`VITE_*` 是公开构建变量，不存密码或提供方密钥。
- 会话由服务端确认；安全入口 Cookie 为 HttpOnly，不由 JavaScript 读取或持久化。

开发和后端连接见 [开发指南](../docs/engineering/development.md)，当前验收结果见
[文档入口](../docs/README.md)。旧构建体积不作为当前版本指标沿用。
