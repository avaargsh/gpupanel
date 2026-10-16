# Intel GPU 识别

主机加速器采集在保留 `xpu-smi` 的同时，读取 `/sys/class/drm/card*/device`
发现 Intel PCI 显示设备。不要求安装厂商工具，支持非 `card0` 编号，按 PCI
地址去重并排除连接器与 render 节点。设备仍通过既有 `/api/v1/ai/gpu/load`
的 `xpu` 数组返回；前端将 `basic/stats` 转换为展示字段，不改变外部 API。

优先保留 `xpu-smi` 对同一 PCI 地址的完整结果。工具缺失、失败或没有列出
某个 DRM 设备时，用 DRM 补齐该设备清单，并返回 inventory-only 警告。
型号读取本地 pci.ids，缺失时显示 Intel 与 PCI 设备 ID。驱动字段是实际绑定
的内核驱动名称；它不是用户态计算运行库版本。

DRM 清单不提供利用率、温度、功耗、显存或进程。缺失值保持空字符串，
页面显示不可用；集成 GPU 的系统共享内存不冒充独立显存。识别成功不代表
oneAPI、OpenVINO、PyTorch 或容器 GPU 透传已经配置或验收。

回归命令：

```sh
cd agent
go test ./utils/ai_tools/xpu ./utils/ai_tools/accelerator
# 仅在有对应 Intel PCI 设备的真机上执行：
GPUPANEL_TEST_INTEL_PCI=0000:00:02.0 go test ./utils/ai_tools/xpu -run TestIntelHostDiscovery -count=1
```

采集只读，不安装驱动、不执行用户命令、不更改设备权限。沿用现有 API 的
认证与主机作用域。部署前备份当前安装并验证归档可还原；回滚恢复原二进制
并重启已有服务，数据库没有变化。
