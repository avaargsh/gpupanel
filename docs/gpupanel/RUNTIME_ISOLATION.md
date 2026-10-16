# Runtime namespace 旧签名审计（非当前真机描述）

旧的 `/usr/local/bin/1pctl` / `/etc/1panel/agent.sock` 签名只属于上游历史。当前安装脚本默认 GPUPanel 自有 `/opt/gpupanel`、`/usr/local/bin/pctl` 与私有 Agent Socket。请以 [安装说明](../../deploy/README.md) 和 [STATUS](../STATUS.md) 为准。

只读 `scripts/gpupanel-runtime-namespace.py` 仍可检查旧来源签名，`--strict` 未通过只能表明缺少独立的完整验收。没有发现旧签名并不能证明权限、宿主路径、数据和回滚安全。禁止以这份旧路径清单操作生产主机。
