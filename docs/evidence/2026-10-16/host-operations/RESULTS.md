# 本地主机诊断与受控运维验收

源码与安装二进制：`8400884a1605167b601d6b6eb0c31c0f8c26adb1`，两二进制
build info 均 `vcs.modified=false`。安装摘要见 [installed.json](installed.json)。
本机 Ubuntu 26.04 实验安装；用户选择的范围是本地主机诊断与受控运维。

实现与来源取舍见 [集成契约](../../../engineering/host-operations.md)。来源项目的
未提交控制面仅作为设计参考，没有复制其不完整认证/审批、还原资产或代码。

| 验证 | 本轮结果 |
| --- | --- |
| Core / Agent 全包 `go test ./...` | PASS；外部环境门槛测试不由此记为通过 |
| Engine/API/迁移与 Core router 的 race 测试 | 独立复审固定上述 SHA，无缓存复跑 PASS |
| 负向与故障 | 参数/owner 篡改、过期、拒绝确认、重放、并发、unknown 恢复、容量限制、Docker 目标变化与响应/观测丢失通过 |
| SQLite | 旧 Task 保留、重复迁移、临时旧快照恢复通过 |
| 前端 | 冻结依赖安装、类型检查、生产构建、14 项单元测试 PASS |
| 浏览器 | 三套模拟 API 回归 PASS，含预览不执行、明确确认、刷新不重放、未知结果查询、1024px 布局；不是部署验收 |
| Python / 资料预算 | 233 项 PASS；预算与链接检查通过 |
| 本机原生 Docker | 编译的真实 Engine/LocalRunner 重启本轮自建隔离容器，独立 inspect 后验证，重放不重启；canary 已删除，既有容器 ID/状态一致 |
| 安装中的 Agent API | 私有 Unix socket 上的真实诊断、拒绝未确认、回执落库、重放返回同一结果、跨会话拒绝、输出 DTO 脱敏通过 |
| 公共 Core | 匿名/伪造身份读取与提交均应用层拒绝；旧接口可能 HTTP 200 + code=401，未误判成已认证 |
| 安装保留 | 当前二进制哈希与构建一致；更新前后账号/入口及既有 Task 行摘要一致；备份提取后 task.db quick_check=ok |
| 已登录真机浏览器→Core→Agent | NOT RUN；不将模拟浏览器或私有 socket 检查称为该链路通过 |

真实 Docker 结果见 [docker-canary.json](docker-canary.json)：该组件测试绑定
`d90a8c9be6eb`，构建/执行前后源码 SHA 与 clean 状态一致。随后保留并合入
远程 #95 终端鉴权修复；集成 SHA 下 hostops 实现与该组件提交逐字一致，独立复审
及 Core/Agent 全包与相关 race 检查重新通过，安装中的诊断 API 也重新验证。测试容器无网络、挂载或发布端口，非特权，使用
UID/GID 65534；仅操作确切 ID 与本轮标签，不使用 prune。

备份：`/var/backups/gpupanel/installed-20261016T011114Z/`。
追加的回执表不改旧 Task 行。回退二进制时保留审计；未在有新回执后覆盖旧快照，
也未执行安装中断/异常终止的真实业务恢复演练。

容器 verified 仅证明同一容器 running 且 StartedAt 已变化，不等于应用健康。
未接入任意 Shell、批量/远程执行、云端控制面、模型调用、monitor-agent 或
security-agent。宿主机验证码/账号设置未修改。

按 [保留规则](../../README.md) 仅保存本摘要与两份关键回执，不追加完整测试日志或截图。
