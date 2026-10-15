# GPUPanel Personal GPU Workstation — UX contract

Decision date: 2026-10-15. **Workstation first. Conventional operations stay primary; AI is an optional assistant, not a competing top-level operating model.**

## Product and role

The first user is one Ubuntu desktop developer who wants to inspect a GPU, manage Docker images/containers, open a terminal, work with files and run a usable development environment on a network that may be unreliable. A personal workstation must remain useful **without** an LLM, Kubernetes, kagent or agent-control-plane running.

This milestone does not claim a standalone GPUPanel system installer works: [Host G3–G6](./ROADMAP.md) still block release readiness. GPU support in the current UI is inherited functionality, **not** a claim that custom GPU drivers or a complete inference/training stack have shipped.

## Immediate UX decisions

1. Keep traditional Host / Files / Disk / Terminal / Docker / Compose / software catalog / model management and GPU observations accessible using their existing routes and backend RBAC. Do not replace them with chat or break direct deep links.
2. Elevate GPU, host, Docker, files, terminal, models, software and disk shortcuts on the existing home page. Do not convert static cards into fictitious successful installs.
3. Add one unobtrusive bottom-right **AI assistant entry** in the **authenticated** layout, not login, file-share or permission-denied pages. It never obscures a full-screen terminal.
4. Move Agent and MCP **configuration screens** out of the default sidebar (route stays registered for authorized maintainers, not a security boundary). A first-time user should not be forced to understand Skills, providers, agent bundles, runtime bindings or tool schemas just to work.
5. **No fake chat:** the current repository has no accepted unified assistant chat API. The first dock clearly says chat is unavailable, offers permission-checked navigation and a local question draft/copy. It must not send the draft over a network or pretend a model answered.
6. A future chat service should be provisioned behind a GPUPanel Core authenticated capability adapter, configured by the system, and report real readiness. Never insert an arbitrary browser-supplied model endpoint, forward secrets to JavaScript, or use Hermes container terminal as a safe general chat endpoint.
7. Every destructive command is a separate, clearly described action with human permission and observed outcome. A chat response or finished prompt is never authorization. For production change authority, integrate the existing [agent-control-plane](https://github.com/avaargsh/agent-control-plane), do not duplicate it.

## Intended personal workstation workflow

```text
Login to existing Host
   -> Observe actual Host + GPU status
   -> Inspect Docker daemon and containers
   -> Choose an existing approved software/environment template
   -> Review source, downloads, permissions and storage target
   -> Explicitly authorize bounded setup (after real installer exists)
   -> Verify health, logs, model endpoint and project persistence
   -> Reopen quick operations from the Host UI at any time
   -> Optional chat help in the bottom-right corner
```

### P0 acceptance slices

| Slice | UI | Source of truth | Release evidence |
| --- | --- | --- | --- |
| Ubuntu first-run | Existing Host dashboard | Core/Agent live health | Disposable Ubuntu 24.04 G3/G4 independent browser/API tests |
| GPU status | Existing GPU view + Home shortcut | Real provider status; unavailable is **unknown**, not green | Valid/invalid driver fixtures and a real supported accelerator |
| Docker workbench | Existing container, image and Compose views | Docker daemon through backend; no direct browser socket | G5 real authenticated CRUD, negative permission, no image pull without approval |
| Development software | Software catalog + installed apps | Reviewed template revision and local installed state | Provenance/sha256, plan→approve→install→verify→remove/rollback |
| Terminal/files | Existing auth-protected Host routes | Host Agent and scoped RBAC | No unauthorized reads or writes; preserve project files |
| Floating assistant | Authenticated layout only | No chat backend yet; no fake success | Screenshot/browser smoke, keyboard/a11y checks, no network requests from draft |
| Real AI chat | **Not implemented** | Future authenticated Core adapter with server-side provider selection | Real answer/error, streaming timeout/cancel, tenant scope, privacy and negative auth |
| Controlled repair | **Not implemented** | External ACP verified operation authority | Authorization, CAS, independent proof and UNKNOWN fail-closed |

### Stop conditions

- Never route generic AI text to Docker/terminal as executable commands.
- No source-preview release should be shown as an installed GPUPanel service.
- Changing menu visibility does not change backend authorization. Routes remain available only through existing RBAC.
- Do not bring in Kubernetes, multi-host, GPU vendor adapters, broad Agentic Ops or a new orchestration framework to ship a personal workstation.
- Do not declare chat delivered until a real backend is selected, tested and connected.

## Progressive enhancement after this UX PR

**Next build slice:** independently prove fresh Ubuntu install / login / Docker lifecycle on a disposable host and map the existing GPU view to a supported accelerator; then add a simple template selection → setup preview → approved local install and recovery. Only after that, add a unified authenticated **read-only chat** Core adapter with explicit capability discovery and an operator-free user experience. Backend tool execution must remain disabled until controlled authority exists.

The earlier [Agentic Ops benchmark](https://github.com/avaargsh/gpupanel/pull/38) stays useful as a future enterprise-design reference, **not** a blocker or mandatory navigation for the personal workstation.
