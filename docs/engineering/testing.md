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
覆盖验证码/MFA、回执恢复、重复提交拒绝、只读证据界面，以及 vNext 布局、键盘和作用域负向检查，**不能证明真实后端可登录**。
真实安装测试不使用这些 API 拦截。

Go 测试中需要专用 Docker 或 Agent socket 的用例由环境变量门槛控制；缺失时会
跳过。普通 `go test` exit 0 不能把这些跳过项变成 live Docker 通过。

证据按 [索引与保留规则](../evidence/README.md) 精简归档，并运行
`python3 scripts/gpupanel-evidence-budget.py` 检查体积、主题和附件数上限。
同一能力的新结果替换旧附件，不按每次执行无限新建目录。

证据按 `docs/evidence/<日期>/<工作项>/` 组织：记录源码指纹或 SHA、二进制/归档摘要、
环境版本、可复制命令、通过/失败/阻塞/跳过、恢复方式。原始安装日志、账号密码、
私钥、Cookie、数据库、VM 磁盘放 `.local/`，只将脱敏结果发布到文档目录。

Host、First-run 和 Native Catalog 工作流运行各自的 Python 契约检查以及当前
React workspace 的 `pnpm test`、构建和类型检查。跨页面模拟浏览器用例统一由
`gpupanel-mainline.yml` 的 `frontend-baseline` 执行；不再引用已移除的 Vue 测试路径。

历史证据中的 `source_commit=unknown` 仅描述当时未提交的工作区，不代表当前 HEAD。
不可变来源证明和生产验收仍需独立核对；单次本地安装成功不自动完成升级回滚、
完整 Docker/App 生命周期或多租户验收。
