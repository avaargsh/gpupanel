# 治理整改状态（GOVERNANCE_STATUS）

基线：`f5bb5342dbf6c9ab14a96ed2deca6d4d0dd9f6c8`（冻结 base，本任务 worktree HEAD 同值）。
本文件只记录**已观察事实**、待办所有权与验收/回滚准则，不作交付声明。评分：
**I**mpact / **R**isk / **E**ffort，取值 1–5（5 最高）。

## 1. 证据分级（阅读任何 PASS 前先分清）

| 级别 | 含义 | 例子 |
| --- | --- | --- |
| historical | 某日期/某 SHA 的一次性结果，不描述当前 HEAD | `docs/evidence/2026-10-16/local-install/RESULTS.md`、`host-install/RESULTS.md`（`7599fd56c5cd`）、`intel-gpu/RESULTS.md`（`a74e4c51b9e2`） |
| source | 源码/静态/fixture 检查，不含真实登录或安装 | G0/G1/G2 的 CI 结果、`backend/` 只读采集测试 |
| live | 当前 HEAD 在目标环境的真实运行结果 | **本轮没有任何 live 结果** |

历史 VM/真机证据**不得**在本文件或其引用文档中改写为当前 PASS。

## 2. 实际观察基线

本任务在本 worktree 实际执行（只读检查，退出码为实际值）：

| 命令 | exit | 结果 |
| --- | --- | --- |
| `python3 scripts/gpupanel-evidence-budget.py` | 0 | `PASS: 35 evidence files, 366581 / 1048576 bytes` |
| `git diff --check` | 0 | 无空白错误（不含未跟踪新文件） |
| 本地 Markdown 相对链接检查（5 个本任务文档 + 4 个只读入口文档） | 0 | 46 个相对链接全部存在 |

协调者在 `.local/repo-governance/jobs.json` 记录的并行基线（**由协调者执行，本任务未复跑**）：
Python 契约 256 项 exit 0；`frontend` `pnpm install --frozen-lockfile && pnpm typecheck
&& pnpm test && pnpm build` exit 0（20 项）；`agent` `go test ./... -count=1 -timeout=120s`
exit 0（socket/Docker 环境门控用例仍为 skip，不等于 live）；`core` 首次 exit 1
（干净源码树缺 `go:embed` 资产），重跑状态未返回。

**本任务 NOT RUN**：`pnpm typecheck` / `pnpm build`、`cd core|agent|backend && go test ...`、
`python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py'`、
`python3 scripts/gpupanel-release.py build|verify`、`make build_all|deploy`、
浏览器用例、任何 VM/安装/登录/Docker 生命周期。以上**未执行，不构成本轮通过或失败**。

## 3. 分阶段整改与所有权

| 阶段 | 所有者（独占路径） | 内容 | I | R | E | 当前状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P0 文档/契约对账 | documentation（本任务）：`docs/engineering/{project-structure,development,testing,GOVERNANCE_STATUS}.md`、`backend/README.md` | 消除过期目录/命令/模块/后端许可陈述 | 3 | 3 | 1 | 本轮交付 |
| P1 新源码行数与后端门禁 | quality-gates：`scripts/gpupanel-source-policy.py`、`scripts/tests/test_gpupanel_source_policy.py`、`.github/workflows/gpupanel-source-policy.yml` | 新增 Go/Py/TS 源 >500 行失败；legacy 仅信息提示；补 `backend` `go test -race`/`go vet` CI | 4 | 3 | 3 | 进行中，**产物路径尚不可用（pending）** |
| P2 安全审计报告 | security-architecture：`docs/engineering/GOVERNANCE_FINDINGS.md` | 5–12 项带 `path:line` 的优先级发现 | 5 | 4 | 3 | 进行中，**报告尚不可用（pending）** |
| P3 许可范围声明/文档对账 | 协调者：`docs/gpupanel/APACHE_FILE_SCOPE.md`、根 `LICENSE`/`NOTICE` | 见第 4 节，**outstanding** | 4 | 4 | 2 | 待协调者处理 |
| P4 operation 状态机验收 | operation 实现者 + 独立审查（非本任务） | `backend/internal/operation/` `96442b68fe48` 返工后重审 | 4 | 4 | 3 | **blocked：等待独立审查，旧提交不集成** |
| P5 持久化数据迁移 | 迁移所有者（未指派） | GORM 实际迁移所有者、正向迁移、回滚证据 | 5 | 5 | 4 | **blocked：无已验证迁移证据** |
| P6 安装/升级 G3–G6 | 安装所有者（未指派） | 一次性 Ubuntu 24.04 VM 的 preflight/backup/install/回滚 | 5 | 5 | 5 | **NOT RUN / BLOCKED**（见 ROADMAP） |

