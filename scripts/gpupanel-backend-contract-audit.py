#!/usr/bin/env python3
"""Read-only deterministic source inventory of GPUPanel API, auth and data contracts.

Parses checked-out source only: no command execution, network, or installed
database/config/credential reads. Dynamic routing (TS template strings, Go
non-literal path arguments, unresolved receivers) is captured with file, line
and evidence and explicitly marked pattern/dynamic/unknown; regex output is
never presented as a resolved concrete route. Template strings are patterns,
not exact routes.
"""
from __future__ import annotations
import argparse
import bisect
import json
import re
import sys
from pathlib import Path

SCHEMA_VERSION = 1
MAX_FILE_BYTES = 1_048_576
ANCHOR_CAP = 40
PERSISTENCE_CAP = 80
MATCH_CAP = 400
LIST_CAP = 50
EVIDENCE_CAP = 200
REPO_MARKERS = ("core", "agent", "frontend", "scripts")
FRONTEND_SRC = "frontend/apps/panel/src"
ROUTE_SCAN_DIRS = (("core", "init", "core/init/router"), ("agent", "init", "agent/init/router"),
                   ("core", "router", "core/router"), ("agent", "router", "agent/router"))
PERSISTENCE_PREFIXES = ("core/init/", "agent/init/", "core/utils/common/", "agent/utils/common/")
PERSISTENCE_FILES = ("core/go.mod", "agent/go.mod")
RELEASE_FILES = ("scripts/gpupanel-release.py", "Makefile")
SCOPE_PREFIXES = {"go": ("core/", "agent/"), "core_go": ("core/",),
                  "agent_go": ("agent/",), "frontend": ("frontend/",)}
ANCHOR_CATEGORIES = (
    ("session_auth", r"SessionAuth\(|API_AUTH|CoreAPIAuthMiddleware|PasswordExpired|checkSession\(|global\.SESSION"),
    ("rsa_publickey", r"SetPasswordPublicKey|panel_public_key|encryptPassword|ensurePasswordPublicKey|PublicKey"),
    ("cookie", r"SetCookie\(|\.Cookie\(|credentials: 'include'|getCookie\(|HttpOnly|SameSite"),
    ("csrf", r"CSRFTokenGuard|CSRFHeaderName|X-CSRF-Token|pcsrftoken|CheckCSRFToken"),
    ("entrance", r"SecurityEntrance|EntranceCode|entrance"),
    ("captcha", r"[Cc]aptcha"),
    ("mfa", r"MFA|mfalogin|mfaSession"),
    ("websocket", r"WebSocketOriginGuard|WebSocket|websocket|ws://|wss://|Sec-WebSocket"),
)
PERSISTENCE_PATTERNS = (
    ("db_connection", r"LoadDBConnByPath(WithErr)?\("),
    ("db_ownership", r"\bglobal\.\w*DB\s*="),
    ("gormigrate", r"gormigrate\.New\("),
    ("automigrate", r"\.AutoMigrate\("),
    ("sqlite_driver", r"modernc\.org/sqlite|gorm\.io/driver/sqlite|mattn/go-sqlite3"),
)
RELEASE_PATTERN = (r"gpupanel-core|gpupanel-agent|core/cmd/server/web|WEB_ROOT|"
                   r"CORE_PATH|AGENT_PATH|build_frontend|build_core|build_agent")
