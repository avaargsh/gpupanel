# 本地真机安装与验证

当前标准验证环境仍是 Ubuntu 24.04。用户明确要求的本机 Ubuntu 26.04 测试通过
`--experimental-ubuntu-26` 单独启用：它只解除该版本的 OS 阻断，不跳过运行时冲突、
目录所有权或数据迁移检查，不把操作系统预检标为 PASS。

## 安装边界

现有安装、数据库或活跃服务不能靠重装覆盖。先盘点进程、systemd、目录、链接、
socket、端口和 Docker daemon。Docker Desktop context 与 `/var/run/docker.sock`
可能是两套引擎；Agent 默认使用后者。测试必须记录 daemon 身份并保留已有容器。

`scripts/host-install/prepare.py` 仅处理 `/opt/gpupanel` 和旧 1Panel 数据均不存在、
服务 inactive/disabled、链接只指向缺失的 `/opt/gpupanel`、配置目录只含无监听的
root-owned 旧 socket 的残留状态。默认只读；`sudo ... --apply` 会将原件移入
root 私有 `/var/backups/gpupanel/host-<UTC>/originals/`，先做一次原路径恢复验证，
核对 inode、权限、链接与字节后再隔离。不是旧数据库迁移器，不能用于运行中部署。

## 本机回环安装

```bash
./deploy/build.sh
sudo ./build/release/gpupanel-v0.1.0-linux-amd64/install.sh \
  --experimental-ubuntu-26 --bind-address 127.0.0.1 --no-auto-provision
```

未设置 VERSION 时包名默认 v0.1.0；正式版本用 VERSION 显式指定。24.04 不需要
experimental 选项。`--bind-address` 仅接受 127.0.0.1 或 0.0.0.0，首次数据库初始化
读取 `ORIGINAL_BIND_ADDRESS`；不覆盖已有数据库里的监听设置。旧 pctl 无此字段时
保留原先默认值。回环模式不开放防火墙端口，也不查询公网地址。

`--no-auto-provision` 需要 systemd，在 Agent unit 中保存
`GPUPANEL_AUTO_PROVISION=disabled`，跳过启动时自动初始化防火墙、默认 Docker 网络、
ACME 账户及自动系统时间同步。手动管理 API 仍需原有认证/授权；此选项不将整个 Agent 变成只读服务。
默认不带选项保留历史启动行为。未知环境变量值也禁止自动配置。

安装器只接受全新目标，不再使用 pkill 按名称或命令行清理其他进程。安装日志和
初始密码捕获只放忽略的 `.local/host-install/`，权限 0600；不要发布密码或 Cookie。

## 本地终端

本地终端直接使用当前 Agent 的 PTY，不依赖 localhost SSH 账户或 sshd。
命令以 Agent 服务账户执行（本轮 systemd 默认 root），仅复用认证后的终端权限，
并按用户/认证会话绑定回连。单个 Agent 最多 16 个本地 PTY，会话关闭释放配额；
意外断线沿用既有有界恢复期，正常离页关闭进程。保存的远程 SSH 入口保持独立。

## 验证清单

- 核对安装二进制与构建摘要，监听仅为 127.0.0.1，两个 systemd 服务和私有 socket 正常。
- 真实浏览器从安全入口登录，核对 HttpOnly、匿名与无效 CSRF 拒绝。
- 首页数字与真实 API/宿主机对应；打开 Host、GPU、Docker、任务及应用入口。
- 终端执行带随机标记的无害命令，并在指定私有测试目录验证文件；重连和重启后核对数据保留。
- 仅操作本次唯一命名、带运行标记的容器；无主机挂载、无发布端口、无特权，不使用 prune。
- 核对原有容器、外部测试进程和防火墙规则保持原状。
- 硬件或驱动不具备时明确记录 GPU 阻塞，不将设备观察当作 PyTorch/GPU 可运行证明。

真机报告必须与此前 VM 报告分开，注明精确源码/产物摘要、真实链路、失败和未执行项。
项目/环境持久化、完整应用安装恢复及企业/远程验收不因安装成功自动通过。
