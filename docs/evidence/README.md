# 验收回执：只保留必要固定版本证明

**默认最新状态只见 [STATUS](../STATUS.md)**。本目录是带精确源/二进制 SHA、机器环境及明确未执行项的历史回执，不随 `main` 的提交变化自动升级。

| 专题（历史固定版本） | 入口 |
| --- | --- |
| Ubuntu 24.04 VM | [local-install](2026-10-16/local-install/RESULTS.md) |
| Ubuntu 26.04 真实宿主 | [host-install](2026-10-16/host-install/RESULTS.md) |
| Host 受控运维 | [host-operations](2026-10-16/host-operations/RESULTS.md) |
| Intel 设备识别 | [intel-gpu](2026-10-16/intel-gpu/RESULTS.md) |
| GeoIP | [geoip](2026-10-16/geoip/RESULTS.md) |
| 工作台 | [vnext-shell](2026-10-16/vnext-shell/RESULTS.md) |

2026-10-15 无本地 HEAD 绑定的远程整合报告已从当前树删去；原始数据可在治理前 `main @ 33d6176a51dfb3dccdae1a688ebe645a4f6972d2` 的 Git 历史恢复。没有改写 Git 历史或删除 VM、用户数据、私有凭据和回滚备份。

新证据每个能力只留一份短摘要与必要的脱敏结构化回执，记录来源、命令、结果与 NOT RUN。完整日志留在 GitHub Actions，不提交重复 trace、整树清单或私有数据。预算由 `python3 scripts/gpupanel-evidence-budget.py` 检查：总量 1 MiB、≤8 主题、每主题 ≤8 文件/256 KiB、文本 ≤64 KiB、PNG ≤2 张/每张 256 KiB。预算不证明真实性或发布安全。