BLOCKERS = (
    ("session_cookie_auth", "session guard on /api/v1 plus cookie credentials",
     (("SessionAuth\\(", "core_go"), ("credentials: 'include'", "frontend"))),
    ("rsa_password_transport", "RSA public key issuance plus client password encryption",
     (("SetPasswordPublicKey|panel_public_key", "core_go"), ("encryptPassword|ensurePasswordPublicKey", "frontend"))),
    ("captcha", "captcha issuance and verification contract", (('"/captcha"', "go"), ("[Cc]aptcha", "frontend"))),
    ("mfa", "MFA login flow and session binding", (("mfalogin|MFALogin", "go"), ("mfalogin|mfaSession", "frontend"))),
    ("csrf", "CSRF guard and browser token propagation",
     (("CSRFTokenGuard|CheckCSRFToken|CSRFHeaderName", "core_go"), ("pcsrftoken|X-CSRF-Token", "frontend"))),
    ("entrance", "security entrance code check and header",
     (("SecurityEntrance|EntranceCode", "core_go"), ("EntranceCode", "frontend"))),
    ("entrance_cookie", "entrance or CSRF browser cookies", (("SetCookie\\(", "core_go"), ("getCookie\\(", "frontend"))),
    ("api_key_auth", "API key authentication marker inside core", (("CoreAPIAuthMiddleware|API_AUTH", "core_go"),)),
    ("password_expiry", "password expiry interception", (("PasswordExpired", "go"), ("[Pp]asswordExpired|expired", "frontend"))),
    ("websocket_origin", "websocket origin guard plus browser terminal endpoints",
     (("WebSocketOriginGuard", "go"), ("new WebSocket", "frontend"))),
)
GO_METHODS = "GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|Any"
GO_ROUTE_RE = re.compile(r"\b(?P<recv>[A-Za-z_]\w*)\s*\.\s*(?P<method>%s)\s*\(" % GO_METHODS)
GO_CHAIN_RE = re.compile(r"\)\s*\.\s*(?P<method>%s)\s*\(" % GO_METHODS)
GO_GROUP_RE = re.compile(r"\b(?P<var>[A-Za-z_]\w*)\s*:=\s*(?P<recv>[A-Za-z_]\w*)\s*\.\s*Group\s*\(")
GO_INIT_RECV_RE = re.compile(r"func\s*\([^)]*\)\s+InitRouter\s*\(\s*(?P<recv>[A-Za-z_]\w*)\s+\*gin\.RouterGroup")
GO_ENGINE_RE = re.compile(r"\b(?P<var>[A-Za-z_]\w*)\s*=\s*gin\.(?:New|Default)\s*\(")
GO_FUNC_RE = re.compile(r"func\s+(?P<name>[A-Za-z_]\w*)\s*\((?P<params>[^)]*)\)")
GO_MOUNT_RE = re.compile(r"\bInitRouter\s*\(\s*(?P<arg>[A-Za-z_]\w*)\s*\)")
GO_PARAM_RE = re.compile(r"([A-Za-z_]\w*)\s+\*gin\.RouterGroup")
GO_DQ_RE = re.compile(r'^"(?:[^"\\]|\\.)*"$')
GO_RAW_RE = re.compile(r"^`[^`]*`$")
GO_PARAM_TOKEN_RE = re.compile(r"[:*][A-Za-z_]\w*")
FE_URL_RE = re.compile(r"\burl\s*:\s*(?P<q>['\"`])(?P<val>.*?)(?P=q)")
FE_URL_NONLIT_RE = re.compile(r"\burl\s*:\s*(?P<expr>(?!\s*['\"`])[^,}\n]+)")
FE_ARROW_RE = re.compile(r"\bquery\s*:\s*(?:\([^)]*\)|\w+)\s*=>\s*(?P<q>['\"`])(?P<val>[^'\"`\\]*)(?P=q)")
FE_FETCH_RE = re.compile(r"(?<![\w.])(?:fetch|axios\.\w+)\s*\(")
FE_WS_RE = re.compile(r"new\s+WebSocket\s*\(")
FE_ENDPOINT_RE = re.compile(r"(?m)^\s*(?P<name>\w+)\s*:\s*build\.(?P<kind>query|mutation)\b")
FE_METHOD_RE = re.compile(r"\bmethod\s*:\s*['\"]([A-Za-z]+)['\"]")
FE_BACK_MARKER_RE = re.compile(r"build\.(query|mutation)\b|^\s*(query|mutation)\s*:", re.M)
FE_TYPE_DECL_RE = re.compile(r"(?:string|number|boolean|unknown|any|void|null)(\s*\|\s*\w+)*\s*;?\s*$")
class AuditError(Exception):
    """Fail closed on invalid repository roots or unreadable inventories."""
def line_of(text, pos):
    return text.count("\n", 0, pos) + 1
