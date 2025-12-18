I will fix the issue where the application hangs on permission approval and the `pywebview` crash.

1.  **Prevent `pywebview` Crash**:
    *   Modify `crates/events.py` to catch all `Exception`s (not just `ImportError` etc.) in the `emit` function. This prevents `System.ObjectDisposedException` from crashing the application loop when the window is in an invalid state.

2.  **Fix Permission Response Protocol**:
    *   Modify `crates/session.py`:
        *   In `_start_readers`, extract `toolCallId` from the permission request and store a mapping of `toolCallId` -> `JSON-RPC Request ID` in the session state. This is necessary because the frontend returns `toolCallId`, but the CLI expects a response to the `Request ID`.
        *   Update `handle_permission_response` to:
            *   Accept the raw `outcome` string (e.g., "proceed_once") instead of a boolean.
            *   Look up the correct `Request ID` using the `toolCallId`.
            *   Construct the correct JSON-RPC result object matching the Rust ACP specification: `{"outcome": {"outcome": "selected", "optionId": "..."}}`.
    *   Modify `crates/backend/api.py` to pass the `outcome` string to `session.handle_permission_response`.

This ensures the CLI receives the correct JSON-RPC response format and ID, unblocking the process, while also protecting against UI thread crashes.