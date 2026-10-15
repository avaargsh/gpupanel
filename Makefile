GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOARCH=$(shell go env GOARCH)
GOOS=$(shell go env GOOS)

BASE_PATH := $(shell pwd)
BUILD_PATH = $(BASE_PATH)/build

# 前端（React）源码与构建产物
WEB_PATH=$(BASE_PATH)/frontend
WEB_DIST=$(WEB_PATH)/apps/panel/dist

# 前端产物落到 core 的 embed 目录（index.html + assets/，勿动 web.go / favicon.png / static/）
WEB_ROOT=$(BASE_PATH)/core/cmd/server/web
ASSERT_PATH=$(WEB_ROOT)/assets
INDEX_PATH=$(WEB_ROOT)/index.html

CORE_PATH=$(BASE_PATH)/core
CORE_MAIN=$(CORE_PATH)/cmd/server/main.go
CORE_NAME=gpupanel-core

AGENT_PATH=$(BASE_PATH)/agent
AGENT_MAIN=$(AGENT_PATH)/cmd/server/main.go
AGENT_NAME=gpupanel-agent

.PHONY: all clean clean_assets upx_bin build_frontend build_core_on_linux \
        build_agent_on_linux build_core_on_darwin build_agent_on_darwin \
        build_backend build_all build_on_local deploy install

all: build_all

clean:
	rm -rf $(BUILD_PATH)

clean_assets:
	rm -rf $(ASSERT_PATH)

upx_bin:
	upx $(BUILD_PATH)/$(CORE_NAME)
	upx $(BUILD_PATH)/$(AGENT_NAME)

# 构建 frontend 并把 dist 拷进 core 的 embed 目录（保留 web.go / favicon / static）
build_frontend:
	cd $(WEB_PATH) && pnpm install --frozen-lockfile
	cd $(WEB_PATH) && pnpm build
	rm -rf $(ASSERT_PATH)
	cp -r $(WEB_DIST)/assets $(ASSERT_PATH)
	cp $(WEB_DIST)/index.html $(INDEX_PATH)

build_core_on_linux:
	cd $(CORE_PATH) \
	&& CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) $(GOBUILD) -trimpath -ldflags '-s -w' -o $(BUILD_PATH)/$(CORE_NAME) $(CORE_MAIN)

build_agent_on_linux:
	cd $(AGENT_PATH) \
	&& CGO_ENABLED=0 GOOS=$(GOOS) GOARCH=$(GOARCH) $(GOBUILD) -trimpath -ldflags '-s -w' -o $(BUILD_PATH)/$(AGENT_NAME) $(AGENT_MAIN)

build_core_on_darwin:
	cd $(CORE_PATH) \
	&& CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) -trimpath -ldflags '-s -w' -o $(BUILD_PATH)/$(CORE_NAME) $(CORE_MAIN)

build_agent_on_darwin:
	cd $(AGENT_PATH) \
	&& CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) -trimpath -ldflags '-s -w' -o $(BUILD_PATH)/$(AGENT_NAME) $(AGENT_MAIN)

# 只构建后端二进制
build_backend: build_core_on_linux build_agent_on_linux

# 全量：前端 + 后端
build_all: build_frontend build_core_on_linux build_agent_on_linux

build_on_local: clean_assets build_frontend build_core_on_darwin build_agent_on_darwin

# 构建 + 组装发布产物（frontend、后端二进制、pctl、配置、systemd 单元）
deploy:
	$(BASE_PATH)/deploy/build.sh

# 安装到 /opt（需 root）；等价于 deploy/install.sh
install:
	sudo $(BASE_PATH)/deploy/install.sh

