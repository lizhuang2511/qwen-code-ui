Based on the logs:
1.  **Session Mismatch Fixed**: The fallback logic successfully kicked in: `[SESSION] Fallback: using single available session ...`.
2.  **Request Mapped**: `[SESSION] Resolved requestId 0 from map` confirms that `toolCallId` was correctly mapped to the CLI's `request_id`.
3.  **Response Sent**: `[QwenAdapter] Sending response: {"jsonrpc": "2.0", "id": "0", ...}` and `Response flushed to stdin` confirm the data was sent to the CLI.
4.  **Process Stuck**: Despite receiving the response, the CLI process does not seem to react. It doesn't print any new output, and eventually the connection closes (likely user action or timeout).

**Root Cause Analysis:**
The format of the `id` in the JSON-RPC response might be the issue.
*   The CLI sends `id: 1` (integer) in its requests (see `[QwenAdapter] Handshake Init Response: {"jsonrpc":"2.0","id":1...}`).
*   Our adapter sends `id: 2` (integer) in its requests.
*   But in the permission response, we are sending `"id": "0"` (string) or `"id": "1"` (string).
    *   See log: `[QwenAdapter] Sending response: {"jsonrpc": "2.0", "id": "0", ...}`.
    *   JSON-RPC 2.0 allows strings or integers, but if the CLI (Rust implementation) specifically expects the *exact same type* as the request ID it sent, returning a string when it sent an integer (or vice versa, or just strict typing) might cause it to ignore or fail to match the response.
    *   The `requestId` stored in `session.py` comes from `str(data.get("id"))`.

**Fix Plan:**
1.  **Strict ID Type Matching**:
    *   Modify `crates/session.py` to store the `request_id` in its original type (likely `int`) instead of converting to `str` immediately.
    *   Or, ensuring `send_response` uses the correct type.
    *   Looking at `crates/qwen_adapter.py`: `resp = { ..., "id": request_id }`.
    *   Looking at `crates/session.py`: `req_id = str(data.get("id"))`. This conversion to string is likely the problem if the CLI expects an int.

**Action:**
1.  Modify `crates/session.py`:
    *   Capture `id` as-is (without `str()` conversion) when storing in `pending_permissions`.
    *   Ensure `req_id` passed to `send_response` preserves this type.

This should align the response ID type with what the CLI expects (integer `0`, not string `"0"`), unblocking the permission wait.