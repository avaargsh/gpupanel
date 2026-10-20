# GPUPanel Desktop — Ubuntu 24.04 本地工作站（开发预览）

定位：**新 Ubuntu 电脑先把基础开发工具和 Profile 恢复起来**，不强制安装 Docker、GPUPanel Core/Agent 或 Kubernetes。Wails v3 作为独立桌面宿主，原生终端与 IDE 直接在用户桌面启动；DevPod/Dev Containers 与远程服务均为显式可选能力。

目前是源码预览：不代表已签名的 DEB/AppImage，不代表 Ubuntu 实机验收通过。

## 源码启动

要求：Ubuntu 24.04、Go 1.26+、GTK4、WebKitGTK 6.0。Wails GUI 本身需要图形库，但不依赖 Docker。

    sudo apt update
    sudo apt install build-essential pkg-config libgtk-4-dev libwebkitgtk-6.0-dev fonts-noto-cjk
    go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.30
    cd desktop
    go mod tidy
    wails3 generate bindings -names
    wails3 doctor
    go run .

从仓库根目录或 desktop 目录运行开发源码。现在 **Wails Go 二进制内嵌经过仓库测试校验的 Python 执行器和默认 Profile**，复制到没有 GPUPanel 源码的目录时也能执行本地 `doctor`、Profile 与项目骨架功能。仍需 Ubuntu 系统 Python 3 以及 GTK4/WebKitGTK 运行库，但不需要 Docker、Core、Agent 或 Kubernetes。Go 依赖版本与校验和已由 Ubuntu 预览构建确认并提交至 `desktop/go.mod`、`desktop/go.sum`，CI 以 `-mod=readonly` 验证；**当前仍不是生产签名发布包**。

## 可移植 Ubuntu x86_64 预览二进制（非正式安装包）