`hostmetrics` 已由协调者串行集成至 `integration/agent-go-20261016` 的 `c69d036d0455`
（`backend/internal/hostmetrics/`，monitor 独立源码审查 ACCEPT `1acab29ad169`），
协调者复跑 `cd backend && go test -race -count=1 ./... && go vet ./...` 退出 0——
**只证明只读 Host 包**，不证明 API/UI/安装接线；三项非阻断保留意见见
[AGENT_GO_MIGRATION](AGENT_GO_MIGRATION.md)。

## 4. 明确未完成（不得写成已交付）

- **许可范围声明/文档对账 outstanding**：`docs/gpupanel/APACHE_FILE_SCOPE.md` 目前只列出
  6 个 Python 文件级 Apache-2.0；`backend/internal/hostmetrics/*` 的文件级
  `SPDX-License-Identifier: Apache-2.0` 尚未并入该清单，`backend/README.md` 的旧表述
  已在本轮更正为“hostobserve 无 SPDX、hostmetrics 有文件级 SPDX、模块级未核权”。
  **整仓未 Apache 化**，根 `LICENSE`/`NOTICE` 仍为 GPL-3.0 fork 声明；本轮**不做**根重新许可。
- **持久化数据迁移 blocked**：没有已执行的正向迁移与回滚证据；不声称数据可升级。
- **G3–G6、真实 AI 对话、生产多租户、安装**：docs-only / mock / 源码构建证据一律不算交付。
- **CI 覆盖缺口**：`gpupanel-mainline.yml` 的 `backend-safety` 只跑 `core`/`agent`，
  **不跑 `backend/` 实验模块**（补齐归 P1）。
- 已知遗留：`core` 干净源码树因缺 embed 资产首跑失败（exit 1），需先构建前端资产。

## 5. 待发布链接（pending，文件尚不可用时不得当作已验收）

- 安全审计报告：`docs/engineering/GOVERNANCE_FINDINGS.md` — **pending**（P2 产物）。
- 源码策略门禁：`scripts/gpupanel-source-policy.py`、
  `scripts/tests/test_gpupanel_source_policy.py`、
  `.github/workflows/gpupanel-source-policy.yml` — **pending**（P1 产物）。
- 许可范围清单：`docs/gpupanel/APACHE_FILE_SCOPE.md` — 存在，但**第 4 节对账未完成**。
- 操作状态机候选：`backend/internal/operation/` @ `96442b68fe48` — **不在当前树**，blocked。

## 6. 验收 / 移除 / 回滚准则

| 项 | 验收（Acceptance） | 移除触发（Removal） | 回滚（Rollback） |
| --- | --- | --- | --- |
| P0 文档 | 链接检查 exit 0、`git diff --check` exit 0、每条事实有本地源码锚点 | 文档与源码再次分叉且无人维护时重写而非补丁 | 仅回退本轮文档提交，不影响运行 |
| P1 门禁 | 合成 git fixture 单测通过；PR base SHA 与 push before SHA 缺失时显式失败；新文件 >500 失败 | 若上游已有等价 lint，则删除重复实现 | 回退该脚本/workflow 提交 |
| P2 报告 | 每项含 actor/resource/前置条件/denial 测试存在性/下一修复所有者 | 每项修复合入后删除对应条目 | 仅回退报告提交 |
| P3 许可 | 文件级清单与源码 SPDX 一致、独立核权回执可复核 | 核权完成后撤销“pending”标记 | 恢复原清单文件，根许可从未变更 |
| P4 operation | 新 SHA 独立源码审查 ACCEPT + `-race`/`vet` 退出 0 + 拒绝/超时 unknown 测试 | 包被正式替代时整包删除（不留兼容壳） | 只回退该源码提交，不改主机 |
| P5 迁移 | 一次性库正向迁移 + 新旧数据 + 回滚证据 | 迁移稳定后删除临时 backfill | 备份恢复，禁止按日期盲删 |
| P6 安装 | VM preflight/backup/install/首登/权限拒绝/中断恢复全通过 | — | 备份 + 已测回滚，先于任何覆盖 |

当前**没有任何 live 结果**；本文件需在 P1/P2 产物可用后由各自所有者更新其状态行。
