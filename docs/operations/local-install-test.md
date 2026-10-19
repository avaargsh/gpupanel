# 本机一次性 VM 安装测试

在本机 QEMU/KVM 中安装真实 Core/Agent，而不是在宿主机覆盖旧环境。默认占用
2 GiB 内存、2 vCPU 和 12 GiB 稀疏磁盘；仅转发本机回环 SSH 22281、面板 19998。
本轮实际结果见 [执行记录](../evidence/2026-10-16/local-install/RESULTS.md)。

## 前置条件和归属

需要 Linux/KVM、QEMU、qemu-img、OpenSSH、curl、gpgv、Ubuntu cloud image keyring，
以及当前源码的 Go/Node/pnpm。浏览器测试另需 Playwright/Chromium。

`vm.py` 固定使用 Ubuntu 官方 20261008 的 24.04 最小镜像，验证官方签名的校验清单
及固定 SHA-256，然后建立私有 qcow2 overlay。来源：[Ubuntu 镜像目录](https://cloud-images.ubuntu.com/minimal/releases/noble/release-20261008/)。

所有磁盘、SSH 私钥、known_hosts、种子文件和原始日志保存在忽略的 `.local/install-test/`。
辅助脚本在发信号前核对 PID 命令行中的自有磁盘路径，端口占用时直接拒绝，不会停止
别的监听进程；不在宿主机安装任何面板服务，也不清理其他 VM。

## 准备与构建

```bash
make install-test-vm
```

```bash
VERSION=local-dev ./deploy/build.sh
```

`build/*.tar.gz` 是包含安装器的候选包。`dist/gpupanel-preview.tar.gz` 是只含
二进制、许可和清单的源码预览，不能用于下面的系统安装。

## G3 安装前离线磁盘检查点（必须停机）

此前操作指南要求准备恢复快照，但没有可验证的检查点生成入口。
现提供任务专属 VM 的 `checkpoint` 和 `verify-checkpoint`，使用
`qemu-img convert` 生成**不再依赖 Ubuntu backing image 的独立 QCOW2**。
它检查固定 Ubuntu 镜像的来源声明与实际 SHA-256、任务 VM 原始 backing
路径、目标磁盘格式/容量，并以 SHA-256 封存私有检查点。

在首次安装之前、完成 guest 必要的软件准备后，停止**本任务的 VM**，
不要对运行中或其他人拥有的磁盘做在线复制：

```bash
python3 scripts/install-test/vm.py stop
python3 scripts/install-test/vm.py checkpoint
# 从上一步输出读取真实 checkpoint-... 名称；不可自行猜测或复用旧名称
python3 scripts/install-test/vm.py verify-checkpoint 'checkpoint-YYYYMMDDTHHMMSSZ-xxxxxxxx'
python3 scripts/install-test/vm.py start
```

`checkpoint` 不覆盖已有磁盘，失败时保留未封存目录供排查。
`verify-checkpoint` 会复核检查点的实际文件 SHA-256、QCOW2 结构及
无外部 backing；校验结果中 `installation_approved=false`、
`restoration_tested=false` 是固定且重要的状态。

生成检查点只提供**可供后续恢复测试的候选数据**，既不是自动回滚，
也不代表已通过中断升级、核心数据库恢复和真实重启的 G3/G6 门禁。
恢复前要另外确认 VM 关闭、目标所有权与重放风险，并独立验证
服务、数据和二进制摘要；不得用这些命令覆盖工作/生产主机。

## 传包与安装

先在新 VM 中准备 Docker（以下 apt 命令仅在 guest 中执行）：

```bash
python3 scripts/install-test/vm.py ssh -- sh -c 'sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2'
```

以下以 `VERSION=local-dev` 的归档名为例，实际名称以构建输出为准：

```bash
python3 scripts/install-test/vm.py copy build/gpupanel-local-dev-linux-amd64.tar.gz
python3 scripts/install-test/vm.py ssh -- tar -xzf /tmp/gpupanel-local-dev-linux-amd64.tar.gz -C /tmp
```

**G3 实验授权边界**：新版 `install.sh` 默认拒绝安装，且在拒绝时不会执行
安装包提供的 Python。运行下面命令之前，必须人工确认这是本工具专属、
未安装过 1Panel/GPUPanel 的 Ubuntu 24.04 **一次性 VM**，已有可恢复的
qcow2 快照/独立备份，且已经审核本次源码 SHA、构建产物与解包内容。
仅有镜像校验不等于安装包签名；本流程不为真实工作站授予安装权限。

先在 guest 中**以非 root 身份**执行已审核安装包的只读 preflight，
查看完整 `checks` 与 `blockers`，包括 OS、路径碰撞和磁盘状态：

```bash
python3 scripts/install-test/vm.py ssh -- python3 /tmp/gpupanel-local-dev-linux-amd64/gpupanel-install-preflight.py --json
```

这里的 `installable=false` / `safe_to_install=false` 是诊断器设计上的
恒定结论，不能解释为安装已获批准。如果任一必需检查不是 PASS，
或碰撞路径、已有面板进程和宿主所有权不明确，**不得继续**。

确认环境和快照后，**仅在上述隔离 guest** 中显式执行实验安装入口。
`--approve-disposable-vm-install` 是测试操作者的声明，不会绕过
安装器的 BLOCKED/UNKNOWN 必需检查；不得用于生产或现有工作主机。
日志包含首次随机密码，必须保存在私有目录：

```bash
umask 077
python3 scripts/install-test/vm.py ssh -- sudo /tmp/gpupanel-local-dev-linux-amd64/install.sh --approve-disposable-vm-install --entrance itest-local > .local/install-test/install.raw.log 2>&1
python3 scripts/install-test/record_credentials.py
```

初始密码保存在 `.local/install-test/credentials.json`（0600），不要提交或复制到证据。
当前安装器拒绝已有环境，重复执行不等于升级；不要删除 guest 数据后伪装为回滚成功。

## 真实浏览器及负向检查

```bash
python3 scripts/install-test/browser.py
```

脚本检查本任务 VM 的真实入口、登录 Cookie、匿名拒绝、Core→Agent Host/Docker
读取、无效 CSRF 拒绝和已安装应用页面；没有 `page.route` 或模拟 API。
它验证单机单管理员的这一条路径，不验证硬件 GPU、远程节点或企业多租户。

访问地址为 `http://127.0.0.1:19998/<entrance>`，以私有凭据文件中的入口为准。
宿主机 19998 转发到 guest 9999；安装器输出的 guest 内网/外网地址不代表宿主机公网
开放端口。浏览器打开一次入口后由服务端跳转到 `/login`。

## 生命周期与冲突负向测试

```bash
python3 scripts/install-test/runtime.py
```

该脚本只针对本任务 VM：核对安装二进制摘要、连续正常重启、检查权限、确认重复
安装被拒绝；随后主动 SIGKILL Agent，验证异常 socket 保留，再在服务停止、socket
无活跃连接且 inode 一致时执行明确的测试操作员清理与恢复。它不改变产品对异常
残留的拒绝策略，也不代表安装中应用副作用或升级回滚已完成验收。

正常 SIGTERM/SIGINT 会关闭进程自身创建的监听器，允许正常重启；异常终止仍需
核对资源所有权后人工处理。真实测试需要健康 API 响应，不能只看 systemd 刚进入 active。

## 停止与保留

```bash
make install-test-status
make install-test-stop
```

停止尝试 guest 正常关机，再按所有权校验回收自有 QEMU；保留磁盘供复核。
不执行通用 `pkill`、Docker prune、宿主机卸载或清理其他任务目录。
再次启动同一磁盘保留数据库和安装状态。新一轮全新安装应在停止 VM 后另存现有
实例目录，再建立新的 overlay；不得对运行中的磁盘直接改名或覆盖。

发布前还需要独立证明备份、完整 Docker/App 生命周期、中断升级与无损恢复。
本地 VM 成功不自动使 M0 全部 GO，也不替代不可变 Git 来源与远程 CI。

## 单一不可变候选：G4 浏览器 → G6 恢复前置门禁

从本次切片起，`browser.py` 和 `runtime.py` 不再仅仅因为服务
`active` 或页面返回 200 就允许累计 G4/G6 证据。

- **当前源码必须是干净 Git 工作树**：读取 `git rev-parse HEAD`，
  拒绝未提交和未跟踪源码改动；忽略目录下的私有 VM 状态除外。
  源码哈希不是安装包发布签名。
- **本机生成的两份二进制都必须匹配当前 VM**：对
  `build/gpupanel-core`、`build/gpupanel-agent` 与客体
  `/opt/gpupanel/gpupanel-{core,agent}` 分别计算 SHA-256，
  只要任一缺失、为符号链接、摘要格式错误或不一致，就在浏览器
  登录前拒绝验收。
- **浏览器仍连接已安装的真实服务，无 API mock**。在已有登录、
  匿名拒绝、CSRF 拒绝、Host/Docker 与已安装应用的检查之外，
  访问 `/operations`，核验 **真实 Core Session** 下
  `GET /hosts/operations` 和经 CSRF 保护的
  `POST /logs/tasks/search` 返回受支持列表，禁止页面暗中
  发起执行/审批/安装重试类请求。保存只含受限布尔断言、
  源码 SHA 和两个二进制摘要的 `browser-live.json`；不保存
  操作回执原始内容、凭据或任务日志。
- **恢复脚本在第一次修改 Agent 服务之前**，检查当前洁净候选
  与浏览器记录的源码/二进制相同，并重新读取 VM 中的两个
  已安装二进制及客体 machine-id 的 SHA-256。任一证据缺失、
  属于另一份源码或另一台客体，拒绝执行后续故障注入。

在获授权的当前一次性 Ubuntu 24.04 VM 上，顺序执行：

```bash
# 首先按本页完成固定候选构建、G3 安装和私有凭据保存
python3 scripts/install-test/browser.py
python3 scripts/install-test/runtime.py
```

此顺序不允许用某一天的旧 CI PASS 代替当前 VM 二进制指纹。
必须审阅 `.local/install-test/browser-live.json` 和
`.local/install-test/runtime-live.json`，确保两者的
`candidate.source_sha`、`candidate.binary_sha256` 与客体
`guest_machine_id_sha256` 完全一致；检查所有服务/资源操作
是否真实由已安装版本完成，之后再制作/核对独立恢复证据。

以上仍**不构成完整 G3–G6 通过**：没有自动完成升级回滚、
真实 App/Compose 安装/卸载、磁盘满/下载中断、用户 Workspace
恢复，也没有独立操作员放行。CI 的单元测试只验证门禁拒绝逻辑，
不冒充实际运行的 KVM 或 Ubuntu VM。

## 2026-10-19 增量：真正运行的 GitHub Actions QEMU/KVM 试验流水线

新增 `.github/workflows/gpupanel-real-ubuntu-vm.yml`。
与只使用 mock API 的 Chromium smoke 不同，这条工作流将在**独立
GitHub Actions Ubuntu 24.04 x86 runner** 上自行构建安装包，然后：

1. 显式确认有可用的 `/dev/kvm`；没有硬件虚拟化直接标记
   **BLOCKED**，不切换纯模拟器后声称已经通过；
2. 下载固定版本 Ubuntu minimal cloud image，按 Ubuntu 官方
   签名清单及固定 SHA-256 验证，建立专属 QEMU/QCOW2 guest；
3. guest 内安装 Docker（不在 GitHub runner 宿主安装
   GPUPanel 服务），生成并复验断电状态的独立 QCOW2 检查点；
4. 从此次 CI checkout 的准确源码构建完整 Release 包，在
   guest 执行独立预检，确认关键检查 PASS 后显式选择
   `--approve-disposable-vm-install`；
5. 进入真实 Web/浏览器登录验证、受认证保护的 Host/Docker、
   Operations Center、安装任务列表及 CSRF 拒绝；
6. **同一源码和同一组已安装 Core/Agent 二进制**完成 guest
   正常重启、受控 Agent 崩溃与人工 fixture 恢复；
7. 只上传脱敏 `ci-evidence.json`，始终将整个 M0
   `m0_release_decision` 固定为 **NO_GO**。

工作流仅使用无写入权限的 checkout，禁止上传 VM 私钥、
disk、随机初始化密码、原始日志和浏览器截图。私有内容全部在
CI 作业结束时丢弃，额外执行本任务自有 QEMU 的优雅停止。
它有 75 分钟硬超时，提交来自外部 fork 的 PR 不启用特权 VM 作业。

运行范围是**完整真实运行链路的一部分**。即使步骤全部 PASS，
也只能表示这一独立 CI runner 的 G3 fresh install、G4 浏览器
和 G6 Agent 恢复片段；**不代表**真实 App/Compose 的 G5
完整生命周期、升级/回滚、磁盘损坏恢复、真实 GPU、
用户 Workspace 持久化或独立人工验收。

PR 自动触发与 VM 代码路径相关的变更；手动
`workflow_dispatch` 可在主分支重新运行，但必须将实际
工作流 Run ID、checkout Commit SHA 与红acted evidence
保存并绑定，不复用历史其他版本的 PASS。作业因网络镜像、
KVM 设备、Docker 包、guest 启动或服务权限失败时，
状态必须明确是失败/阻塞，不能以自动跳过算作 GO。

## 2026-10-19 — Offline Docker Compose 实机片段（不是 AppInstall 验收）

继 G3 新装 / G4 真实浏览器 / G6 Agent 受控恢复的同候选实机证据后，
新增 `scripts/install-test/compose-live.py`，只有在**同一洁净源码、
同一个客体 machine-id、浏览器成功、Agent 恢复成功**后才调用
`scripts/install-test/compose-fixture-guest.py`：

- 仅在专属 guest 内从 `busybox-static` 和 `FROM scratch` 本地
  构建容器映像，`--pull=false`，Compose 明确 `pull_policy: never`。
  没有远端 registry，也没有需要下载的应用镜像。
- 随机、独立 Compose project；容器 `network_mode: none`、
  无 host port、只读 rootfs、禁用 Linux capabilities 和
  privilege escalation。只挂载 guest 临时目录的只读 marker 文件。
- 真实 Docker/Compose `up → inspect → logs → stop/start → restart →
  文件重新读取 → down → 确认容器移除 → 清理本地镜像`。
  测试仅清理自己随机命名的资源，绝不做全局 Docker prune。
- 严格校验脱敏证据里的项目所属候选与客体身份，任一动作失败、
  状态与资源不一致或清理未完成，都不能标记
  `offline_docker_compose_fixture=PASS`。仍保留
  `full_app_compose_install_lifecycle=NOT_RUN`、
  `m0_release_decision=NO_GO`。

**严格界限：**这只验收一次性客体内的 Docker/Compose 底座及
容器状态，不是 GPUPanel AppStore/AppInstall 的接单、TaskDB、审批、
UNKNOWN 持久化、并发冲突、容器副作用回执或真实用户业务服务，
不能勾选 G5 退出条件。下一步才是通过 GPUPanel 的真实受认证 API
联动操作与明确的任务结果/资源证据核对。

## 实机增量：安装后离线快照故障恢复（候选门禁）

`scripts/install-test/restore-live.py` 在已有的**真实首次安装、
真实浏览器、Agent 恢复和离线 Docker Compose fixture**均通过之后，
继续验证一次性 QEMU guest 的安装后冷恢复：

1. 核对干净 Git 源码、运行中 Core/Agent 文件 SHA、当前
   `guest_machine_id_sha256` 和已有 G4/G6/Compose 证据；
2. 仅在该 guest 写入专属固定路径的测试标记，读取已安装登录
   配置摘要，不读取或打印实际凭据；
3. 关闭 QEMU，转换并验证独立可移植的安装后 QCOW2 快照，
   按快照内容的 SHA-256 复验；
4. 启动旧磁盘，在 guest 中**只损坏专属测试标记**，确认其摘要
   与备份不一致；再次关机；
5. 在独占的 VM owner 锁保护下，保留原 `disk.qcow2` 到
   `disk.before-ci-restore.qcow2`，从已验证快照复制新的
   `disk.qcow2`；磁盘和快照目录不可为符号链接，VM 正在
   运行时拒绝操作；
6. 重启同一个 guest，等真正的 Core/Agent systemd 服务就绪，
   复验标记已恢复、登录设置摘要一致、客体身份和运行的两个
   二进制摘要都与浏览器候选一致。

只上传自动脱敏的 `ci-evidence.json`，**不上传**备份磁盘、
客体私钥、登录设置、安装日志和原始浏览器截图。
机器证据中新加 `post_install_offline_disk_restore=PASS` 仅当
以上阶段逐个完成，并且所有强制身份校验一致；否则为
`NOT_ATTESTED`，CI 阻断。

该测试证明一次 task-owned **完整磁盘的离线恢复演练**，
并不代表生产环境增量备份、失效升级回滚、数据库迁移失败、
跨主机恢复或完整 App/Compose 数据恢复。发布决策继续
`NO_GO`，仍须 G3 的升级回滚、G5 的 GPUPanel API
AppInstall/Compose 端到端，以及独立操作员验收。

## 2026-10-19 — G5 实机 Core→Agent→Docker 容器片段

本阶段接入独立的真实 GPUPanel Core API 容器操作测试，
**不是**直接用 Docker CLI 伪装成平台容器生命周期。

在已经完成真实登录、Agent 故障恢复、离线 Compose 生命周期之后，
`ci-live-vm.sh` 从同一个获授权 Ubuntu VM 内的发行版
`busybox-static` 导入本地离线镜像。脚本
`scripts/install-test/container.py` 使用现有的登录会话和 CSRF，
先确认匿名创建被拒绝，再为唯一任务 UUID 执行创建、停止、启动、
重启、删除。每一步须同时满足以下证据：

- GPUPanel Core API 接受操作；
- Agent 持久 TaskDB 查到同一 UUID、`Container` 范围与操作类型，
  且任务完成状态确为 `Success`；
- 客体 Docker 对运行、退出或删除结果的独立检查一致。

**实机发现的契约：**`ContainerCreate` 必须明确携带
`networks`，没有该属性，Agent 会拒绝加载配置，任务变为
`Failed`。离线 fixture 使用 `networks: [{network: none}]`，
并通过 Docker Inspect 单独检查 `HostConfig.NetworkMode=none`，
既保证创建请求合法，又不引入外部网络、主机端口与镜像拉取。

验收报告只读取脱敏的任务 UUID 数量、步骤状态、候选二进制、
同一 guest 身份与不可泄露的固定断言。新的容器步骤后，
**原有安装后离线磁盘恢复仍是必需且独立的最终阶段**。
任一阶段失败都不能产生 `PARTIAL_ACCEPTED`。

无论这项容器级验证是否成功，`AppInstall`、真实应用市场与
Compose API、跨 UUID 同名竞态、应用卸载以及升级回滚仍
**NOT RUN / M0 NO-GO**。仅允许在一次性自有 VM 上测试；
不使用生产 Docker 主机，不重试可能已执行的创建命令，
不执行全局 Docker Prune。

## 2026-10-19：发行输入变更必须自动重跑真实 VM

此前真实 VM Workflow 只在安装脚本/部分部署文件变化时自动触发：
Core、Agent、前端发生实质变更后，旧的 VM PASS 不能证明最新候选
仍能安装、登录与恢复。现在
`.github/workflows/gpupanel-real-ubuntu-vm.yml` 对以下路径
在 PR 和主分支 push 上运行实际 QEMU/KVM 验收：

- `core/**`：Core / 内嵌 Web UI / 路由 / 鉴权；
- `agent/**`：Host、任务与 Docker 执行；
- `frontend/**`：登录、Operations Center 与应用交互；
- `deploy/**`：发布包、安装与服务定义；
- `scripts/**`：预检与实测、恢复和取证工具；
- 对应 Workflow 文件自身。

PR 上的 Action 可能构建 **synthetic merge checkout**，
实际身份必须从 `ci-evidence.json.source_sha` 读取，不能把
PR HEAD 猜作虚拟机实际构建提交。PR 合并到 `main` 后，
`push` Workflow 重新针对**真正的 main 提交**生成独立证据。
如果 `main` 最新提交没有对应的成功真实 VM 记录，就不能借用
合并前的 Green 作为同版本 G3–G6 验收。

此项只加强候选证据的自动复测覆盖；
`PARTIAL_ACCEPTED` 仍仅代表已经真实执行的子集，
G5 AppInstall、安装升级回滚、完整数据恢复和人工发布审批
在独立证据完成前始终是 **M0 NO-GO**。

## GitHub 自动化合并的主分支复测兜底

GitHub 官方说明：以某些 `GITHUB_TOKEN` 创建的事件不会继续触发
普通 `push` Workflow（`workflow_dispatch` 与
`repository_dispatch` 是例外）。因此单靠 `push: main`，
不能推断由机器人合并的每个提交都有独立主分支验收。

真实 VM 流水线保留 `pull_request`、`push main` 和人工
`workflow_dispatch`，同时增加 **每天一次的
`schedule`**，由 GitHub 在默认分支最新提交上运行相同的
固定 Ubuntu 24.04 KVM、真实浏览器/容器/离线恢复矩阵。
它不依赖 PR 合成 merge SHA，也不会引用已合并 PR 的绿色 CI
替代最新主分支证据。

**核对方法**：打开 Actions → GPUPanel real Ubuntu 24.04
disposable VM acceptance，选择事件为 `schedule`、
`push` 或 `workflow_dispatch` 且 branch 为 `main`
的运行，验证 `ci-evidence.json.source_sha` 与所要验收的
当前主分支精确 SHA 相等，并验证 `PARTIAL_ACCEPTED`。
若没有这样的运行/报告，主分支实机状态是 **NOT_ATTESTED**，
不是 PASS。定期触发是检测兜底，不保证每次合并立即复测：
GitHub 可能延迟、跳过 scheduled workflow，管理员也可以禁用它。

即使同版本 PARTIAL_ACCEPTED，真正的 AppInstall G5、
产品升级/回滚、完整用户工作区恢复及人工发布签核仍未完成，
**GPUPanel M0 一律 NO-GO**。


## 2026-10-19 — G3 原始安装包的 guest 传输完整性门禁

真实 VM CI 从当前 **GitHub commit** 构建
`gpupanel-ci-<commit-prefix>-linux-amd64.tar.gz`，随后通过只作用于专属
guest 的 `vm.py copy` 传入 `/tmp`。在解包或执行任何安装器代码之前，
`scripts/install-test/release-transfer.py` 会：

- 核对干净 checkout 的完整 SHA、固定格式的安装包文件名、
  非符号链接的本机构建归档；
- 在 guest 内以非 root 身份对**收到的实际归档文件**重新计算 SHA-256，
  同时读取 guest machine-id 摘要，与 host 计算值和后续真实浏览器
  记录的 guest 身份绑定；
- 将仅包含两边 SHA、源码 SHA、guest 身份摘要与
  `signature_proof=NOT_ATTESTED` 的证据写入私有
  `release-transfer.json`；成功后才能解包、预检和继续安装；
- 让最终的 `ci-evidence.json` 在文件缺失、摘要不同、guest 不同、
  记录字段伪造或步骤乱序时 **BLOCKED_OR_FAILED**，而不是
  `PARTIAL_ACCEPTED`。

**校验边界**：相等的 SHA-256 证明这次 runner→guest 传输期间
归档字节一致，**不证明**产物由可信构建者签名、上游依赖可复现、
GPL 许可审计通过或真实生产主机升级可用。报告永远保持
`release_package_signature=NOT_ATTESTED` 与
`m0_release_decision=NO_GO`。

测试入口：`python3 -m unittest scripts/tests/test_gpupanel_vm_release_transfer.py`。
只对实际通过的完整、同一 commit VM 工作流记录 G3 的安装包传输
片段，不能跨 PR 复用历史证据。

## G5 实机增量：GPUPanel Compose API → Agent TaskDB → Docker

新文件 `scripts/install-test/compose-api-live.py` 在 **同一源码 SHA、
同一客体 machine-id、同一份 Core/Agent 安装二进制**的
真实登录、Agent 恢复和容器 API 实测之后运行：

- 从该 VM 内已导入的本地 `gpupanel-m0-fixture:local` 镜像创建
  一个唯一命名的 Compose 项目；配置 `pull_policy: never`、
  `network_mode: none`、无端口发布、只读根文件系统、无新增权限。
- 匿名 POST Compose 创建必须被拒绝；登录后通过受 CSRF 保护
  的 `POST /api/v1/containers/compose` 创建；用独立 UUID
  核对 Agent `Compose / TaskCreate / Success` 持久任务回执。
- 从真实 Core `/containers/compose/search` 确认项目记录和
  专属配置路径，再从 guest Docker inspect 独立确认项目标签、
  镜像、运行状态、network mode、privileged 和端口绑定。
- 通过 Core Compose 操作 API 依次 stop/start/restart，
  每次向 Docker 观察真实容器状态；最后使用
  `operation=delete, withFile=false, force=false`，仅针对
  本次项目，确认容器和数据库项目记录均已消失。不允许全局
  `docker prune`，不能碰用户现有 Compose 项目。
- 失败时只输出脱敏的源码行号和异常类，不公开任务日志、
  登录凭据、Compose 原始内容或 guest Docker 输出。
- 只有 `compose-api-live.json` 的确切项目、Guest、TaskDB
  和 6 步结论全部匹配，`ci-evidence.json` 才允许
  `core_agent_compose_api_lifecycle=PARTIAL_PASS`；
  缺失、跨主机、跨版本、执行未完或凭空标注 PASS 均拒绝。

**这不是完整 G5 AppStore/AppInstall 生命周期**，只是 GPUPanel
Compose API 的真实服务端、任务和 Docker 资源纵向闭环。
未覆盖应用市场部署、应用卸载/重装与迁移、真实 GPU、
升级回滚或独立操作员放行，因此完整 M0 仍为 NO-GO。
