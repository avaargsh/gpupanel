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

安装日志包含只在终端打印的初始随机密码，捕获时必须留在私有目录：

```bash
umask 077
python3 scripts/install-test/vm.py ssh -- sudo /tmp/gpupanel-local-dev-linux-amd64/install.sh --entrance itest-local > .local/install-test/install.raw.log 2>&1
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
