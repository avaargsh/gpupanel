# 本轮整合验证记录

状态：本地源码整合完成；尚未提交、推送或运行远程 CI。M0 发布仍为 NO-GO。

- 远程基线：`82d34f0518e340fb0077dddd74ee004305ed56c6`。
- 当前工作文件指纹：`0be07f6e9d3568630d00b7b46a592966b908da6f1356af0bfb7944558e8bae89`。
- 指纹范围：Core/Agent、React、部署脚本、工具、测试、catalog/profiles、CI 配置及根契约文件。
  排除 Git、依赖目录、dist/build、Python 缓存及证据目录；包含 Core 当前内嵌 React 资源。
- 本地 HEAD：无初始提交，不能以远程 SHA 代替本轮源码的提交身份。

| 检查 | 本轮结果 | 证据 |
| --- | --- | --- |
| 远程后端源文件/消息目录保留 | 884 个路径按模块/API/命名空间契约适配后相符，无差异 | [清单](remote-fidelity.json) |
| Core 全包测试 | PASS；真实隔离 Agent socket 门槛用例未执行 | [输出](core-tests.txt) |
| Agent 全包测试 | PASS；隔离 Docker/socket 环境门槛用例未执行 | [输出](agent-tests.txt) |
| vLLM SQLite 迁移 | PASS；旧行保留、重复迁移、离线备份恢复；不是主机升级验收 | `TestVLLMRequestMetricsPreservesOldRowsAndOfflineBackup`，见 Agent 日志 |
| Python 回归 | 225 tests，PASS | [输出](python-tests.txt) |
| React 类型检查 | PASS | 本轮 `pnpm typecheck` exit 0；预览构建也执行并保存输出 |
| Node 回执/证据测试 | 10 tests，10 pass，0 fail，0 skip | 本轮 `pnpm test` 的可执行测试输出；源文件位于 frontend/apps/panel/src/utils/ |
| React 生产构建 | PASS | [完整预览构建输出](preview-build.txt) |
| 模拟 API 浏览器负向检查 | PASS；验证码、MFA、取消、丢失响应、刷新回执、防重复、UNKNOWN 禁止变更及字段脱敏；无页面运行错误 | [输出](browser-tests.txt)、[回执截图](gpupanel-react-recovery.png)、[证据截图](gpupanel-react-evidence.png) |
| 本地前端与 Core/Agent 实际二进制组装 | PASS，离线依赖构建；没有执行二进制 | [构建输出](preview-build.txt)、[模块元信息](binary-metadata.json) |
| 预览包结构/内容摘要 | PASS，installable=false | [验证 JSON](preview-verify.json) |
| 依赖清单 | 已按 pnpm lock + Go module 生成；不是许可证放行 | [清单](dependency-inventory.json) |
| Bash / workflow YAML | 语法检查 PASS；未执行工作流或安装脚本 | bash -n / YAML 解析 |
| Git 来源归档归属证明 | BLOCKED：source_commit=unknown | [实际拒绝信息](source-attestation-blocked.txt) |
| 真实浏览器→Core、真实 Docker、Ubuntu 安装/升级/恢复 | NOT RUN | 继续遵守 G3–G6 门槛 |

预览产物：`/home/avaarg/GPUPanel/dist/gpupanel-preview.tar.gz`。
SHA-256：`e9d401062ef2a52569eb03c05a4c7035840e6c8620dcae246d9c169998a636f9`。
仅作为本地源码预览，不能用于宣称安装、生产交付或不可变 Git 来源证明。

原始本地源码快照：
`/home/avaarg/GPUPanel-integration-backups/local-before-remote-main-20261015.tar.gz`。
其摘要、边界及回退方法见 [整合说明](../../../gpupanel/LOCAL_REMOTE_INTEGRATION.md)。
