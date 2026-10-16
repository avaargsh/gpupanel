# 本轮整合验证记录

> 历史验收摘要；本次仅整理资料，没有重跑以下测试。重复日志、整树清单和多余截图已清理，
> 原附件可从 Git `87c64f6ed2a52ea106a2d57a870165c3f1ce54e2` 找回。保留范围见 [归档规则](../../README.md)。

状态：本地源码整合完成；尚未提交、推送或运行远程 CI。M0 发布仍为 NO-GO。

- 远程基线：`82d34f0518e340fb0077dddd74ee004305ed56c6`。
- 当前工作文件指纹：`0be07f6e9d3568630d00b7b46a592966b908da6f1356af0bfb7944558e8bae89`。
- 指纹范围：Core/Agent、React、部署脚本、工具、测试、catalog/profiles、CI 配置及根契约文件。
  排除 Git、依赖目录、dist/build、Python 缓存及证据目录；包含 Core 当前内嵌 React 资源。
- 本地 HEAD：无初始提交，不能以远程 SHA 代替本轮源码的提交身份。

| 检查 | 本轮结果 |
| --- | --- |
| 远程后端源文件/消息目录保留 | 884 个路径按模块/API/命名空间契约适配后相符，无差异 |
| Core 全包测试 | PASS；真实隔离 Agent socket 门槛用例未执行 |
| Agent 全包测试 | PASS；隔离 Docker/socket 环境门槛用例未执行 |
| vLLM SQLite 迁移 | PASS；旧行保留、重复迁移、离线备份恢复；不是主机升级验收 |
| Python 回归 | 225 tests，PASS |
| React 类型检查 | PASS |
| Node 回执/证据测试 | 10 tests，10 pass，0 fail，0 skip |
| React 生产构建 | PASS |
| 模拟 API 浏览器负向检查 | PASS；验证码、MFA、取消、丢失响应、刷新回执、防重复、UNKNOWN 禁止变更及字段脱敏；无页面运行错误 |
| 本地前端与 Core/Agent 实际二进制组装 | PASS，离线依赖构建；没有执行二进制 |
| 预览包结构/内容摘要 | PASS，installable=false |
| 依赖清单 | 已按 pnpm lock + Go module 生成；不是许可证放行 |
| Bash / workflow YAML | 语法检查 PASS；未执行工作流或安装脚本 |
| Git 来源归档归属证明 | BLOCKED：source_commit=unknown |
| 真实浏览器→Core、真实 Docker、Ubuntu 安装/升级/恢复 | NOT RUN |

预览产物：`/home/avaarg/GPUPanel/dist/gpupanel-preview.tar.gz`。
SHA-256：`e9d401062ef2a52569eb03c05a4c7035840e6c8620dcae246d9c169998a636f9`。
仅作为本地源码预览，不能用于宣称安装、生产交付或不可变 Git 来源证明。
保留 [远程匹配摘要](remote-fidelity.json)、[构建模块](binary-metadata.json) 与
[预览核验](preview-verify.json)；依赖清单随发布流程生成，不在验收目录重复保存。

原始本地源码快照：
`/home/avaarg/GPUPanel-integration-backups/local-before-remote-main-20261015.tar.gz`。
其摘要、边界及回退方法见 [整合说明](../../../gpupanel/LOCAL_REMOTE_INTEGRATION.md)。
