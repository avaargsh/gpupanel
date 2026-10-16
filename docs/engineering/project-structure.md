# 工程目录规范

按运行责任组织源码，按用途组织文档和工具。保留三个独立 Go module
（`core/`、`agent/` 在役，`backend/` 实验性候选）与现有 pnpm workspace，
不为目录美观改变 API、Go import、数据目录或安装契约。

```text
GPUPanel/
├── core/                    # 认证、会话、Core API、Agent 代理、内嵌 Web
├── agent/                   # 主机执行、Docker、应用与独立状态观察
├── backend/                 # 实验性替换候选模块：只读 hostobserve/hostmetrics
├── frontend/apps/panel/     # React 19 展示、路由、RTK Query 与交互状态
├── catalog/                 # 版本化软件定义、模板、校验清单
├── profiles/                # 开发环境声明；不是执行权限
├── deploy/                  # 构建、安装、卸载、pctl、systemd 模板
├── scripts/                 # 稳定的 gpupanel-* 工具入口
│   ├── tests/               # Python 工具及源码契约测试
│   ├── browser/             # 模拟 API 的 React 浏览器测试
│   ├── install-test/        # 本机一次性 VM 与真实安装测试
│   └── openresty-modules/   # OpenResty 专项诊断
├── docs/
│   ├── engineering/         # 当前开发、目录、测试规范与治理状态
│   ├── operations/          # 安装、运行和恢复手册
│   ├── gpupanel/            # 领域专题与历史整合资料
│   └── evidence/日期/工作项/ # 经过脱敏的执行证据
├── build/                   # 忽略：实际构建、待验收安装 payload
├── dist/                    # 忽略：受限源码预览归档
└── .local/                  # 忽略：VM、密钥、原始日志与本机运行数据
```

- `core/app/api/v1` 与 `agent/app/api/v1` 转换外部请求，不由页面直接提交特权命令。
  `backend/` 没有任何 HTTP/路由/存储，不参与运行链路；实验包不得被当作第二套 API。
- 业务服务放 `app/service`，持久化放 `app/repo`，设备/系统机制放 `utils`；
  新领域文件不因名称相近而跨层共用可变模型。
- Go 测试与对应包同目录；React 纯工具测试与工具同目录；跨页面浏览器场景放脚本目录。
- 不重命名稳定的 `scripts/gpupanel-*.py` 入口；通过 [工具索引](../../scripts/README.md)
  分类，避免破坏文档、CI 和离线用户的复制命令。
- 生成的 Core Web 资源位于 `core/cmd/server/web/`，构建时由 React 产物更新。
  不要删除其 `web.go`、favicon 或 static，也不要将其当作第二套手写前端。
- 不移动已安装主机数据、其他工作区或外部快照；归档和证据移动时同步相对链接。
- `.gitignore` 忽略依赖、构建结果、VM、凭据与本机配置；保留锁文件、模板、源码、
  `.env.example` 和经脱敏证据。不要使用 `git add -f` 将安装密码加入证据目录。
- 目录/命令/模块状态与整改所有权以 [GOVERNANCE_STATUS](../STATUS.md) 为准；
  其中标记 pending 的文件尚不可用，不作为已交付的依据。

根 `.editorconfig` 固定 UTF-8/LF 与 Go/Makefile 的 tab 规则；`.gitattributes` 将
文本行尾与二进制资源区分，避免把编辑器差异混入跨平台提交。
