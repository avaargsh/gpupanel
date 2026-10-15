# 工具索引

保留 `gpupanel-*` 稳定入口。CLI 的 `--help` 为实际参数依据；运行前先区分只读
检查、用户目录变更和系统安装。不要把受理成功当成外部资源完成证明。

| 类别 | 入口 |
| --- | --- |
| 环境与起步 | `gpupanel-bootstrap.py`、`gpupanel-python-doctor.py`、`gpupanel-first-run-overview.py` |
| 本地软件定义/用户工作区 | `gpupanel-catalog.py`、`gpupanel-catalog-workspace.py` |
| uv 环境与项目 | `gpupanel-env.py`、`gpupanel-env-packages.py`、`gpupanel-uv-project.py`、`gpupanel-uv-lock-check.py` |
| 主机/Docker 只读诊断 | `gpupanel-host-investigate.py`、`gpupanel-install-preflight.py`、`gpupanel-runtime-namespace.py` |
| 隔离 Docker 测试 | `gpupanel-docker-smoke.py`，仍需核对目标 daemon 与精确资源所有权 |
| 预览构建/暂存 | `gpupanel-release.py`、`gpupanel-preview-stage.py` |
| 来源与依赖清单 | `gpupanel-license-audit.py`、`gpupanel-artifact-license-audit.py`、`gpupanel-binary-buildinfo.py`、`gpupanel-dependency-audit.py` |
| 旧商店来源审计 | `gpupanel-legacy-catalog-audit.py` |
| 远程分支维护 | `gpupanel-prune-merged-branches.py`，默认 dry-run |
| 模拟浏览器测试 | `browser/run-react-tests.py` |
| 本机一次性 VM | `install-test/vm.py`；[安装手册](../docs/operations/local-install-test.md) |
| GeoIP VM 修复复核 | `install-test/geoip.py`；[前提与范围](../docs/operations/geoip.md) |
| 真机验收（限定本次主机） | `host-install/prepare.py`、`browser.py`、`runtime.py`；[操作边界](../docs/operations/host-install.md) |
| Python 回归 | `tests/` |

`gpupanel-pnpm-inventory.py` 是依赖审计内部模块，不是包安装器。
生产系统安装仍由 `deploy/` 负责；VM 辅助工具不会在宿主机调用安装器。
