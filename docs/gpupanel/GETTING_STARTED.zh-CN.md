# GPUPanel：5 分钟认识项目（Ubuntu 24.04）

> **当前是开发预览版，不是可执行的一键安装正式版本。** 请不要使用 1Panel 官网安装命令当作 GPUPanel 安装器。

## 1. 我能获得什么？

GPUPanel 由 1Panel GPL-3.0 开源版 Fork 而来。现阶段继承 Linux Host、Docker、终端、文件、GPU 监控等已有功能。项目已经加入独立品牌、Host 优先快捷入口、独立 Ubuntu 环境体检及校验后的离线 Bundle 工具。Kubernetes、Kueue、训练/推理平台和 MetaX 驱动支持还没有在本仓库验收，不能当成已交付功能。

## 2. 在 Ubuntu 桌面快速检查（无需 root）

```bash
git clone --branch dev-v2 https://github.com/avaargsh/gpupanel.git
cd gpupanel
python3 scripts/gpupanel-bootstrap.py doctor --human
python3 scripts/gpupanel-bootstrap.py plan --human
python3 scripts/gpupanel-bootstrap.py self-test --human
```

- `FOUND` 只表示系统 PATH 能找到该命令，不证明版本符合要求、Docker Daemon 可用或 GPU 驱动正确。
- `MISSING` 不会触发自动安装；按需要选择软件，无需一次装齐。
- `self-test` 只用合成数据测试 SHA-256 和离线包往返，不会访问网络或更改主机配置。
- 初始 `profiles/ubuntu24-dev.lock.json` 没有可下载的真实软件制品，这是有意限制：没有审核过的版本、哈希与许可证前，不能宣称“一键安装”。


## 可选：Python / PyTorch 运行环境诊断（不安装软件）

直接查看当前 Python 解释器与 PyTorch 包元数据，**默认不会导入 PyTorch**：

```bash
python3 scripts/gpupanel-python-doctor.py --human
python3 scripts/gpupanel-first-run-overview.py --human
```

若信任当前环境中的 PyTorch，可显式检查它能否看到 CUDA/HIP 加速设备：

```bash
python3 scripts/gpupanel-python-doctor.py --probe-torch --human
```

这一步会在限时独立进程中导入第三方 PyTorch，可能初始化 GPU 上下文或生成用户缓存。它不执行安装、下载或修复，也不会运行 `pip install`、`nvcc`、`nvidia-smi`。检查显示 `ACCELERATOR_AVAILABLE` 仅代表当前 PyTorch 运行时能看到加速设备，**不代表本机 CUDA Toolkit、PyTorch 算子、Jupyter、训练和推理环境已验证**。退出码 0 只代表诊断命令执行，不能用作环境安装成功的门禁。


## 3. 两种不同的“安装”操作

**A. 当前可用的是 Python 项目文件创建（不是安装 Python）：** 需要 Python 3.12+，在普通 Ubuntu 用户的终端、仓库根目录执行：

```bash
python3 scripts/gpupanel-catalog.py plan gpupanel.dev.python-stdlib
python3 scripts/gpupanel-catalog-workspace.py plan
# 检查路径和文件清单后，再主动批准写入：
python3 scripts/gpupanel-catalog-workspace.py install --approve
python3 scripts/gpupanel-catalog-workspace.py status
python3 scripts/gpupanel-catalog-workspace.py list
python3 ~/GPUPanel/projects/python-stdlib-starter/main.py
# 可选：修改过的项目会拒绝删除：
```

**可选清理：以下命令需单独执行，避免整段复制时创建后立即删除。**

```bash
python3 scripts/gpupanel-catalog-workspace.py uninstall --approve
```

**B. 源码包暂存只用于检查文件（不是安装 GPUPanel）：** 需要相应 Node/npm、Go 依赖才能完成构建。

```bash
python3 scripts/gpupanel-release.py build --version dev
python3 scripts/gpupanel-release.py verify dist/gpupanel-preview.tar.gz
python3 scripts/gpupanel-preview-stage.py plan dist/gpupanel-preview.tar.gz
# 检查来源、摘要、目录后才手动批准暂存：
python3 scripts/gpupanel-preview-stage.py stage dist/gpupanel-preview.tar.gz --approve
python3 scripts/gpupanel-preview-stage.py status dev
```

**可选清理：以下命令需单独执行，避免整段复制时创建后立即删除。**

```bash
python3 scripts/gpupanel-preview-stage.py remove dev --approve
```

暂存目录为 `~/GPUPanel/previews/source-dev/`，Core/Agent 文件不可执行；**不启动服务、不安装 systemd、不设置管理员、不开放网络端口、不覆盖现有 1Panel**。自带的 SHA-256 校验并不等于验证发行者签名，详见 [预览暂存边界](PREVIEW_STAGING.md)。

独立 GPUPanel 系统安装依然受旧 `1pctl`、`/etc/1panel`、Core/Agent 数据库和其他旧路径约束。使用 `python3 scripts/gpupanel-runtime-namespace.py --strict --human` 查看阻塞；非零退出是预期结果。详见 [运行隔离](RUNTIME_ISOLATION.md)。

## 4. 前端开发预览

需要 Node/npm、依赖可正常访问。初次构建：

```bash
cd frontend
npm ci
npm run build:pro
npm run type-check
```

以上只验前端，不代表完整服务端启动；运行 Core/Agent 还需按 upstream 项目开发规范准备 Go 工具链、数据库等依赖。请勿把这套源码部署在存放重要数据的生产主机上做初次试验。

## 5. 出问题怎么办

- 国内 npm 或 Go 下载受阻：先解决可信镜像访问；不要执行来源不明的 `curl | bash`。后续会在 Lock 中固定制品 SHA-256，再用离线 Bundle 搬迁。
- `doctor` 提示非 Ubuntu 24.04：只表示环境不在本阶段测试矩阵，不代表命令可以安全兼容其他系统。
- 无 GPU：Host/Docker 功能仍可使用；GPU 监控属于可选能力。
- 页面不显示某功能：可能受当前身份权限约束，不要绕过 RBAC。

问题反馈请提交 GitHub Issue，附版本、复现步骤与脱敏后的日志，**不要上传 Token、密码、真实 IP、序列号或客户数据**。

## 6. 产品路线

**个人 Ubuntu Host → 企业 Host 纳管 → Kubernetes Provider → GPU 训练与推理门户。** 详细边界参见 [产品组织](PRODUCT.md) 和 [路线图](ROADMAP.md)。
