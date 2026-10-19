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

## G5 增量：真实本机容器生命周期（仍不是完整 AppInstall）

`scripts/install-test/ci-live-vm.sh` 在已经通过相同候选 G3 首装、
真实 G4 登录与部分 G6 Agent 恢复的任务专属 Ubuntu VM 中，
追加一个**真实 Core → Agent → Docker 的受认证容器控制实验**：

- Guest 从 Ubuntu 已签名 apt 仓库安装 `busybox-static`，打包仅含
  BusyBox 的最小根文件系统，导入 guest Docker 的
  `gpupanel-m0-fixture:local`。无需访问 Docker Hub、应用市场、
  GPU 或外部业务容器。
- `scripts/install-test/container.py` 必须验证当前源码/二进制候选、
  登录浏览器证据、恢复记录和 task-owned VM 后才允许创建。
  匿名请求必须拒绝；登录以当前私有凭据完成。
- 五个互不相同的 Task UUID 驱动 Core API 的创建、停止、
  启动、重启、删除；每一步要求 Agent 持久回执精确匹配
  UUID、Container Scope、操作类型、`Success`，并通过
  **guest Docker CLI 独立观察**真实容器状态，而不是相信 HTTP 200。
- 所有操作仅针对一次性 VM 内专用名字，发现既有同名容器则
  fail-closed；网络失败或异步任务结果不确定**不自动重放操作**。
  不执行 `docker prune`，不接触 runner 本机 Docker。
- CI 证据的 `core_agent_docker_container_lifecycle` 只能是
  `PARTIAL_PASS` 或 `NOT_ATTESTED`；完整
  `full_app_compose_install_lifecycle` 继续是 `NOT_RUN`。
  未测 AppInstall DB/Docker 跨事务 UNKNOWN、不同 TaskID 竞态、
  同名失败回收、完整应用日志/卸载、多租户权限与升级回滚。

这条链路的正向验收必须来自真实 QEMU 工作流，不可用单元测试或
Docker CLI 单独执行结果代替 GPUPanel Core API 测试。未经独立验收，
M0 发布结论仍固定 `NO_GO`。
