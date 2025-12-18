I will modify `frontend/src/lib/api.ts` to ensure the application waits for the `pywebview` API to initialize before attempting to make API calls. This addresses the race condition where the frontend attempts to call `get_home_directory` via HTTP (falling back from `pywebview` bridge) before the bridge is ready, resulting in a 500 error because the HTTP backend is not running.

**Specific Changes:**
1.  **Modify `frontend/src/lib/api.ts`**:
    *   Add a `waitForPywebview` helper function that waits for the `pywebviewready` event with a short timeout (500ms).
    *   Update the `api` Proxy handler to call `waitForPywebview()` before dispatching the call, specifically when not in web mode (`!__WEB__`).

This ensures that in the desktop environment, the application properly waits for the native bridge to be established, preventing the erroneous fallback to HTTP requests and the subsequent 500 errors.