def evidence(text, line):
    lines = text.splitlines()
    return lines[line - 1].strip()[:EVIDENCE_CAP] if 1 <= line <= len(lines) else ""
def first_arg(text, open_idx):
    """Return the first call argument text and the index just past it."""
    n, start, j, depth, quote = len(text), open_idx + 1, open_idx + 1, 1, None
    while j < n:
        ch = text[j]
        if quote:
            if quote == '"' and ch == "\\":
                j += 2
                continue
            quote = None if ch == quote else quote
        elif ch in "\"'`":
            quote = ch
        elif ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
            if depth == 0:
                return text[start:j].strip(), j
        elif depth == 1 and ch == ",":
            return text[start:j].strip(), j
        j += 1
    end = min(n, start + 200)
    return text[start:end].strip(), end
def join_path(prefix, rel):
    return "/" + "/".join(seg for chunk in (prefix, rel) for seg in chunk.split("/") if seg)
def split_query(value):
    path, _, query = value.partition("?")
    return path, ("?" + query) if query else None
def is_literal(arg):
    return bool(GO_DQ_RE.match(arg) or GO_RAW_RE.match(arg) or re.match(r"^'(?:[^'\\]|\\.)*'$", arg))
def literal_value(arg):
    return arg[1:-1]
def template_pattern(value):
    """Pattern path for template strings: interpolation becomes '*', never a concrete route."""
    return re.sub(r"\$\{[^}]*\}", "*", split_query(value)[0])
def collect_sources(root):
    sources, warnings, candidates = {}, [], []
    for base in ("core", "agent"):
        directory = root / base
        if directory.is_dir():
            candidates += [p for p in directory.rglob("*.go") if not p.name.endswith("_test.go")]
        else:
            warnings.append("missing source directory: " + base)
    frontend = root / FRONTEND_SRC
    if frontend.is_dir():
        candidates += list(frontend.rglob("*.ts")) + list(frontend.rglob("*.tsx"))
    else:
        warnings.append("missing frontend source directory: " + FRONTEND_SRC)
    for name in RELEASE_FILES + PERSISTENCE_FILES:
        candidates.append(root / name) if (root / name).is_file() else \
            warnings.append("missing expected file: " + name)
    for path in sorted(set(candidates)):
        rel = path.relative_to(root).as_posix()
        try:
            size = path.stat().st_size
            if size > MAX_FILE_BYTES:
                warnings.append("skipped oversized source (%d bytes): %s" % (size, rel))
                continue
            sources[rel] = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            warnings.append("unreadable source: %s: %s" % (rel, exc))
    if not sources:
        raise AuditError("no readable source files under " + str(root))
    return sources, warnings
