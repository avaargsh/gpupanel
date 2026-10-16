# 本地主机诊断与受控运维

入口：**主机 → 诊断与运维**（`/host?tab=operations`）。本轮按用户选择接入
agentaliyun 的操作意图、预览确认与分阶段回执能力，独立实现于 GPUPanel。

## 来源与取舍

参考 `/home/avaarg/workspace/agentaliyun/agent/assist-agent/controlplane/` 的
`mgmt/mgmt.go` 与 `hostops/host.go`。该目录未提交、没有可用 nested HEAD，
不能用外层仓库 SHA 代表这些文件。README 对许可证有相互矛盾的描述，未发现
该目录的 LICENSE/NOTICE。因此本轮没有复制其实现、二进制、还原材料或依赖。
参考文件指纹用于定位所读设计，见下表；不据此宣称上游发布或许可已经验证。

| 参考文件 | SHA256 |
| --- | --- |
| `mgmt/mgmt.go` | `04c720bc65558eebb4d6e7d8820e6ca5d516c1b75b09cebf7098ad6cd98d4e27` |
| `hostops/host.go` | `08fb64036cd81a0da6f1fb77a6e03592b570eb65c58972da51997fb17668eaa7` |

未移植其 self-asserted header 认证、漏字段审批摘要、内存控制面或云端协议。
复用 GPUPanel 的 Cookie/CSRF、Core→私有 Agent、真实 Docker SDK 与硬件采集。
不新增 Agent/MCP 一级导航、云端心跳或模型调用。

## 使用与执行契约

1. 选择“诊断本机”，或填写运行中容器的**完整 64 位 ID**选择“重启指定容器”。
2. 预览操作，核对 `local`、完整目标、影响、有效期与 operation ID。
3. 确认后才执行。刷新或请求失败时先查询回执，不自动重发执行操作。
4. 诊断结果是读取到的 OS、根文件系统及加速器清单；不读取环境变量、进程参数、
   SSH 凭据或云元数据。容器重启需再次 inspect，目标与预览状态不符时拒绝执行。
5. 重启响应后独立 inspect 同一容器；仅在 running 且 StartedAt 已变化时标记 verified。
   这证明容器进程重新运行，不证明应用健康或业务就绪。重启没有自动回滚。

| 状态 | 含义 |
| --- | --- |
| planned | 意图已保存，尚未执行，确认有效期五分钟 |
| running | 已原子占用执行位置 |
| completed | 只读诊断完成并记录；不声称完成业务修复 |
| verified | 容器重启后的目标观测满足上述有限条件并落库 |
| failed | 执行前条件不满足或明确失败；不会自动重试 |
| unknown | 超时、重启响应/观测丢失或执行回执未能核对；先查目标，禁止同 ID 重放 |

预览摘要绑定 operation ID、owner/session、kind、target、host、观测前提、影响、
过期时间和固定执行时限。确认只接受 ID、原摘要与显式 confirm；执行参数不由
浏览器再次提交。重复确认返回同一回执，不能再次执行。调用方生成的幂等 key
只用于同一会话下的预览去重，参数变化返回拒绝。

## 认证、作用域和边界

- Core 仅允许有效的本机 superadmin Cookie 会话；拒绝匿名、普通用户、API key、
  远程 CurrentNode/operateNode。沿用 CSRF，清除客户端伪造的可信身份 header。
- Agent 仅从私有 socket 接受 Core 转发的可信 owner；回执绑定登录会话。
  新登录会话不展示旧会话回执，旧审计记录仍保留在数据库，不能据此推断其丢失。
- Docker 固定 `unix:///var/run/docker.sock`，不跟随 Desktop context、环境变量或
  GPUPanel 的可配置远端 Docker endpoint。界面明确展示该目标。
- 当前只有单机管理员边界；没有接入来源项目的组织、项目 RBAC、批量操作、
  任意命令、文件分发、升级、自更新、云端控制面、监控 Agent 或安全 Agent。
- 一个持久 SQL claim 控制全局最多一个 running 操作。无后台队列或自动重试。
  预览最多五秒，执行最多二十秒；running 超过二十五秒查询时转 unknown。
  HTTP 连接中断后尽力记录结果；数据库写入失败不返回成功回执。

## 持久化、留存与恢复

`agent/init/migration/migrations/host_operations.go` 在现有 `task.db` 追加
`host_operation_receipts` 表；不改既有 Task 行和 API。迁移可重复执行。
回执是独立的受控操作记录；现有全局任务列表不会自动包含这些记录。

每个结果最多 16 KiB，错误最多 512 bytes；当前会话最多查询最近 50 条。
数据库达到 500 条时拒绝新预览，先导出并审查保留策略，不自动删除审计。
未来需要保留清理界面或跨会话授权读取时，应添加显式 owner/审计契约后再替换
这个容量拒绝策略；不要通过后台无界增长或按日期盲删规避上限。

部署前停服并备份当前安装，离线提取检查数据库及二进制。代码回退保留追加表，
不删除审计；完整快照恢复只适用于尚未产生需要保留的新操作记录的回滚窗口。
已验证临时 SQLite 旧 Task 保留、重复迁移和旧快照恢复；不冒充生产回滚演练。

## 复核命令

```sh
(cd agent && go test -race ./app/hostops ./app/api/v1 ./init/migration/migrations)
(cd core && go test -race ./init/router)
python3 scripts/browser/run-react-tests.py
```

浏览器脚本使用模拟 API，验证预览不执行、明确确认、刷新不重放、未知结果查询及
1024px 布局，不能代表安装中的浏览器→Core→Agent 通过。真实 Docker 用例为
`TestOwnedDockerRestartLifecycle`，默认 SKIP；仅接受显式提供的本轮专用、无网络、
无挂载、非特权 canary 的完整 ID 与匹配标签。不要向该用例传入业务容器。

本轮固定源码、真实安装与 canary 结果见 [验收摘要](../evidence/2026-10-16/host-operations/RESULTS.md)。
