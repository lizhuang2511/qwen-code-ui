## Diagnosis
- The errors are Vite dev-server proxy failures (`ECONNREFUSED`) when the frontend requests backend routes.
- Proxy targets are set to `localhost:1858` in `frontend/vite.config.ts:49–57`.
- The frontend calls `GET /api/get-home-directory` and `GET /api/process-statuses` during startup (`frontend/src/lib/webApi.ts:50–53`, `frontend/src/lib/webApi.ts:89–92`, and `frontend/src/App.tsx:75–91`).
- A WebSocket client also attempts to connect to `/api/ws` (`frontend/src/lib/webApi.ts:374–382`), aligning with repeated "ws proxy error" logs. In pywebview, this should be skipped, but the page likely initializes before `window.pywebview` is injected, causing early attempts.
- Cause: No backend process is listening on `1858`, so Vite’s proxy to `http://localhost:1858` and `ws://localhost:1858` fails.

## Plan
### Option A: Start the existing backend on 1858 (quickest)
- Use the reference Rocket-based server that already exposes these endpoints:
  - `参考文件/gemini-cli-desktop-0.3.14/crates/server/src/main.rs` mounts `/api`, listens on port `1858`.
  - Routes include `GET /api/process-statuses` and `GET /api/get-home-directory`.
- Actions:
  - Build and run the server on Windows using Rust toolchain.
  - Verify `http://localhost:1858/api/get-home-directory` returns your home path.
- Pros: Minimal code changes; matches the current proxy config.
- Cons: Adds Rust server dependency if you intend to use Python only.

### Option B: Implement a minimal Python backend on 1858 (aligns with current Python code)
- Create a FastAPI app that mounts under `/api` and serves:
  - `GET /api/get-home-directory` using `crates/filesystem.py:get_home_directory`.
  - `GET /api/process-statuses` using `crates/session.py:get_process_statuses` or `crates/backend/api.py:get_process_statuses`.
  - `WS /api/ws` that broadcasts events like `process-status-changed` (mirroring `webApi.ts` expectations).
- Start with `uvicorn` on `0.0.0.0:1858` and enable CORS for `http://localhost:1420`.
- Constraint: Follow your rule to avoid `try/except` in Python.
- Pros: Keeps stack in Python; integrates with existing Python modules.
- Cons: Requires implementing WS broadcasting and REST endpoints.

### Optional Hardening
- Defer WebSocket initialization until `window.pywebview` is present to avoid early `/api/ws` attempts in desktop mode.
- Make proxy target configurable via `env` (e.g., `BACKEND_PORT`) to switch between Python and Rust backends without code changes.

## Verification
- With backend running on `1858`:
  - Frontend startup logs should show a valid home directory (`frontend/src/App.tsx:76–81`).
  - `useProcessManager` initial fetch should succeed (`frontend/src/hooks/useProcessManager.ts:69–71`).
  - No `[vite] http/ws proxy error` entries in the terminal.
- Manual checks:
  - `curl http://localhost:1858/api/get-home-directory`
  - `curl http://localhost:1858/api/process-statuses`
- WebSocket: In web mode, confirm that `/api/ws` connects and emits `process-status-changed` events when sessions change.

## Next Steps (after approval)
- If Option A: set up and run the Rust server; document dev commands on Windows.
- If Option B: scaffold the FastAPI app, wire endpoints to existing Python modules, add a simple WS broadcaster, and run on `1858`.
- Add a short README section describing how to start the backend for local dev.