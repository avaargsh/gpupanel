# Copyright 2026 GPUPanel contributors
"""Synthetic fixtures exercise the backend contract inventory conservatively.

The tests build a disposable fixture repository with literal, template,
concatenated and unresolved route declarations, then assert that the scanner
resolves literals, keeps dynamic/unknown entries honest, stays deterministic
and read-only, and rejects invalid roots without executing any command.
"""
from __future__ import annotations

import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "gpupanel-backend-contract-audit.py"
spec = importlib.util.spec_from_file_location("gpupanel_backend_contract_audit", SCRIPT)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

CORE_INIT = """package router

var Router *gin.Engine

func setWebStatic(rootRouter *gin.RouterGroup) {
	rootRouter.GET("/assets/*filepath", serveAssets)
}

func Routers() *gin.Engine {
	Router = gin.New()
	PublicGroup := Router.Group("")
	setWebStatic(PublicGroup)
	PrivateGroup := Router.Group("/api/v1/core")
	rou.RouterGroupApp.InitRouter(PrivateGroup)
	return Router
}
"""
CORE_ROUTER = """package router

func (s *DemoRouter) InitRouter(Router *gin.RouterGroup) {
	demoRouter := Router.Group("demo")
	{
		demoRouter.GET("", demoApi.List)
		demoRouter.POST("/items/:id", demoApi.Item)
		demoRouter.DELETE(somePath, demoApi.Delete)
		demoRouter.GET("/captcha", demoApi.Captcha)
		Router.POST("/"+version, demoApi.Version)
		unknownRouter.GET("/x", demoApi.X)
	}
	Router.Use(middleware.SessionAuth()).GET("/swagger/*any", swaggerHandler())
}
"""
AGENT_INIT = """package router

func Routers() *gin.Engine {
	Router = gin.Default()
	PrivateGroup := Router.Group("/api/v1")
	rou.RouterGroupApp.InitRouter(PrivateGroup)
	PrivateGroup.GET("/health/check", api.CheckHealth)
	return Router
}
"""
AGENT_ROUTER = """package router

func (s *HostRouter) InitRouter(Router *gin.RouterGroup) {
	hostRouter := Router.Group("hosts")
	hostRouter.GET("/terminal/local", api.WsLocalTerminal)
	hostRouter.GET("/terminal/:name", api.WsNamed)
}
"""
CORE_DB = """package db

func Init() {
	global.DB = common.LoadDBConnByPath(path.Join(dir, "core.db"), "core")
	global.TaskDB = common.LoadDBConnByPath(path.Join(dir, "task.db"), "task")
}
"""
CORE_MIGRATE = """package migration

func Init() {
	m := gormigrate.New(global.DB, gormigrate.DefaultOptions, coreMigrations())
	if err := m.Migrate(); err != nil {
		panic(err)
	}
}
"""
AGENT_MIGRATE = """package migrations

var AddTable = &gormigrate.Migration{
	Migrate: func(tx *gorm.DB) error { return tx.AutoMigrate(&model.Host{}) },
}
"""
CORE_MIDDLEWARE = """package middleware

func SessionAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, err := global.SESSION.Get(c)
		c.SetCookie("entrance", user.Name, 3600, "/", "", false, true)
	}
}

func CSRFTokenGuard() gin.HandlerFunc {
	token := c.GetHeader(constant.CSRFHeaderName)
}

func SetPasswordPublicKey() gin.HandlerFunc {
	c.SetCookie("panel_public_key", base64Key, 60, "/", "", false, false)
}

func WebSocketOriginGuard() gin.HandlerFunc {
	return checkOrigin
}
"""
CORE_AUTH = """package auth

func Login(c *gin.Context, entrance string) {
	entranceSetting, err := settingRepo.Get(repo.WithByKey("SecurityEntrance"))
}
"""
FRONTEND_BASE = """import { createApi } from '@reduxjs/toolkit/query/react';
import { encryptPassword } from '@/utils/authCrypto';

export const baseApi = createApi({
    baseQuery: fetchBaseQuery({
        baseUrl: '/api/v1',
        credentials: 'include',
        prepareHeaders: (headers) => {
            const csrf = getCookie('pcsrftoken');
            headers.set('X-CSRF-Token', csrf);
        },
    }),
});
"""
FRONTEND_DEMO = """import { baseApi } from '@/api/baseApi';

export interface Thing {
    url: string;
}

export const demoApi = baseApi.injectEndpoints({
    endpoints: (build) => ({
        login: build.mutation<LoginResponse, LoginRequest>({
            query: (body) => ({
                url: '/core/auth/login',
                method: 'POST',
                headers: { EntranceCode: encodeBase64(getEntranceCode()) },
                body: { name: body.name, password: encryptPassword(body.password) },
            }),
        }),
        captcha: build.query<CaptchaResponse, void>({
            query: () => ({ url: '/core/auth/captcha' }),
        }),
        getThing: build.query<Thing, string>({
            query: (id) => ({ url: `/demo/items/${id}` }),
        }),
        dynamic: build.query<Thing, void>({
            query: () => ({ url: someBuilder() }),
        }),
        ops: build.query<void, void>({
            query: () => '/hosts/operations',
        }),
        terminal: build.query<void, void>({
            query: () => ({ url: '/hosts/terminal/local' }),
        }),
        captchaWrong: build.query<void, void>({
            query: () => ({ url: '/core/demo/captcha', method: 'POST' }),
        }),
    }),
});

export function openTerminal() {
    const ws = new WebSocket(wsUrl);
    const res = await fetch('/demo/fetch/literal', { method: 'PUT' });
}
"""
RELEASE_PY = """REQUIRED = ("bin/gpupanel-core", "bin/gpupanel-agent", "LICENSE", "NOTICE.md")
WEB_ROOT = root / "core" / "cmd" / "server" / "web"
"""
MAKEFILE = """CORE_NAME=gpupanel-core
AGENT_NAME=gpupanel-agent
"""


class BackendContractAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "repo"
        self.put("core/init/router/router.go", CORE_INIT)
        self.put("core/router/ro_demo.go", CORE_ROUTER)
        self.put("core/init/db/db.go", CORE_DB)
        self.put("core/init/migration/migrate.go", CORE_MIGRATE)
        self.put("core/middleware/session.go", CORE_MIDDLEWARE)
        self.put("core/app/auth/auth.go", CORE_AUTH)
        self.put("core/go.mod", "require gorm.io/driver/sqlite v1.0.0\n")
        self.put("agent/init/router/router.go", AGENT_INIT)
        self.put("agent/router/ro_demo.go", AGENT_ROUTER)
        self.put("agent/init/migration/migrations/init.go", AGENT_MIGRATE)
        self.put("agent/go.mod", "require modernc.org/sqlite v1.0.0\n")
        self.put("frontend/apps/panel/src/api/baseApi.ts", FRONTEND_BASE)
        self.put("frontend/apps/panel/src/api/demoApi.ts", FRONTEND_DEMO)
        self.put("scripts/gpupanel-release.py", RELEASE_PY)
        self.put("Makefile", MAKEFILE)

    def put(self, name, content):
        dest = self.root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content, encoding="utf-8")

    def run_main(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = audit.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def report(self):
        code, out, err = self.run_main("--repo", str(self.root))
        self.assertEqual(code, 0, err)
        return json.loads(out)

    def route(self, report, **match):
        for item in report["go_routes"]:
            if all(item.get(key) == value for key, value in match.items()):
                return item
        self.fail("route not found: %r" % (match,))

    def frontend(self, report, **match):
        for item in report["frontend_declarations"]:
            if all(item.get(key) == value for key, value in match.items()):
                return item
        self.fail("frontend declaration not found: %r" % (match,))

    def test_concrete_routes_resolve_mount_and_params(self):
        report = self.report()
        route = self.route(report, file="core/router/ro_demo.go", method="POST")
        self.assertEqual(route["kind"], "concrete")
        self.assertEqual(route["path"], "/api/v1/core/demo/items/:id")
        self.assertEqual(route["path_params"], [":id"])
        listing = self.route(report, file="core/router/ro_demo.go", method="GET",
                             path="/api/v1/core/demo")
        self.assertEqual(listing["raw_path"], '""')
        health = self.route(report, file="agent/init/router/router.go", path="/api/v1/health/check")
        self.assertEqual(health["kind"], "concrete")
        assets = self.route(report, path="/assets/*filepath")
        self.assertEqual(assets["scope"], "init")
        self.assertEqual(assets["kind"], "concrete")

    def test_dynamic_and_unknown_go_routes_stay_honest(self):
        report = self.report()
        concat = self.route(report, method="POST", kind="dynamic")
        self.assertIsNone(concat["path"])
        self.assertIn("version", concat["raw_path"])
        self.assertIn("not a plain string literal", concat["reason"])
        self.assertEqual(concat["evidence"], 'Router.POST("/"+version, demoApi.Version)')
        variable = self.route(report, method="DELETE", kind="dynamic")
        self.assertEqual(variable["raw_path"], "somePath")
        unknown = self.route(report, method="GET", kind="unknown", file="core/router/ro_demo.go",
                             raw_path='"/x"')
        self.assertIn("no tracked group prefix", unknown["reason"])
        chained = self.route(report, path=None, method="GET", raw_path='"/swagger/*any"')
        self.assertIn("chained call result", chained["reason"])

    def test_template_strings_are_patterns_not_concrete(self):
        report = self.report()
        item = self.frontend(report, endpoint="getThing")
        self.assertEqual(item["kind"], "pattern")
        self.assertEqual(item["path"], "/demo/items/*")
        self.assertNotEqual(item["kind"], "concrete")
        self.assertEqual((item["method"], item["method_source"]), ("GET", "rtk-default-query"))

    def test_frontend_dynamic_and_type_declarations(self):
        report = self.report()
        dynamic = self.frontend(report, endpoint="dynamic")
        self.assertEqual(dynamic["kind"], "dynamic")
        self.assertEqual(dynamic["raw"], "someBuilder()")
        urls = [x for x in report["frontend_declarations"]
                if x["file"].endswith("demoApi.ts") and x["raw"] == "string"]
        self.assertEqual(urls, [], "TypeScript 'url: string' interface fields must not be endpoints")

    def test_frontend_concrete_methods_and_consumers(self):
        report = self.report()
        login = self.frontend(report, endpoint="login")
        self.assertEqual((login["kind"], login["path"], login["method"]), ("concrete", "/core/auth/login", "POST"))
        self.assertEqual(login["method_source"], "declared")
        ops = self.frontend(report, endpoint="ops")
        self.assertEqual((ops["path"], ops["method"], ops["method_source"]),
                         ("/hosts/operations", "GET", "rtk-default-query"))
        ws = self.frontend(report, kind="dynamic", method_source="websocket-handshake")
        self.assertIn("WebSocket", ws["evidence"])
        fetch = self.frontend(report, path="/demo/fetch/literal")
        self.assertEqual((fetch["method"], fetch["method_source"]), ("PUT", "declared"))
        coverage = report["consumer_coverage"]
        matched = {m["backend_path"] for m in coverage["matches"]}
        self.assertIn("/api/v1/hosts/terminal/local", matched)
        self.assertIn("/api/v1/core/demo/captcha", matched)
        unmatched = {m["path"] for m in coverage["unmatched_frontend"]}
        self.assertIn("/core/auth/login", unmatched,
                      "fixture backend has no auth route; frontend call must stay unmatched")
        disagreements = {(m["backend_path"], m["frontend_path"], m["backend_method"])
                         for m in coverage["method_disagreements"]}
        self.assertIn(("/api/v1/core/demo/captcha", "/core/demo/captcha", "GET"), disagreements,
                      "frontend POST vs backend GET on the same path must be flagged")

    def test_persistence_release_and_login_blockers(self):
        report = self.report()
        anchors = {(a["anchor"], a["file"]) for a in report["persistence_anchors"]["anchors"]}
        self.assertIn(("db_connection", "core/init/db/db.go"), anchors)
        self.assertIn(("gormigrate", "core/init/migration/migrate.go"), anchors)
        self.assertIn(("automigrate", "agent/init/migration/migrations/init.go"), anchors)
        self.assertIn(("sqlite_driver", "agent/go.mod"), anchors)
        release = {(a["file"], a["evidence"]) for a in report["release_coupling"]["anchors"]}
        self.assertIn(("scripts/gpupanel-release.py", 'REQUIRED = ("bin/gpupanel-core", "bin/gpupanel-agent", "LICENSE", "NOTICE.md")'), release)
        blockers = {b["id"]: b["status"] for b in report["login_blockers"]}
        for key in ("session_cookie_auth", "rsa_password_transport", "captcha", "csrf",
                    "entrance", "entrance_cookie", "websocket_origin"):
            self.assertEqual(blockers[key], "evidence-found", key)
        self.assertEqual(report["summary"]["login_blockers_total"], 10)

    def test_deterministic_and_sorted_output(self):
        code1, out1, _ = self.run_main("--repo", str(self.root))
        code2, out2, _ = self.run_main("--repo", str(self.root))
        self.assertEqual((code1, code2), (0, 0))
        self.assertEqual(out1, out2, "identical trees must produce identical bytes")
        report = json.loads(out1)
        fe_keys = [(x["file"], x["line"], x["raw"] or "") for x in report["frontend_declarations"]]
        self.assertEqual(fe_keys, sorted(fe_keys))
        go_keys = [(x["file"], x["line"], x["method"], x["path"] or "", x["raw_path"])
                   for x in report["go_routes"]]
        self.assertEqual(go_keys, sorted(go_keys))
        self.assertEqual(report["warnings"], sorted(report["warnings"]))

    def test_invalid_roots_fail_closed(self):
        code, out, err = self.run_main("--repo", str(self.root / "missing"))
        self.assertEqual(code, 2)
        self.assertEqual(out, "")
        self.assertIn("does not exist", err)
        shallow = Path(self.temp.name) / "shallow"
        shallow.mkdir()
        code, out, err = self.run_main("--repo", str(shallow))
        self.assertEqual(code, 2)
        self.assertIn("missing required directories", err)
        marker = self.root / "file-not-dir"
        marker.write_text("x", encoding="utf-8")
        code, _, err = self.run_main("--repo", str(marker))
        self.assertEqual(code, 2)
        self.assertIn("not a directory", err)

    def test_scan_is_read_only_and_output_elsewhere(self):
        def digest_tree():
            digest = hashlib.sha256()
            for path in sorted(p for p in self.root.rglob("*") if p.is_file()):
                digest.update(path.relative_to(self.root).as_posix().encode())
                digest.update(path.read_bytes())
            return digest.hexdigest()
        before = digest_tree()
        target = Path(self.temp.name) / "out" / "report.json"
        code, _, err = self.run_main("--repo", str(self.root), "--output", str(target))
        self.assertEqual(code, 0, err)
        self.assertTrue(target.is_file())
        json.loads(target.read_text(encoding="utf-8"))
        self.assertEqual(digest_tree(), before, "scan must not modify repository files")

    def test_tool_contains_no_execution_machinery(self):
        import ast
        tree = ast.parse(SCRIPT.read_text(encoding="utf-8"))
        imported = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported.update(alias.name.split(".")[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        self.assertEqual(imported, {"argparse", "bisect", "json", "re", "sys", "pathlib",
                                    "__future__"}, sorted(imported))


if __name__ == "__main__":
    unittest.main()
