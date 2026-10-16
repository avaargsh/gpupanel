# GeoIP 修复实测（2026-10-16）

> 历史验收摘要；本次仅整理资料，没有重跑以下测试。重复日志、整树清单和多余截图已清理，
> 原附件可从 Git `87c64f6ed2a52ea106a2d57a870165c3f1ce54e2` 找回。保留范围见 [归档规则](../../README.md)。

结论：下载路径已修复；当前二进制在本任务的一次性 Ubuntu 24.04 VM 中，从
GeoIP 文件缺失状态真实下载、校验并完成中英文查询，重启后仍可读取。此轮是
保留现有安装数据的二进制修复测试，不是重新安装或完整升级/回滚验收。

## 根因与变更

原地址 `https://resource.fit2cloud.com/1panel/resource/v2/geo/GeoIP.mmdb`
实测 HTTP 404。按 [上游官方打包脚本](https://github.com/1Panel-dev/1Panel/blob/dev-v2/ci/script.sh)
改用 `https://resource.fit2cloud.com/1panel/package/v2/geo/GeoIP.mmdb`，实测 HTTP 200。
国际站 `/v2/geo/GeoIP.mmdb` 的 GET 也返回 404，统一使用已验证数据源。

Core/Agent 下载都采用 90 秒 HTTP 超时、128 MiB 上限、同目录临时文件、全量
网络解码和原子替换；现有损坏文件会重试恢复，语言包失败不会跳过 GeoIP。
修复查询读取器未关闭，以及 GeoIP 缺失导致 SSH 历史全部不展示的问题。
两个独立 Go 模块保留同一小实现，避免引入运行期跨模块依赖。

## 执行与结果

- Core、Agent：`go test ./...` 均退出 0；详细重复日志已清理。
- 两模块：显式设置 `GPUPANEL_GEOIP_TEST_FILE` 后执行 `go test -race -v ./utils/geo ./init/<对应包>` 均通过。覆盖错误 HTTP、无效 MMDB、截断文件、保留旧文件、并发原子安装、真实文件及中英文查询。未提供真实文件时该集成用例明确 SKIP。
- `./deploy/build.sh --skip-frontend` 成功；本次未修改前端，复用上一轮构建的嵌入资源。默认包为 `gpupanel-v0.1.0-linux-amd64.tar.gz`，摘要见 `artifacts.sha256`；未将第三方数据库加入包，首次运行需联网。
- `scripts/install-test/geoip.py` 在已核对归属的运行中 VM 内停服备份旧二进制，再部署当前构建。初始数据库不存在；Core/Agent 各记录 validated MMDB 下载成功。
- 真实查询 `8.8.8.8`：英文 `United States`，中文 `美国`。数据库节点数 2294729，元数据类型 `GeoLite2-City`；实际记录采用项目使用的自定义字段。数据 SHA-256：`fcad15e747a1fc3091ff69c36609fa1bf0721f453ea3f019d03bf7002976c80b`，大小 19,565,776 bytes。
- VM 两服务正常重启后，数据库查询保持一致；已安装二进制摘要与当前构建一致，见 `vm.json`。
- 真实浏览器回归通过入口、登录、Host/Docker、已安装应用读取、匿名及无效 CSRF 拒绝；无页面异常，见 `browser-live.json`。没有模拟 API。
- 文档链接/目录 Python 检查通过；完整 Python 工具回归 229 项通过。
- 解包检查顶层目录、默认版本及 Core/Agent 摘要与当前构建完全一致。

宿主机日期为 2026-10-16（Asia/Shanghai）；guest 日志采用 UTC，因此成功记录显示
2026-10-15 16:56。未修改宿主机安装，未提交或推送。当前本地 `main` 尚无提交，
以 `source.sha256` 和产物摘要标识本次结果，不冒用远程 SHA。

## 仍未验证

上游语言 shell 包下载问题不在本次范围；GeoIP 首次下载完成前地址可暂时为空。
未验收真实 GPU、完整 App 生命周期、生产升级回滚或 M0 G3–G6；沿用既有 NO-GO。
数据源通过 HTTPS 获取但未固定发布摘要，本记录只证明本次具体文件；第三方数据库
再分发授权未审定，本仓库不新增其二进制。旧二进制在 guest
`/opt/gpupanel/geoip-repair-backup/` 保留，未声称执行过回退测试。