def scan_go_file(text, rel, module, scope, root, root_reason):
    """Resolve gin group prefixes per file; unresolved receivers stay unknown."""
    prefixes, seeds = {}, []

    def setp(var, prefix, reason):
        cur = prefixes.get(var)
        if cur and cur[0] is not None and prefix is not None and cur[0] != prefix:
            prefixes[var] = (None, "variable redefined with conflicting prefixes")
        elif not (cur and cur[0] is not None):
            prefixes[var] = (prefix, reason)

    for m in GO_ENGINE_RE.finditer(text):
        setp(m.group("var"), "", "gin engine root")
    for m in GO_INIT_RECV_RE.finditer(text):
        setp(m.group("recv"), root, root_reason)
    for m in GO_FUNC_RE.finditer(text):
        for part in m.group("params").split(","):
            named = GO_PARAM_RE.search(part)
            if named:
                seeds.append((m.group("name"), named.group(1)))
    for fname, param in seeds:
        setp(param, None, "function parameter receiver prefix not statically resolvable")
    group_events = sorted((m.start(), m) for m in GO_GROUP_RE.finditer(text))
    for _, m in group_events:  # phase 1: group prefixes in source order
        var, current = m.group("var"), prefixes.get(m.group("recv"))
        arg = first_arg(text, m.end() - 1)[0]
        if current is None:
            setp(var, None, "group assigned from untracked receiver")
        elif current[0] is None:
            setp(var, None, current[1] or "unresolved group receiver")
        elif is_literal(arg):
            setp(var, join_path(current[0], literal_value(arg)), None)
        else:
            setp(var, None, "non-literal group prefix argument")
    for _ in range(5):  # phase 2: resolve gin.RouterGroup params from in-file call sites
        changed = False
        for fname, param in seeds:
            if prefixes.get(param, (None,))[0] is not None:
                continue
            for cm in re.finditer(r"\b%s\s*\(\s*([A-Za-z_]\w*)\s*[,)]" % re.escape(fname), text):
                if prefixes.get(cm.group(1), (None,))[0] is not None:
                    setp(param, prefixes[cm.group(1)][0], "resolved from in-file call site")
                    changed = True
                    break
        if not changed:
            break
    events = [(m.start(), "route", m) for m in GO_ROUTE_RE.finditer(text)]
    events += [(m.start(), "chain", m) for m in GO_CHAIN_RE.finditer(text)]
    events.sort(key=lambda event: event[0])
    routes = []

    def entry(line, method, kind, path, params, raw, reason):
        return {"module": module, "scope": scope, "file": rel, "line": line,
                "method": method, "kind": kind, "path": path, "path_params": params,
                "raw_path": raw, "reason": reason, "evidence": evidence(text, line)}

    for pos, kind, m in events:  # phase 3: route registrations in source order
        line = line_of(text, pos)
        arg, _ = first_arg(text, m.end() - 1)
        method = m.group("method")
        if kind == "chain":
            routes.append(entry(line, method, "unknown", None, [], arg,
                                "route on a chained call result; receiver prefix not statically tracked"))
            continue
        current = prefixes.get(m.group("recv"))
        if current is None or current[0] is None:
            reason = (current or (None, "receiver variable has no tracked group prefix"))[1]
            routes.append(entry(line, method, "unknown", None, [], arg, reason or "unresolved receiver prefix"))
        elif not is_literal(arg):
            routes.append(entry(line, method, "dynamic", None, [], arg,
                                "path argument is not a plain string literal"))
        else:
            path = join_path(current[0], literal_value(arg))
            routes.append(entry(line, method, "concrete", path, GO_PARAM_TOKEN_RE.findall(path), arg, None))
    return routes, prefixes
def resolve_mount(sources, module):
    """Find the single InitRouter(...) mount prefix for a module (e.g. /api/v1/core)."""
    prefix, mounts = module + "/init/router/", {}
    for rel in sorted(p for p in sources if p.startswith(prefix) and p.endswith(".go")):
        _, prefixes = scan_go_file(sources[rel], rel, module, "init", "", "gin engine root")
        for m in GO_MOUNT_RE.finditer(sources[rel]):
            if prefixes.get(m.group("arg"), (None,))[0] is not None:
                mounts.setdefault(prefixes[m.group("arg")][0], rel)
    if len(mounts) == 1:
        return next(iter(mounts)), None
    if not mounts:
        return None, "module mount prefix not resolved from " + prefix
    return None, "multiple InitRouter mounts found: " + ", ".join(sorted(mounts))
def scan_go_routes(sources):
    routes, warnings = [], []
    for module, scope, directory in ROUTE_SCAN_DIRS:
        if scope == "init":
            mount, reason = "", None
        else:
            mount, reason = resolve_mount(sources, module)
            if mount is None:
                warnings.append("module %s routes unresolved: %s" % (module, reason))
        prefix = directory + "/"
        for rel in sorted(p for p in sources if p.startswith(prefix)):
            found, _ = scan_go_file(sources[rel], rel, module, scope, mount or "",
                                    reason or "gin engine root")
            routes.extend(found)
    routes.sort(key=lambda r: (r["file"], r["line"], r["method"], r["path"] or "", r["raw_path"]))
    return routes, warnings
def fe_method(text, start, end):
    window = text[end:end + 400]
    search = window if "url:" not in window else window[:window.find("url:")]
    declared = FE_METHOD_RE.search(search)
    if declared:
        return declared.group(1), "declared"
    last = None
    for marker in FE_BACK_MARKER_RE.finditer(text[max(0, start - 600):start]):
        last = marker.group(1) or marker.group(2)
    return ("GET", "rtk-default-query") if last == "query" else \
        ("POST", "rtk-default-mutation") if last == "mutation" else (None, "unresolved")
