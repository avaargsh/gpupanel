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

先在已安装、已核验且仍运行的本任务 VM 上**显式开始新一轮验收**。
`begin` 读取当前 checkout、Core/Agent 安装摘要及 guest 指纹，并在私有目录
写入新的 `active-acceptance-attempt.json`。它不执行安装、恢复或任何产品授权；
每次执行都会生成新的随机 `attempt_id`，旧浏览器/恢复回执不能拼接到新一轮。
开始后若修改源码/候选二进制或更换 VM，必须重建候选并重新验收。

```bash
python3 scripts/install-test/candidate_identity.py begin
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


## 同一安装候选的回执复核（只读，G4 / 有限 G6）

`scripts/install-test/browser.py` 和 `scripts/install-test/runtime.py`
现在分别从**正在运行的本任务 VM**读取实际安装的
`/opt/gpupanel/gpupanel-core` / `gpupanel-agent` SHA-256，
在验收前后与本地 `build/` 的候选二进制比较，并将
`binary_sha256` / `candidate_commit` 写入各自的私有 JSON 回执。

完成两条真实测试、未修改代码、未替换编译二进制后，执行：

```bash
python3 scripts/install-test/candidate_identity.py review
```

- 仅从 `.local/install-test/browser-live.json` 与 `runtime-live.json`
  读取证据；无 VM 启停、安装、sudo、写入或网络请求。
- 必须包含同一 `core`/`agent` 摘要、同一当前 checkout commit、
  当前本地 build 文件摘要；拒绝缺项、符号链接、不同版本或测试缺失。
- 两份回执必须携带当前 `active-acceptance-attempt.json` 中的
  `attempt_id`，与本地 Core/Agent、checkout、guest 指纹一起核对；
  跨验收轮次、缺失轮次或旧回执全部拒绝。不要在浏览器和恢复测试之间
  重新执行 `begin`；要重跑时，先完整重做两项测试。
- 两份回执还必须包含相同、格式有效的 `guest_identity_sha256`。
  真实脚本在测试前后从**已核对归属的 QEMU VM**读取 guest `/etc/machine-id`，
  以固定域前缀计算 SHA-256 指纹；原始机器标识不写入回执。若测试期间
  VM 身份变化，或浏览器与恢复回执来自不同 guest，直接拒绝交叉复核。
  这避免了“相同程序、不同 VM”被误拼成同一测试对象。
  `attempt_id` 只是本地操作者组织本轮测试的随机标签，不具有签名或远端机器证明能力。
- 输出 `candidate_consistent=true` **只证明局部回执在此刻自洽**。
  checkout commit 是读取时的版本标记，不是可验证的编译来源证明。
  已保存的 JSON 不具有防伪签名，不替代原始命令日志与独立审核。
- 输出中 `m0_release_ready=false` 始终成立；G3 完整升级/回滚、
  G5 Docker/App 完整生命周期、G6 中断恢复继续 `NOT_VERIFIED`。
- Guest machine-id 指纹只是**伪匿名的相关性标识**，不是机器证明、
  数字签名或抗克隆 ID；复制相同 machine-id 的镜像会导致相同指纹。
  审核者仍需通过原始日志、VM 磁盘所有权及源镜像来源独立判断。
- 这条命令不能把两次不同运行的脚本回执自动变成同一次完整验收。
  必须由审核者另外核实时间、VM 身份、运行日志、候选包和环境。

测试工具及本说明不改变默认拒绝的系统安装策略，也不开放任意 Host
脚本执行接口。发布门槛仍以 [#69](https://github.com/avaargsh/gpupanel/issues/69)
和 [状态页](../STATUS.md) 为准。