PR 的 GitHub Actions `GPUPanel Desktop Ubuntu Preview` 会在 Ubuntu 24.04 amd64 生成**未签名、短期保留的预览压缩包**，附独立的 `*.sha256` 文件和产物内的源码提交信息。进入对应 [PR #162 Actions](https://github.com/avaargsh/gpupanel/pull/162/checks)，下载名为 `gpupanel-desktop-ubuntu24-amd64-preview` 的 Artifact。仅在可信的 Ubuntu 24.04 测试桌面上尝试，不要在生产机器使用。

    # 将下载的 tar.gz 与 tar.gz.sha256 放在同一个目录
    sha256sum -c gpupanel-desktop-preview-ubuntu24-amd64.tar.gz.sha256
    mkdir -p ~/GPUPanel/desktop-preview
    tar -xzf gpupanel-desktop-preview-ubuntu24-amd64.tar.gz -C ~/GPUPanel/desktop-preview
    cat ~/GPUPanel/desktop-preview/build/provenance.txt
    # 若缺少 Wails 图形依赖，先通过 Ubuntu apt 源安装：
    sudo apt install python3 libgtk-4-1 libwebkitgtk-6.0-4 fonts-noto-cjk
    ~/GPUPanel/desktop-preview/bin/gpupanel-desktop

不需要克隆 GPUPanel 仓库，也不调用 GPUPanel 系统安装器。**SHA-256 只能校验传输完整性，不能证明 GitHub Artifact 的发布者身份**；此流程不具有包签名、DEB 安装/卸载/升级和离线供应链审核。GUI 图形登录、Polkit 以及对用户真实目录的读写尚需 Ubuntu 桌面真机验收。CI 中的临时私有脚本与内嵌默认 Profile 哈希由 Go 测试和 Git 仓库对应文件比对，防止漂移。测试仍不会证明完整工作区数据已恢复。

## GNOME 用户应用菜单快捷方式（显式授权）

在 `~/GPUPanel/desktop-preview/bin/gpupanel-desktop` 启动的桌面预览里，使用 `06 · DESKTOP MENU` 的“检查桌面入口计划”→审查 SHA-256 与目标路径→“确认创建桌面快捷方式”。

- 仅写入 `~/.local/share/applications/gpupanel-workstation-preview.desktop`，无 root、Polkit 或 `sudo`，不会启用后台服务。
- 不允许从 `go run` 等临时可执行文件位置注册快捷方式；只能是用户明确解压的标准预览路径。
- 若安装目录或可执行文件是软链接、安装位置变化、批准摘要变化、目标文件已存在则拒绝。不覆盖已有菜单配置。
- 没有图标资源打包和 `.deb` 系统级安装能力；这是一个当前用户可选择添加的预览菜单入口。

## Ubuntu 图形测试边界

GitHub Actions 在 Xvfb + Openbox 下实际启动 GTK4/WebKitGTK，并检查窗口标题、尺寸、键盘 Tab 事件和截图。Ubuntu Runner 对非特权用户命名空间有限制，会使 WebKitGTK Bubblewrap 沙箱启动失败。**只有单次 GitHub Actions 烟测进程**在检查到 `GITHUB_ACTIONS=true` 后才使用 WebKit 官方危险调试开关；应用源码、安装包、用户桌面启动均不设置该变量。此测试只证明合成 X11 图形环境可呈现窗口，**不证明正常沙箱下的 GNOME/Wayland 真机可用性**。

首次 Xvfb 截图发现最小 Ubuntu Runner 中文缺字，需安装 `fonts-noto-cjk`；预览运行说明明确要求该依赖。字体只是界面显示依赖，不涉及 GPU、Docker 或远程 Core。

## 本地 CLI

    python3 scripts/gpupanel-workstation.py doctor
    python3 scripts/gpupanel-workstation.py versions
    python3 scripts/gpupanel-workstation.py install-plan
    python3 scripts/gpupanel-workstation.py env
    python3 scripts/gpupanel-workstation.py restore --approve-digest <profileDigest>
    python3 scripts/gpupanel-workstation.py install --approve-digest <planDigest>
    python3 scripts/gpupanel-workstation.py export ./my-workstation.json
    python3 scripts/gpupanel-workstation.py --profile ./my-workstation.json doctor
    python3 scripts/gpupanel-workstation.py devpod-plan "$HOME/GPUPanel/projects/my-project"

- doctor：检查本机 PATH 和 dpkg 包安装状态；即使 Docker/Core/K8s 缺失，也不阻断本机基础能力。检查到命令存在不代表运行时已验收。
- versions：用户显式点击才限时读取 Git/Python/uv/Node/Go/Docker CLI/VS Code 的版本输出；不连接 Docker Daemon，不启用远程服务，也不将命令存在误报成环境已验收。
- install-plan → install：只允许所选 Profile 固定白名单的 apt 软件包。执行前要求计划摘要及 Polkit 授权，不向 WebView 暴露任意命令或 shell 字符串。失败或超时记录 UNKNOWN，拒绝自动重试；应核查 dpkg 和 apt 日志。
- restore：只写当前用户的无凭据 JSON Profile，摘要不匹配、已存在不同数据或符号链接均拒绝，绝不覆盖文件。
- env：输出临时 shell 会话中可手动选择的 HTTPS 镜像变量，不自动更改全局 apt/uv/npm/pip 配置。
- export：导出 Profile JSON；不包含工作区文件、IDE 插件、SSH 私钥或 Token。
- devpod-plan：只需 DevPod CLI 和现成的 devcontainer.json 才能展示 openvscode 浏览器 IDE 的预检计划。本地 Docker 并非 SSH/云 Provider 的先决条件；真实 Provider/容器/端口开放都需要另行人工授权及验收。

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

## 独立桌面创建本地 uv Python 工作区（不依赖 Docker）

桌面页面新增 `07 · PYTHON WORKSPACE`：检查计划 → 审核摘要 → 用户确认创建 → 只读复核。复用仓库内已经有测试的 `gpupanel-uv-project.py`，而不是新编写项目模板引擎。

- 目标固定为 `~/GPUPanel/projects/uv-python-starter`；只在目录不存在时创建。模板包含 `README.md`、`main.py`、`pyproject.toml`、`uv.lock` 和生成回执，不覆盖、删除既有项目。
- 需要用户**先自行安装可信来源的 uv** 与 Ubuntu Python 3。没有 uv 时页面返回 `MISSING_UV`，不会调用安装脚本、强制依赖 Docker 或创建半成品项目。
- `uv init` 和 `uv lock` 在离线模式中运行，拒绝下载 Python、第三方包和项目配置覆写；成功后须验证锁文件与生成回执。失败/超时不发布完整项目目录。
- 当前仅提供标准 Python 入门工作区。并未实现第三方依赖在线安装、GPU 微调模板、源码仓库拉取或完整工作环境恢复。用户数据要单独备份。

原仓库已包含 CLI 形式的独立验收：

    python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_uv_project.py' -v

Desktop 将 Python 执行器及其 Catalog 验证依赖内嵌到桌面二进制，Go/CI 检查其字节与上游源码一致；可从未克隆 GPUPanel 的新电脑启动。CI 可能因未预装 uv 而跳过真实 `uv init/lock/run`，跳过不算真机项目安装通过。

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
- Desktop 新增导出、检查、人工确认恢复入口，固定从 `~/GPUPanel/backups/` 读取。桌面预览已内嵌所需脚本，但这仍不是完整工作区的一键备份工具。
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
| 源码目录外的内嵌工具 Doctor/Profile 操作 | Go 契约测试；真实新机 GUI NOT RUN |
| Xvfb 单次不启沙箱图形窗口/键盘/截图 | GitHub Ubuntu CI；不等于正常沙箱 GUI |
| Wails 桌面实机 GTK/WebKit/终端/IDE 启动 | NOT RUN |
| 国内离线镜像缓存与真实软件安装 | NOT RUN（此前仅有工具和合成制品测试） |
| DevPod 浏览器 IDE 真实创建/停止/恢复 | NOT RUN |
| 离线创建本地 uv 项目 | Go/CLI 预览契约；uv 真机生成按条件执行 |
| 离线骨架锁文件/配置快照与新目录恢复 | 具备源码与单测，真实跨机 NOT RUN |
| 跨机器无密钥 Profile 导出/预检/导入 | Ubuntu CLI 合约测试；GUI 真机 NOT RUN |
| 新机完整源码、数据和个人 IDE 设置/扩展恢复 | NOT IMPLEMENTED |
| 原有 GPUPanel Host G3–G6 | 仍 M0 NO-GO |

源码与模拟检查不能代替目标 Ubuntu 的真实终端会话/GUI/安装/恢复证明。不在生产 1Panel 主机上测试系统安装器。
