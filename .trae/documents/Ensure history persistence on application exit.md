The user reports that history is still not saving, and requests two specific things:
1.  **Save on exit**: When closing the interface, prompt or ensure history is saved.
2.  **Fix backend/frontend history recording**: Ensure the conversation is actually recorded.

My previous analysis suggested that `events.emit` crashing might be the cause, but the user says it's "still not saving". This implies that even with the crash fix (or if no crash occurs), the data isn't hitting the disk.

Looking at `session.py`:
- `_save_conversation` is called in `send_message` (user turn).
- `_save_conversation` is called in `_start_readers` -> `turn_finished` (assistant turn).

If the user closes the window *during* generation, `turn_finished` might never fire if the process is killed abruptly.
Also, `main.py` terminates the backend process immediately on exit:
```python
93→        backend_process.terminate()
```
This kills `uvicorn`, which kills the python process running `session.py` threads. The threads might not have a chance to save.

**Plan to Fix:**

1.  **Explicit Save on Exit**:
    -   In `main.py`, catch the exit signal (before terminating backend).
    -   Call a new API endpoint or function to force-save all active sessions.
    -   Since `main.py` runs the `webview` and `uvicorn` as a subprocess, `main.py` itself doesn't have access to `session._sessions` directly (they are in the `uvicorn` process).
    -   **Crucial**: The `backend_process` is a separate process. I cannot call a function in it directly from `main.py`. I must send a signal or request.
    -   However, `webview` runs in `main.py` (which imports `backend.api`). Wait.
        -   `start_backend()` runs `uvicorn server.main:app` in a *subprocess*.
        -   `webview.create_window(..., js_api=Api())` runs in `main.py`.
        -   The `Api` class in `main.py` (imported from `backend.api`) is running in the **main process**.
        -   The `backend.api` imports `session`.
        -   So `session._sessions` is in the **main process** memory?
    -   Let's check `main.py` again.
        -   `from backend.api import Api`
        -   `window = webview.create_window(..., js_api=Api())`
        -   This `Api` instance is attached to the webview. Calls from JS go to this instance.
        -   So `session.py` is being used by `Api` in the **main process**.
        -   **BUT** `start_backend()` starts a *separate* `uvicorn` server.
        -   Does the frontend talk to `Api` (via `window.pywebview.api`) or to `localhost:1858`?
        -   If it talks to `Api`, then `session.py` state is in `main.py` process.
        -   If it talks to `localhost:1858`, then `session.py` state is in `uvicorn` process.
        -   `gemini-cli-desktop` usually uses `pywebview` bridge (`window.pywebview.api`).
        -   `main.py` imports `backend.api` and passes it to `webview`.
        -   `session.py` relies on `_sessions` global dict.
        -   If the frontend uses `pywebview` bridge, then `_sessions` is in the main process.
        -   If `uvicorn` is *also* running `server.main`, and `server.main` imports `session`, then there are **TWO** `session.py` states!
        -   This is a classic split-brain problem.

    -   **Investigation**:
        -   `main.py` starts `uvicorn`.
        -   `main.py` *also* imports `backend.api` -> `session`.
        -   If the frontend makes HTTP requests to `localhost:1858`, it hits `uvicorn`.
        -   If the frontend calls `pywebview.api.method()`, it hits `main.py`.
        -   The user logs show: `[QwenAdapter] STDOUT: ...` and `[SESSION] ...`.
        -   If these logs appear in the terminal running `main.py`, they could be from either (if `uvicorn` output is piped).
        -   But `session.py` has `_sessions` global.
        -   If the frontend uses *both*, we are in trouble.
        -   `gemini-cli-desktop` architecture usually relies entirely on the bridge (`Api`) for logic, and maybe `uvicorn` for serving static files or assets? Or maybe `uvicorn` is the *actual* backend and `Api` is just a thin wrapper?
        -   Let's look at `server/main.py`. If it imports `session` and exposes endpoints, that's a clue.
        -   Let's look at `backend/api.py`. It calls `session.start_session`.
        -   If the frontend calls `start_session` via bridge, it initializes in `main.py`.
        -   If `uvicorn` is just for something else, then `main.py` holds the state.
        -   **Hypothesis**: The frontend uses the bridge (`Api`). `uvicorn` might be unused or for dev server (frontend assets).
        -   If `main.py` holds the state, then when `webview.start` returns (window closed), `main.py` continues to `finally` block.
        -   In `finally`, we can call `session.save_all_conversations()`.

2.  **Implementation**:
    -   **Update `session.py`**:
        -   Add `save_all_conversations()`: iterate over `_sessions` and save them.
        -   Ensure `save_conversation` handles partial messages (if user closes mid-stream).
    -   **Update `main.py`**:
        -   In the `finally` block (or after `webview.start` returns), call `session.save_all_conversations()`.
        -   Add a "Saving history..." print message.
    -   **Verify Split-Brain**:
        -   I will check `server/main.py` to see what it does. If it's just a dummy or file server, we are good.
        -   If `server/main.py` has API endpoints that modify session, we have a problem.

3.  **Refining the Fix**:
    -   The user mentioned "Closing interface prompts to save record".
    -   I can't easily add a native "Prompt" (Yes/No dialog) in `finally` because the window is already closing/closed.
    -   However, I can *automatically* save. The user probably means "Make sure it saves when I close".
    -   I will implement **Auto-Save on Exit**.

4.  **Addressing "History still not saved"**:
    -   If my previous fix worked, `send_message` and `turn_finished` should save.
    -   If the user closes *during* generation, `turn_finished` isn't reached.
    -   So I need to save *whatever we have* on exit.
    -   In `save_all_conversations`, I will check if there is a `current_assistant_message` buffer and append it to history as a "partial" message before saving.

**Action Plan**:
1.  Read `server/main.py` to rule out split-brain state.
2.  Modify `crates/session.py`:
    -   Add `save_all_conversations()`.
    -   Logic to flush `current_assistant_message` to history (maybe marked as interrupted).
3.  Modify `main.py`:
    -   Import `session`.
    -   Call `session.save_all_conversations()` after `webview.start()` returns.

Let's check `server/main.py` first.
