The user is experiencing a 404 error when the frontend tries to fetch `/api/projects-enriched`.
I have confirmed that `crates/backend/api.py` has a method `list_enriched_projects` (line 126).
However, `server/main.py` (which runs the FastAPI backend) does **not** have a route defined for `/api/projects-enriched`.
It only has:

* `/api/get-home-directory`

* `/api/process-statuses`

* `/api/ws`

* `/api/start-session`

* `/api/send-message`

This explains why the frontend gets a 404. The backend API is missing the endpoint implementation in `server/main.py`, even though the logic exists in `crates/backend/api.py` (or `crates/projects.py` which is imported by `server/main.py` via `crates.session` -> `crates.projects`? No, `server/main.py` imports `crates.session`, `crates.filesystem`, `crates.events`).

Wait, `server/main.py` does NOT import `crates.projects`. It needs to import it and expose the endpoint.

Also, the user provided logs showing "Stopping backend server..." after "connection closed". This might be due to `main.py` in the root directory terminating. `main.py` starts the backend subprocess. If `main.py` finishes (e.g. `webview` window closes or crashes), it terminates the backend process.
If the frontend (webview) crashes or closes, `main.py` will reach the `finally` block and kill the backend.
The 404 error itself won't cause the backend to crash. But if the frontend fails to render and the user closes it, or if there's a fatal error in the webview, that would explain the shutdown.
However, the immediate fix requested is for the 404 error.

Plan:

1. Modify `server/main.py` to import `crates.projects`.

2. Add the `/api/projects-enriched` endpoint to `server/main.py`.

3. Add the `/api/projects` endpoint as well, as `crates/backend/api.py` has `list_projects`, and it's likely needed too (although the error specifically mentions `projects-enriched`).

4. Add `/api/project` (GET/POST/DELETE) endpoints if they are missing and required by the frontend (based on `crates/backend/api.py` methods like `get_project`, `delete_project`).

   * Looking at `crates/backend/api.py`, there are methods: `list_projects`, `list_enriched_projects`, `get_project`, `delete_project`.

   * I should add at least `list_enriched_projects` since that's the explicit error.

   * I'll also add `list_projects` and `delete_project` to be safe/complete.

5. The `main.py` (root) logic seems to start the backend using `uvicorn server.main:app`. So editing `server/main.py` is the correct place.

Task list:

1. Read `server/main.py` again to be sure I have the context for imports and where to add the route.
2. Edit `server/main.py` to:

   * Import `crates.projects`.

   * Add `@app.get("/api/projects-enriched")`.

   * Add `@app.get("/api/projects")` (optional but good practice).

   * Add `@app.post("/api/project")` (upsert) and `@app.delete("/api/project")` (delete).

