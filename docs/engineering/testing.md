# 测试与证据

运行适合修改范围的检查；只将实际执行结果记为通过。

| 范围 | 命令 |
| --- | --- |
| Python 工具/契约 | `python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v` |
| 前端类型 | `cd frontend && pnpm typecheck` |
| 回执与证据解析 | `cd frontend && pnpm test` |
| React 生产构建 | `cd frontend && pnpm build` |
| Core 包 | `cd core && go test ./... -count=1 -timeout=120s` |
| Agent 包/临时 SQLite | `cd agent && go test ./... -count=1 -timeout=120s` |
| 模拟浏览器 | `python3 scripts/browser/run-react-tests.py` |
| 真实本地安装 | [操作手册](../operations/local-install-test.md) |

浏览器脚本需要 Python Playwright 和 Chromium。`scripts/browser` 中的 API 拦截测试
覆盖验证码/MFA、回执恢复、重复提交拒绝与只读证据界面，**不能证明真实后端可登录**。
真实安装测试不使用这些 API 拦截。

Go 测试中需要专用 Docker 或 Agent socket 的用例由环境变量门槛控制；缺失时会
跳过。普通 `go test` exit 0 不能把这些跳过项变成 live Docker 通过。

证据按 `docs/evidence/<日期>/<工作项>/` 组织：记录源码指纹或 SHA、二进制/归档摘要、
环境版本、可复制命令、通过/失败/阻塞/跳过、恢复方式。原始安装日志、账号密码、
私钥、Cookie、数据库、VM 磁盘放 `.local/`，只将脱敏结果发布到文档目录。

当前根仓库尚无初始提交，不能伪造 `HEAD` 身份。预览归档可能为
`source_commit=unknown`，来源归属检查应继续阻断。不可变来源证明和生产验收需要
另行通过；单次本地安装成功也不自动完成升级回滚、完整 Docker/App 生命周期或多租户验收。
