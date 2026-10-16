# GPUPanel 文档入口

当前工程使用 React 19 / Semi Design / pnpm，以及独立 Go Core、Agent 模块。
日常开发从下表进入；验收结论以对应日期、文件指纹或产物摘要为准。

| 用途 | 文档 |
| --- | --- |
| vNext 工作台基线 | [设计、能力边界与开发顺序](gpupanel/VNEXT_WORKBENCH.md)、[领域术语](../GLOSSARY.md) |
| 工程目录与边界 | [目录规范](engineering/project-structure.md) |
| 开发、配置与构建 | [开发指南](engineering/development.md) |
| 验收资料保留与预算 | [证据索引与规则](evidence/README.md) |
| 回归测试与证据分类 | [测试指南](engineering/testing.md) |
| 本地真机安装 | [安装边界与操作说明](operations/host-install.md) |
| 本机隔离安装与停止 | [本地 VM 安装测试](operations/local-install-test.md) |
| 本地主机诊断与受控运维 | [集成、授权与回执契约](engineering/host-operations.md) |
| Intel GPU 识别 | [探测方式与能力边界](operations/intel-gpu.md) |
| GeoIP 获取与恢复 | [操作说明](operations/geoip.md) |
| 当前真机安装结果 | [真实主机/终端/Docker链路](evidence/2026-10-16/host-install/RESULTS.md) |
| 上一轮 VM 安装结果 | [本轮证据](evidence/2026-10-16/local-install/RESULTS.md) |
| 1Panel 优化与本地 React 整合 | [整合说明](gpupanel/LOCAL_REMOTE_INTEGRATION.md) |
| 上一轮源码整合证据 | [历史证据](evidence/2026-10-15/remote-integration/RESULTS.md) |
| 产品与后续门槛 | [ROADMAP](gpupanel/ROADMAP.md)、[GOLDEN_PATH](gpupanel/GOLDEN_PATH.md) |
| 工程契约与贡献 | [AGENTS](../AGENTS.md)、[CONTRIBUTING](../CONTRIBUTING.md) |

`gpupanel/` 保留上游整合、领域设计、历史阶段的专题资料。其旧 Vue/npm/API-v2
命令仅对对应基线成立；当前执行命令以 `engineering/` 和 `operations/` 为准。
`evidence/<日期>/<工作项>/` 保存已脱敏的可复核结果，不存密码、会话、私钥或 VM 磁盘。