def fe_record(rel, line, endpoint, evidence_line):
    return {"file": rel, "line": line, "endpoint": endpoint, "kind": None, "method": None,
            "method_source": None, "path": None, "query": None, "raw": None, "reason": None, "evidence": evidence_line}
def fe_value(record, value):
    record["raw"], record["query"] = value, split_query(value)[1]
    if "${" in value:
        record["kind"], record["path"] = "pattern", template_pattern(value)
        record["reason"] = "template interpolation; pattern, not an exact route"
    else:
        record["kind"], record["path"] = "concrete", split_query(value)[0]
def scan_frontend(sources):
    """Collect React RTK Query / fetch / WebSocket endpoint declarations."""
    entries = []
    for rel, text in sorted(sources.items()):
        if not rel.startswith("frontend/"):
            continue
        endpoints = [(m.start(), m.group("name")) for m in FE_ENDPOINT_RE.finditer(text)]
        positions = [item[0] for item in endpoints]
        events = [(m.start(), kind, m) for regex, kind in (
            (FE_URL_RE, "url"), (FE_ARROW_RE, "arrow"), (FE_FETCH_RE, "fetch"),
            (FE_WS_RE, "ws"), (FE_URL_NONLIT_RE, "nonlit")) for m in regex.finditer(text)]
        events.sort(key=lambda event: event[0])
        for pos, kind, m in events:
            line = line_of(text, pos)
            index = bisect.bisect_right(positions, pos) - 1
            record = fe_record(rel, line, endpoints[index][1] if index >= 0 else None,
                               evidence(text, line))
            if kind in ("url", "arrow"):
                fe_value(record, m.group("val"))
                if kind == "url" and text[m.end():m.end() + 12].lstrip().startswith("+"):
                    record["kind"], record["path"] = "dynamic", None
                    record["reason"] = "url value concatenated with a variable"
                record["method"], record["method_source"] = fe_method(text, pos, m.end())
            elif kind == "nonlit":
                expr = m.group("expr").strip()
                if expr.endswith(";") or FE_TYPE_DECL_RE.match(expr):
                    continue  # TypeScript type declaration, not an endpoint
                record["raw"], record["kind"] = expr, "dynamic"
                record["reason"] = "url value is a variable expression, not a literal"
            else:
                arg, _ = first_arg(text, m.end() - 1)
                record["raw"] = arg
                if is_literal(arg):
                    fe_value(record, literal_value(arg))
                    declared = FE_METHOD_RE.search(text[m.end():m.end() + 300])
                    if kind == "ws":
                        record["method"], record["method_source"] = "GET", "websocket-handshake"
                    else:
                        record["method"] = declared.group(1) if declared else "GET"
                        record["method_source"] = "declared" if declared else "fetch-default"
                else:
                    record["kind"] = "dynamic"
                    record["reason"] = "non-literal endpoint expression"
                    record["method"], record["method_source"] = (
                        ("GET", "websocket-handshake") if kind == "ws" else (None, "unresolved"))
            entries.append(record)
    entries.sort(key=lambda e: (e["file"], e["line"], e["raw"] or ""))
    return entries
def line_anchors(sources, compiled, cap):
    hits = {name: [] for name, _ in compiled}
    for rel, text in sorted(sources.items()):
        for number, line in enumerate(text.splitlines(), 1):
            for name, rx in compiled:
                if rx.search(line):
                    hits[name].append({"file": rel, "line": number, "evidence": line.strip()[:EVIDENCE_CAP]})
    return {name: {"total": len(values), "truncated": len(values) > cap,
                   "anchors": sorted(values, key=lambda h: (h["file"], h["line"]))[:cap]} for name, values in hits.items()}
