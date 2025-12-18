The issue is that the application backend receives the user's "allow" confirmation but fails to forward it to the running CLI process. The CLI process waits indefinitely for a response to its permission request, causing the "running" state to hang.

To fix this, I will implement the missing communication channel:

1.  **Modify `crates/qwen_adapter.py`**:
    *   Add a `send_response` method to `QwenProcess`. This method will send a JSON-RPC response (matching the request ID) back to the CLI process via standard input.

2.  **Modify `crates/session.py`**:
    *   Add a `handle_permission_response` function. This function will be responsible for locating the correct session and process, and calling `send_response` with the appropriate result (True for allowed, or an error for rejected).

3.  **Modify `crates/backend/api.py`**:
    *   Update `send_tool_call_confirmation_response` to call `session.handle_permission_response`. This ensures that when the frontend sends the confirmation, the backend actively notifies the CLI process.

This chain of changes ensures the loop is closed: CLI requests permission -> Frontend displays -> User clicks Allow -> Frontend notifies Backend -> Backend notifies CLI -> CLI proceeds.