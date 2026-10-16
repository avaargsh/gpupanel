# shadcn/ui + Tailwind 迁移契约

用户于 2026-10-16 指定将 Semi Design 前端替换为 shadcn/ui + Tailwind，并要求
多个 OpenCode 并行实施。React 19、Vite、pnpm、Redux Toolkit、路由和 `/api/v1`
保持现有契约；旧 AGENTS 中保留 Semi 的约定已被本次明确指令替代。

基线：`cd6a2cd0d05e16620d0e3b0cbd5bf858d334e392`。当前涉及 84 个 Semi 导入文件。

## 统一基础

官方 shadcn CLI 4.21.5 / `radix-nova`，Tailwind 4.3.3 + Vite 插件，Lucide 图标，
Sonner 提示。`components.json` 定义 `@/components/ui/*`，`@/lib/utils` 导出 cn。
共享组件已由官方 CLI 添加。读取实际组件导出与 props，不按旧 Semi API 猜测。

延续 GPUPanel 中性工作站视觉：蓝色主色 #306FE6、浅色背景 #F7F8FA / 卡片
#FFFFFF，深色背景 #0F1117 / 卡片 #191D26；系统中文字体与 Inter，240/64 侧栏、
56 顶栏、44px 常规表格、10–12px 卡片。全局语义 token 在 theme/globals.css。
亮暗主题使用 html.dark，Redux 是唯一模式来源；不要引入第二套主题状态。

- 直接组合 CardHeader/CardTitle/CardContent、TabsList/TabsTrigger/TabsContent、
  Dialog/Sheet 与可访问 Title、FieldGroup/Field、Table 及 NativeSelect。
- Button 使用 default/outline/secondary/ghost/destructive/link，尺寸 default/sm/lg/icon；
  加载用 Spinner + disabled。输入回调为原生 event，Switch/Checkbox 为 checked 回调。
- SelectItem 在 SelectGroup 内；简单业务下拉可用 NativeSelectOption。空值不能冒充
  Radix SelectItem 的有效 value。输入/日期/数值可以组合现有原生 Input。
- 使用 lucide-react、Sonner 的 toast，不留 Semi 的类型、样式类、变量或适配层。
- 禁止创建 Semi 名称/props 的兼容 facade，禁止 any、ts-ignore、关闭 strict，禁止
  用占位/禁用按钮/空列表换掉原有功能来让构建通过。
- 保留 API hooks、参数转换、校验、分页、选择、确认、回执与未知状态处理。禁止
  将用户命令新增为自动执行，禁止真实操作已有主机/数据库/容器作为视觉测试。
- 新文件 <=500 行；原有超长文件拆成领域内文件，不能复制成新超长文件。

## 并行所有权

各 OpenCode 使用独立 worktree，同一基础提交，一个任务一个分支。只提交自己
负责文件，不修改其他任务目录，不合并/推送或调用外部子代理。包清单、锁文件、
UI primitives、全局 CSS 由协调者唯一维护。

| 任务 | 独占文件 |
| --- | --- |
| shell | src/App.tsx、main.tsx、config/nav.tsx、routes/ProtectedRoute.tsx、layout/、components/ 下现有业务组件（不含 ui/）、theme/index.ts 与旧 semi-override.css、顶层 pages/*.tsx 与 workbench.css |
| workstation | pages/host/、pages/app/、pages/ai/ |
| infrastructure | pages/container/、pages/database/、pages/website/、pages/openresty/ |
| administration | pages/settings/、pages/toolbox/、pages/cronjob/、pages/logs/ |
| 协调者 | packages/lock、Vite、components.json、components/ui/、lib/、theme/globals.css、文档、测试与最终集成 |

领域目录内可新增真正复用的原生组件与 hooks；不得跨目录创建 Semi facade。
需要共享变更时写私有交接请求，由协调者处理。跨领域现有 exports（如
useDebouncedValue、newInstallTaskID）必须保持；消费方不抢改其所属目录。

## 交付与验收

每任务提交：完成清单、精确 commit、修改文件、测试命令/实际结果、未通过或阻塞。
自己范围内 Semi 导入为零；保留真实业务行为。协调者串行合并，再独立验证：

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

此外检查所有路由可达、空/错/加载态、表单与确认、会话/CSRF、UNKNOWN 恢复、
中英文、深浅色、1280/1024 窗口和键盘焦点。更新依赖于 Semi 结构的浏览器断言，
保留其行为断言。模拟 API 不记为真机业务闭环通过。

完整日志和会话仅留 `.local/shadcn-migration`；验收只保留精简结果，不新增整树
清单与成批截图。当前文档是执行契约，不代表迁移已完成。

参考：[shadcn Vite](https://ui.shadcn.com/docs/installation/vite)、
[Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite)。

## 当前执行状态

四个真实 OpenCode CLI 任务已启动，使用独立 worktree 与以下分支：

- `ui/shadcn-worker-shell-20261016`
- `ui/shadcn-worker-workstation-20261016`
- `ui/shadcn-worker-infrastructure-20261016`
- `ui/shadcn-worker-administration-20261016`

集成分支：`ui/shadcn-tailwind-20261016`。运行 PID、OpenCode 会话与交接位置
保存在已忽略的 `.local/shadcn-migration/jobs.json`；完整日志不进入仓库。
每个任务最终应输出自己 worktree 的 `.local/shadcn-task/handoff.json`。

目前仅共享基础与验收门禁已提交，业务替换仍在各工作区进行；尚未合并或部署
本轮迁移。新增的“无 Semi”检查在替换完成前应保持不通过，不能冒充验收通过。
预审已发现确认框异步等待/重复提交、分页状态和标签关联问题，记录在私有
`infrastructure-review-notes.txt`，必须在该任务提交后修正复核。禁止仅按代理
交接中的 PASS 自动合并；需核对文件范围、编译、业务负向检查与实际差异。

### 接续（服务限流后）

最初四个 OpenCode 会话均因服务 `429 FreeUsageLimitError` 退出，没有完成提交，
不能作为已交付任务。已保留全部工作区和原会话。再次连通测试返回 READY 后，
门户工作拆为两个更小的 OpenCode 任务，避免重复全面勘察消耗额度：

| 当前唯一写入者 | 范围 |
| --- | --- |
| OpenCode chrome | App/main/theme index、layout、config/nav、ProtectedRoute |
| OpenCode shell-components | 公共业务组件（不含 primitives/use-confirm-action）、顶层页面与 workbench.css |
| 接续代理 workstation | 原主机、应用、AI 工作区 |
| 接续代理 infrastructure | 原容器、数据库、网站、OpenResty 工作区 |
| 接续代理 administration | 原设置、工具箱、定时任务、日志工作区 |

原 shell 工作区仅保留旧改动，不再作为并行写入者恢复。新 OpenCode 工作区使用
文件系统只读边界保护协调目录；同一目录始终只有一个写入者。业务组提交后可
安排 OpenCode 以只读任务复审，不同时开启第二个实现者。
