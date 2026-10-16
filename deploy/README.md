# 安装候选构建与运行

当前系统安装/升级/恢复的完整验收仍为 BLOCKED。真实安装在本机一次性 Ubuntu
24.04 VM 中测试，方法与本轮结果见 [安装手册](../docs/operations/local-install-test.md)。
不得直接覆盖已有 1Panel/GPUPanel 数据或把预览打包成功当成生产可安装。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `build.sh` | 构建 React/Core/Agent，组装安装候选 payload 与 tarball |
| `install.sh` | 冲突预检、全新安装、配置、systemd/pctl 启动与监听检查 |
| `uninstall.sh` | 卸载服务/自有链接；默认保留数据，`--purge` 才删除对应数据 |
| `pctl` | 已安装系统的控制入口及首次启动 KEY=VALUE 引导信息 |
| `conf/app.yaml` | 安装配置模板，不是可提交的实际凭据文件 |
| `systemd/` | Core/Agent 单元模板 |

## 构建

未设置 `VERSION`（或值为空）时默认使用 `v0.1.0`，生成
`gpupanel-v0.1.0-linux-amd64` 目录及同名 `.tar.gz`，不再从配置模板读取上游版本。
显式指定 `VERSION=v2.0.0` 则生成 `gpupanel-v2.0.0-linux-amd64`。
归档目录、`pctl` 的 `ORIGINAL_VERSION` 和包内 `app.yaml` 使用同一版本。

```bash
VERSION=local-dev ./deploy/build.sh
```

`--skip-frontend` 复用当前 Core embed 资源，仅供确认前端产物已更新的情况。
候选目录为 `build/release/gpupanel-<version>-<os>-<arch>/`，tarball 位于 `build/`。
目录名是归档顶层与旧升级代码读取布局的契约，不应随意扁平化。

payload 包含 Core、Agent、pctl、安装/卸载脚本、只读冲突预检、配置模板、systemd
单元、语言文件及 LICENSE/NOTICE。可选 GeoIP 不存在时首次启动下载并校验，详见 [GeoIP 获取与恢复](../docs/operations/geoip.md)。
严格的 `dist/gpupanel-preview.tar.gz` 是另一类不含系统安装器的源码预览。

## 全新安装行为

仅在本任务 VM 或已明确准备好的一次性测试机执行：

```bash
sudo ./gpupanel-<version>-linux-<arch>/install.sh
```

- 在停止服务或复制二进制前检查 OS、已存在的运行路径、父路径符号链接和可用空间。
- 默认安装到 `/opt/gpupanel`，暴露 `/usr/local/bin/pctl` 与两项自有二进制链接。
- `pctl` 以 0700 保存引导值；安装日志在**通过冲突预检与参数校验之后**才建立于 `<base-dir>/gpupanel/log/install.log`（0600），不写入源码或 payload 目录。`--help`、非法选项和预检失败不创建安装日志。生成的密码只打印到终端；密码及入口值的非法输入也不会出现在报错中。
- 配置和数据库归属由 Core/Agent 管理。当前 Core 内嵌配置 `mode=dev` 时可能读取
  `/opt/gpupanel/conf/app.yaml`；其他引导路径从 pctl 读取。不要假设改一个 YAML
  就完成了任意路径迁移，或把模板里的开发默认值当成实际安装密码。
- 首次安全入口在服务端验证后交接到 `/login`；Cookie/CSRF 会话仍由 Core 管控。
- 已安装环境会被预检拒绝，**重复运行安装器不是受支持的升级流程**。
  `pctl restart` 只重启已有二进制，不会把新源码变成已部署代码。

## 控制与回退

`sudo pctl status` 查看状态；`sudo pctl restart` 重启已有实例。运行权限与自有
路径必须按实际安装核对，不能用全局 `pkill` 清理其他项目。

本轮 VM 可用 `make install-test-stop` 停止并保留磁盘；它不删除宿主机任何服务。
真实升级、备份和回滚仍需单独验证，不能通过手工替换二进制后宣称安装器升级已通过。

真机试验的 OS、残留状态备份、回环绑定和自动配置选项见 [操作说明](../docs/operations/host-install.md)。
