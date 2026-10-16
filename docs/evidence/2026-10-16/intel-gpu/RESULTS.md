# Intel GPU 真机识别修复

运行源码：`a74e4c51b9e2d279cb5dff6811d32af979c5265a`。
安装的 Core 与 Agent build info 均为该提交，`vcs.modified=false`。
SHA256 见 `intel-update-checks.json`，完整 build info 见 `build-info.txt`。

本机 Ubuntu 26.04，PCI `0000:00:02.0`、Intel `8086:7d51`、DRM `card1`、
驱动 i915。修复前指定该 PCI 地址的探测测试失败：collector unavailable。
修复后经安装中的 Agent 私有 Unix socket 读取真实 `/api/v1/ai/gpu/load`，
返回一个 `Intel Arrow Lake-P [Arc Pro 130T/140T]`，PCI 与驱动均匹配真机。
完整设备响应见 `intel-agent-live.json`。

| 检查 | 结果 |
| --- | --- |
| Agent 全量 `go test ./...` | PASS |
| Intel/accelerator focused race tests，含实际 PCI 探测 | PASS |
| DRM fixture：card1、重复 PCI、连接器/render 排除、非 Intel/非显示设备、缺失目录 | PASS |
| 前端单元测试、冻结依赖安装、typecheck、生产 build | PASS |
| 真实 Agent 响应通过前端 adapter：型号、PCI、未知指标语义 | PASS |
| 当前安装备份提取、二进制比对、SQLite quick_check | PASS |
| 更新后服务可执行文件/构建哈希、回环配置、账号/入口记录相对本次备份一致 | PASS |
| 登录后的真实浏览器 GPU 页面、终端/Docker 全链路重跑 | NOT VERIFIED：登录要求验证码，未进入工作台 |

浏览器测试未通过不得记为页面通过。旧 host-install runtime helper 还因历史
credential digest 与当前账号记录不一致退出；本次更新前后的四项账号记录
逐项比对全部一致，见 `intel-update-checks.json`。保留当前账号与安全设置，
没有再次重置密码或关闭验证码。此前的主机验收属于历史证据，不代替本次验证。

本次仅验收设备识别。未安装 GPU 驱动或厂商工具，未验证 GPU 计算、
容器透传、oneAPI/OpenVINO/PyTorch。利用率、显存、温度、功耗和进程
保持未知并返回明确警告，没有用零或共享 RAM 填充。

更新前备份：`/var/backups/gpupanel/installed-20261016T003325Z/`。
需要回滚时恢复其中旧 Core/Agent 二进制并重启原 systemd 服务；无数据库迁移。