# ---------------------------------------------------------------------------
# 开发环境（前端热更新 + 复用已安装后端）
# ---------------------------------------------------------------------------
# make dev        一键启动：安装前端依赖（如需）→ 确保后端在跑 → 起 Vite 热更新
#                 访问：http://<host>:4005 （Vite 把 /api/v1 反向代理到后端 :9999）
# make dev-stop   停止 `make dev` 起的前端开发服务器（不影响后端）
#
# 只起前端：   make dev-web
# 只确保后端： make dev-backend
# 只停前端：   make dev-stop
# 自定义端口： make dev DEV_WEB_PORT=5173 PANEL_PORT=9999
#
# 说明：后端是编译型 Go 二进制，源码改动后需 `make build_all && sudo make install`，
# 再 `pctl restart`（或 `make dev-backend`）才会生效；本目标不会改动已安装服务。
DEV_WEB_HOST ?= 0.0.0.0
DEV_WEB_PORT ?= 4005
PANEL_PORT   ?= 9999

.PHONY: dev dev-deps dev-backend dev-web dev-stop

dev: dev-deps dev-backend dev-web

# 前端依赖：node_modules 缺失时自动安装
dev-deps:
	@if [ ! -d "$(WEB_PATH)/node_modules" ]; then \
		echo "==> 前端依赖缺失，执行 pnpm install"; \
		cd $(WEB_PATH) && pnpm install; \
	fi

# 复用已安装的后端：:PANEL_PORT 没在监听就通过 pctl 拉起
dev-backend:
	@if ss -ltn 2>/dev/null | grep -q ":$(PANEL_PORT)"; then \
		echo "==> 后端已在 :$(PANEL_PORT) 运行"; \
	elif command -v pctl >/dev/null 2>&1; then \
		echo "==> 后端未运行，通过 pctl 启动"; \
		sudo pctl start; \
	else \
		echo "!! 后端未在 :$(PANEL_PORT) 运行，且找不到 pctl；请手动启动 gpupanel-core" >&2; \
		exit 1; \
	fi

# 前端 Vite 开发服务器（前台运行，Ctrl-C 退出）；代理目标跟随 PANEL_PORT
dev-web:
	cd $(WEB_PATH) && VITE_API_TARGET=http://localhost:$(PANEL_PORT) pnpm --filter @gpupanel/panel exec vite --host $(DEV_WEB_HOST) --port $(DEV_WEB_PORT)

# 停止前端 dev server：按 :DEV_WEB_PORT 找监听进程结束（只影响前端，不动后端）
dev-stop:
	@pid=$$(ss -ltnp 2>/dev/null | grep ":$(DEV_WEB_PORT) " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2); \
	if [ -z "$$pid" ]; then pid=$$(pgrep -f "vite --host $(DEV_WEB_HOST) --port $(DEV_WEB_PORT)" | head -1); fi; \
	if [ -n "$$pid" ] && kill "$$pid" 2>/dev/null; then \
		echo "==> 已停止前端 dev server (pid $$pid, :$(DEV_WEB_PORT))"; \
	else \
		echo "==> :$(DEV_WEB_PORT) 上没有前端 dev server"; \
	fi

# Local checks and isolated install testing (never install on the host).
.PHONY: help test-python test-core test-agent test-frontend test-browser install-test-vm install-test-status install-test-stop
help:
	@echo "build_all / deploy      Build source / assemble candidate payload"
	@echo "dev-web                 Frontend only; PANEL_PORT selects an existing backend"
	@echo "test-python/core/agent  Scoped regression checks"
	@echo "test-frontend           React typecheck and executable utility tests"
	@echo "test-browser            Simulated API browser checks"
	@echo "install-test-vm         Prepare and start a disposable local Ubuntu VM"
	@echo "install-test-status     Show task-owned VM state"
	@echo "install-test-stop       Stop only the task-owned VM; retain its disk"

test-python:
	python3 -m unittest discover -s scripts/tests -p 'test_gpupanel_*.py' -v

test-core:
	cd $(CORE_PATH) && go test ./... -count=1 -timeout=120s

test-agent:
	cd $(AGENT_PATH) && go test ./... -count=1 -timeout=120s

test-frontend:
	cd $(WEB_PATH) && pnpm typecheck && pnpm test

test-browser:
	python3 scripts/browser/run-react-tests.py

install-test-vm:
	python3 scripts/install-test/vm.py prepare
	python3 scripts/install-test/vm.py start

install-test-status:
	python3 scripts/install-test/vm.py status

install-test-stop:
	python3 scripts/install-test/vm.py stop
