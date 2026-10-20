# GPUPanel Desktop — Ubuntu 24.04 本地工作站（开发预览）

定位：**新 Ubuntu 电脑先把基础开发工具和 Profile 恢复起来**，不强制安装 Docker、GPUPanel Core/Agent 或 Kubernetes。Wails v3 作为独立桌面宿主，原生终端与 IDE 直接在用户桌面启动；DevPod/Dev Containers 与远程服务均为显式可选能力。

目前是源码预览：不代表已签名的 DEB/AppImage，不代表 Ubuntu 实机验收通过。

## 源码启动

要求：Ubuntu 24.04、Go 1.26+、GTK4、WebKitGTK 6.0。Wails GUI 本身需要图形库，但不依赖 Docker。

    sudo apt update
    sudo apt install build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev
    go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.30
    cd desktop
    go mod tidy
    wails3 generate bindings -names
    wails3 doctor
    go run .

从仓库根目录或 desktop 目录运行。本切片 Go 服务需要查找仓库里的 Python 控制器，**尚未打包成无需源码树的独立可安装程序**。go.sum 仍须由联网 Ubuntu 构建并审核提交。

## 本地 CLI

    python3 scripts/gpupanel-workstation.py doctor
    python3 scripts/gpupanel-workstation.py install-plan
    python3 scripts/gpupanel-workstation.py env
    python3 scripts/gpupanel-workstation.py restore --approve-digest <profileDigest>
    python3 scripts/gpupanel-workstation.py install --approve-digest <planDigest>
    python3 scripts/gpupanel-workstation.py export ./my-workstation.json
    python3 scripts/gpupanel-workstation.py --profile ./my-workstation.json doctor
    python3 scripts/gpupanel-workstation.py devpod-plan "$HOME/GPUPanel/projects/my-project"

- doctor：检查本机 PATH 和 dpkg 包安装状态；即使 Docker/Core/K8s 缺失，也不阻断本机基础能力。检查到命令存在不代表运行时已验收。
- install-plan → install：只允许所选 Profile 固定白名单的 apt 软件包。执行前要求计划摘要及 Polkit 授权，不向 WebView 暴露任意命令或 shell 字符串。失败或超时记录 UNKNOWN，拒绝自动重试；应核查 dpkg 和 apt 日志。
- restore：只写当前用户的无凭据 JSON Profile，摘要不匹配、已存在不同数据或符号链接均拒绝，绝不覆盖文件。
- env：输出临时 shell 会话中可手动选择的 HTTPS 镜像变量，不自动更改全局 apt/uv/npm/pip 配置。
- export：导出 Profile JSON；不包含工作区文件、IDE 插件、SSH 私钥或 Token。
- devpod-plan：有 DevPod、Docker CLI 和现成 devcontainer.json 时，仅展示基于 openvscode 的浏览器 IDE 启动计划；真实 Provider/容器/端口开放都需要另行人工授权及验收。

## Profile 迁移：从旧电脑到新电脑

旧机 CLI 导出至用户自己维护的备份目录：

    mkdir -p ~/GPUPanel/backups
    python3 scripts/gpupanel-workstation.py export ~/GPUPanel/backups/workstation-profile.json

将上述 `workstation-profile.json` 手动复制至新机的 `~/GPUPanel/backups/`，在新机仓库根目录下执行：

    python3 scripts/gpupanel-workstation.py --profile ~/GPUPanel/backups/workstation-profile.json doctor
    python3 scripts/gpupanel-workstation.py --profile ~/GPUPanel/backups/workstation-profile.json restore --approve-digest <doctor 的 profileDigest>

桌面页面也支持同样的固定备份文件名导出、预检和二次确认导入。Profile 仅记录白名单软件清单与非敏感镜像 URL，**不会自动安装软件、应用镜像设置、拉取源码或恢复工作区数据**。配置目标已经存在且内容不同则必须先人工处理冲突，程序不能覆盖。镜像 URL 只是建议，不代表制品已验证。

本次新增 CLI 跨两个隔离用户 Home 的 export→preview→restore→重复导入→冲突拒绝测试：

    python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_profile_transfer.py' -v

## 新机项目骨架离线迁移（无 Docker）

在旧电脑的普通 Ubuntu 用户目录中，选择已经存在的 `~/GPUPanel/projects/<project>` 项目。快照只包含固定白名单文件：`pyproject.toml`、`uv.lock`、`README.md`、`main.py`、Node/Go 锁文件、Dev Container 定义和 VS Code 扩展清单。不包含完整源码仓库、数据目录、虚拟环境、容器卷或 SSH 凭据。**白名单文件本身仍可能含敏感值，导出前必须由操作者人工检查。**

旧机导出：

    mkdir -p ~/GPUPanel/backups
    python3 scripts/gpupanel-workspace-bundle.py export uv-python-starter ~/GPUPanel/backups/uv-python-starter-scaffold.zip

将 ZIP 通过可信的移动存储复制到新机同名目录后，先检查并抄取 `bundleDigest`：

    python3 scripts/gpupanel-workspace-bundle.py inspect ~/GPUPanel/backups/uv-python-starter-scaffold.zip
    python3 scripts/gpupanel-workspace-bundle.py restore ~/GPUPanel/backups/uv-python-starter-scaffold.zip --approve-digest <bundleDigest>

- ZIP 条目、逐文件 SHA-256、文件大小和项目名全部受限；验证失败不落盘。
- 恢复只写入**不存在**的项目路径；Linux `renameat2(RENAME_NOREPLACE)` 独占发布，遇到已有目录一律拒绝覆盖。停电等操作结果不明时先检查目标目录。
- Desktop 新增导出、检查、人工确认恢复入口，固定从 `~/GPUPanel/backups/` 读取。当前仍依赖源码树，不是交付完整工作区的一键备份工具。
- 后续真正恢复完整代码请结合受控 Git remote + 固定 commit，以及独立的数据备份方案；此功能不代替 Git、磁盘备份或凭据迁移。

测试：

    python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_workspace_bundle.py' -v

**国内镜像分发尚未完成**：仓库原有 gpupanel-bootstrap.py 提供锁文件与 SHA-256 制品缓存/离线 Bundle 校验，但是目前尚无经过审核的真实应用制品清单，不能把镜像 URL 配置误认成可用的一键分发。

## 测试

    python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_workstation.py' -v
    node --check desktop/ui/app.js
    cd desktop && go test ./...

| 验收项 | 当前状态 |
| --- | --- |
| Profile 校验、拒绝不安全镜像和包、拒绝覆盖 | Python 单元测试 |
| 无 Docker / Core / K8s 的本地模式 | Python 契约测试；GUI NOT RUN |
| Ubuntu 非 root + Polkit 系统安装及恢复 | NOT RUN |
| Wails 桌面实机 GTK/WebKit/终端/IDE 启动 | NOT RUN |
| 国内离线镜像缓存与真实软件安装 | NOT RUN（此前仅有工具和合成制品测试） |
| DevPod 浏览器 IDE 真实创建/停止/恢复 | NOT RUN |
| 离线骨架锁文件/配置快照与新目录恢复 | 具备源码与单测，真实跨机 NOT RUN |
| 跨机器无密钥 Profile 导出/预检/导入 | Ubuntu CLI 合约测试；GUI 真机 NOT RUN |
| 新机完整源码、数据和个人 IDE 设置/扩展恢复 | NOT IMPLEMENTED |
| 原有 GPUPanel Host G3–G6 | 仍 M0 NO-GO |

源码与模拟检查不能代替目标 Ubuntu 的真实终端会话/GUI/安装/恢复证明。不在生产 1Panel 主机上测试系统安装器。
