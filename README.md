# Backend Dev Server (FastAPI)

- The frontend dev server proxies `/api` and `/api/ws` to `http://localhost:1858` (`frontend/vite.config.ts:49–57`).
- A minimal FastAPI backend is provided in `server/main.py` listening on `127.0.0.1:1858` with `/api` prefix.

- Install dependencies:
  - `python -m pip install fastapi uvicorn`
- Start backend:
  - `python -m uvicorn server.main:app --host 127.0.0.1 --port 1858`

- Endpoints:
  - `GET /api/get-home-directory` returns the OS home directory.
  - `GET /api/process-statuses` returns current session process statuses.
  - `WS /api/ws` emits `{"event":"process-status-changed","payload":[...],"sequence":1}` on connect.

- Verify:
  - `http://localhost:1420` should no longer show `[vite] http/ws proxy error`.
  - `curl http://127.0.0.1:1858/api/get-home-directory`
  - `curl http://127.0.0.1:1858/api/process-statuses`