def scan_persistence(sources):
    compiled = [(name, re.compile(pattern)) for name, pattern in PERSISTENCE_PATTERNS]
    hits = []
    for rel, text in sorted(sources.items()):
        if not (rel.startswith(PERSISTENCE_PREFIXES) or rel in PERSISTENCE_FILES):
            continue
        for number, line in enumerate(text.splitlines(), 1):
            for name, rx in compiled:
                if rx.search(line):
                    hits.append({"anchor": name, "file": rel, "line": number, "evidence": line.strip()[:EVIDENCE_CAP]})
                    break
    hits.sort(key=lambda h: (h["file"], h["line"], h["anchor"]))
    return {"total": len(hits), "truncated": len(hits) > PERSISTENCE_CAP, "anchors": hits[:PERSISTENCE_CAP]}
def scan_release(sources):
    rx, hits = re.compile(RELEASE_PATTERN), []
    for rel in sorted(RELEASE_FILES):
        for number, line in enumerate(sources.get(rel, "").splitlines(), 1):
            if rx.search(line):
                hits.append({"file": rel, "line": number, "evidence": line.strip()[:EVIDENCE_CAP]})
    return {"total": len(hits), "truncated": False, "anchors": hits[:LIST_CAP]}
def scope_files(sources, scope):
    return sorted(p for p in sources if p.startswith(SCOPE_PREFIXES[scope]))
def scan_blockers(sources):
    """Report static evidence for every contract anchor login must keep."""
    out = []
    for blocker_id, title, probes in BLOCKERS:
        results = []
        for pattern, scope in probes:
            rx, anchors = re.compile(pattern), []
            for rel in scope_files(sources, scope):
                found = rx.search(sources[rel])
                if found:
                    anchors.append({"file": rel, "line": line_of(sources[rel], found.start())})
                if len(anchors) >= 3:
                    break
            results.append({"pattern": pattern, "scope": scope, "found": bool(anchors), "anchors": anchors})
        found_count = sum(1 for item in results if item["found"])
        status = "evidence-found" if found_count == len(results) else "partial" if found_count else "not-found"
        out.append({"id": blocker_id, "title": title, "status": status, "probes": results})
    return out
def segments(path):
    return [seg for seg in path.split("/") if seg]
def path_matches(frontend, backend):
    fe_segs, be_segs = segments(frontend), segments(backend)
    for index, be_seg in enumerate(be_segs):
        if be_seg.startswith("*"):
            return index <= len(fe_segs)
        if index >= len(fe_segs):
            return False
        fe_seg = fe_segs[index]
        if be_seg.startswith(":") or fe_seg == "*" or fe_seg == be_seg:
            continue
        if not ("*" in fe_seg and be_seg.startswith(fe_seg.split("*", 1)[0])):
            return False
    return len(fe_segs) == len(be_segs)
def consumer_coverage(frontend, routes):
    """Relate concrete backend routes to frontend declarations (path segments only)."""
    backends = [(r, r["path"][len("/api/v1"):] if r["path"].startswith("/api/v1") else r["path"])
                for r in routes if r["kind"] == "concrete" and r["path"]]
    candidates = [f for f in frontend if f["kind"] in ("concrete", "pattern")
                  and f["path"] and not f["path"].startswith("http")]
    matches, matched_back, matched_front = [], set(), set()
    for item in candidates:
        for route, rel in backends:
            if not path_matches(item["path"], rel or "/"):
                continue
            matched_back.add(route["path"])
            matched_front.add((item["file"], item["line"]))
            agrees = None
            if item["method_source"] == "declared" and item["method"] and route["method"] != "ANY":
                agrees = item["method"] == route["method"]
            matches.append({"backend_path": route["path"], "backend_method": route["method"],
                            "frontend_file": item["file"], "frontend_line": item["line"],
                            "frontend_path": item["path"], "method_agrees": agrees})
    matches.sort(key=lambda m: (m["backend_path"], m["frontend_file"], m["frontend_line"]))
    unmatched_back = sorted({r["path"] for r, _ in backends if r["path"] not in matched_back})
    unmatched_front = sorted(
        ({"file": i["file"], "line": i["line"], "path": i["path"], "kind": i["kind"]}
         for i in candidates if (i["file"], i["line"]) not in matched_front),
        key=lambda i: (i["file"], i["line"], i["path"]))
    return {"backend_concrete_routes": len(backends), "backend_matched": len(matched_back),
            "frontend_declarations": len(frontend), "frontend_matchable": len(candidates),
            "frontend_matched": len(matched_front),
            "match_method": "segment path comparison; template '*' and gin ':param'/'*catchall' "
                            "treated as wildcards; HTTP method compared only when frontend declared it",
            "matches": matches[:MATCH_CAP], "matches_truncated": len(matches) > MATCH_CAP,
            "unmatched_backend_paths": unmatched_back[:LIST_CAP],
            "unmatched_backend_truncated": len(unmatched_back) > LIST_CAP,
            "unmatched_frontend": unmatched_front[:LIST_CAP],
            "unmatched_frontend_truncated": len(unmatched_front) > LIST_CAP,
            "method_disagreements": [m for m in matches if m["method_agrees"] is False][:LIST_CAP]}
