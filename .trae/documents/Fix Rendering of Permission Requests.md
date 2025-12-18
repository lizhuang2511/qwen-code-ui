I have identified the issue: the backend (Python) is not correctly parsing `session/request_permission` JSON-RPC messages, causing them to be sent as raw text (`ai-output`) to the frontend instead of as a structured permission request event (`acp-permission-request`). This results in the raw JSON being displayed in the chat instead of the "Allow/Deny" buttons.

I will fix this by:
1.  **Modifying `crates/parsers/qwen.py`**:
    -   Update `_parse_single` to detect JSON messages with `method: "session/request_permission"`.
    -   Return a parsed result with `status: "permission_request"` and the full JSON data as content.

2.  **Modifying `crates/session.py`**:
    -   Update `_start_readers` (specifically `read_stdout`) to check for the `permission_request` status.
    -   When detected, emit the `acp-permission-request-{session_id}` event with the correct payload structure (`request_id` and `request` params).
    -   Prevent the raw JSON from being emitted as `ai-output` to avoid duplicate/incorrect rendering in the chat.

This ensures the frontend receives the correct event to trigger the `McpPermissionCompact` or `McpPermissionDialog` component, displaying the "Allow" and "Deny" buttons as intended.
