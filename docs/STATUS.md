# GPUPanel 当前工程状态

> 快照：2026-10-16，治理前主线 `main @ 33d6176a51dfb3dccdae1a688ebe645a4f6972d2`。**这是唯一默认状态入口**，变更后须核对最新 SHA/Actions/实际二进制再更新。本页不宣称后续提交自动通过旧验收。

## 产品与发布：M0 NO-GO

现行源码为 React 19 + shadcn/ui + Tailwind / Go Core + Agent，可用的本地 Host、Terminal、Docker、App Store 与安装回执继续开发。功能存在不等于当前 HEAD 的生产发布已被证明。

| Gate | 已有局部证据 | 当前完整发布状态 |
| --- | --- | --- |
| G0–G2 源码/前端/预览 | 固定源码的 CI/构建/预览 | SOURCE PASS（需按候选重新验证） |
| G3 安装/升级/回滚 | Ubuntu 24.04 VM 新装、26.04 实验宿主新装；不同旧版本 | **PARTIAL / NO-GO**，升级/回滚未完整接受 |
| G4 登录/Host | 固定旧版本的登录、Core→Agent→Terminal、部分否定授权 | **PARTIAL / NO-GO**，当前候选完整矩阵未验 |
| G5 Docker/App | 真 Docker canary 与部分 AppInstall/UNKNOWN 证据 | **PARTIAL / NO-GO**，完整 App/Compose 生命周期未验 |
| G6 恢复 | 受限的重启/数据保留与恢复子场景 | **PARTIAL / NO-GO**，中断升级与独立恢复未验 |

不能把不同 SHA、VM、真实宿主及模拟浏览器的多个 PASS 拼成一个 M0 PASS。

## 历史证据（精确基线，非当前 HEAD）

- [Ubuntu 24.04 VM](evidence/2026-10-16/local-install/RESULTS.md)：源码指纹 `6f8f3fd7...`，当时尚无本地初始提交，不代表本轮 main。
- [Ubuntu 26.04 实验宿主](evidence/2026-10-16/host-install/RESULTS.md)：安装版本 `7599fd56...`；只对该版本的登录/Terminal/Docker 观测有效。
- [主机受控操作](evidence/2026-10-16/host-operations/RESULTS.md)：安装版本 `8400884a...`；真实已登录浏览器→Core→Agent 在该子场景未运行。
- [Intel](evidence/2026-10-16/intel-gpu/RESULTS.md)、[GeoIP](evidence/2026-10-16/geoip/RESULTS.md)、[vNext Shell](evidence/2026-10-16/vnext-shell/RESULTS.md) 都是独立固定版本证据。
- 最近已合并的 [#92](https://github.com/avaargsh/gpupanel/pull/92)、[#96](https://github.com/avaargsh/gpupanel/pull/96)、[#98](https://github.com/avaargsh/gpupanel/pull/98) 的 CI 是对应 HEAD 的测试，不等于重新完成真实宿主验收。

## 许可证边界

继承自 1Panel 的组合工作仍受 **GPL-3.0** 及 `NOTICE.md` 原有归因要求约束；只有 [六个独立审计脚本/测试](gpupanel/APACHE_FILE_SCOPE.md) 有明确的文件级 Apache-2.0。整体 Apache-only **BLOCKED**。删除旧文档、改名或 AI 改写不能清除其余派生代码的许可义务。

这轮删除 `.skills/semi-ui-skills/` 旧前端代理指导及不带当前提交验收的旧远程源码整合资料。**仅删除四个不参与 Linux 构建的 Darwin/Windows 日志平台文件，其他继承 GPL 运行时仍保留。** 文件移除不代表 Apache 重新许可。 旧 Catalog 禁用门槛、API 兼容锁、Host/备份/已安装应用仍需调用方/构建产物/数据库迁移及回滚证据。见 [许可现状](gpupanel/APACHE_MIGRATION_PROGRESS.md)。

## 证据与下一步

历史摘要保留 exact SHA 和 PASS/FAIL/NOT RUN；只维护本页“当前状态”。同主题新证据替换旧摘要，旧附件靠 Git history / Actions 恢复，不改写历史、不删除运行数据或系统备份。下一优先级：Project→持久 Workspace→Session、AppInstall UNKNOWN 受控恢复、Ubuntu 24.04 一致版本 G3–G6 验收。