def inventory(root):
    root = Path(root)
    if not root.exists():
        raise AuditError("repo root does not exist: " + str(root))
    if not root.is_dir():
        raise AuditError("repo root is not a directory: " + str(root))
    missing = [marker for marker in REPO_MARKERS if not (root / marker).is_dir()]
    if missing:
        raise AuditError("repo root is missing required directories: " + ", ".join(missing))
    sources, warnings = collect_sources(root)
    routes, route_warnings = scan_go_routes(sources)
    warnings += route_warnings
    frontend = scan_frontend(sources)
    blockers = scan_blockers(sources)

    def count_by(values):
        kinds = sorted({v["kind"] for v in values})
        return {k: sum(1 for v in values if v["kind"] == k) for k in kinds}

    return {
        "tool": "gpupanel-backend-contract-audit", "schema_version": SCHEMA_VERSION, "repo": str(root),
        "legend": {"concrete": "route or endpoint with a fully resolved literal path",
                   "pattern": "template-interpolated endpoint captured as a '*' pattern, not an exact route",
                   "dynamic": "path expression present but not a plain literal; no concrete route claimed",
                   "unknown": "receiver, mount or path not statically resolvable; evidence retained"},
        "summary": {"sources_scanned": len(sources), "go_routes": len(routes),
                    "go_routes_by_kind": count_by(routes), "frontend_declarations": len(frontend),
                    "frontend_by_kind": count_by(frontend),
                    "login_blockers_found": sum(1 for b in blockers if b["status"] == "evidence-found"),
                    "login_blockers_total": len(BLOCKERS)},
        "frontend_declarations": frontend, "go_routes": routes,
        "auth_anchors": line_anchors(sources, [(n, re.compile(p)) for n, p in ANCHOR_CATEGORIES], ANCHOR_CAP),
        "persistence_anchors": scan_persistence(sources), "release_coupling": scan_release(sources),
        "consumer_coverage": consumer_coverage(frontend, routes), "login_blockers": blockers,
        "limitations": [
            "regex-based source scan; Go bodies, TS comments and string contents may cause heuristic false positives",
            "route prefixes resolved per file by variable name; conflicting redefinitions are marked unknown, not guessed",
            "frontend match is path-segment based; it does not prove identical bodies or auth semantics"],
        "warnings": sorted(warnings),
    }
def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[1],
                        help="repository root to inventory (read-only)")
    parser.add_argument("--output", type=Path, help="write a JSON report; default stdout")
    options = parser.parse_args(argv)
    try:
        report = inventory(options.repo)
    except AuditError as exc:
        print("backend contract inventory blocked: " + str(exc), file=sys.stderr)
        return 2
    data = json.dumps(report, indent=2, sort_keys=True, ensure_ascii=True) + "\n"
    if options.output:
        try:
            options.output.parent.mkdir(parents=True, exist_ok=True)
            options.output.write_text(data, encoding="utf-8")
        except OSError as exc:
            print("backend contract inventory blocked: cannot write output: " + str(exc), file=sys.stderr)
            return 2
        print("backend contract inventory written to " + str(options.output), file=sys.stderr)
    else:
        sys.stdout.write(data)
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
