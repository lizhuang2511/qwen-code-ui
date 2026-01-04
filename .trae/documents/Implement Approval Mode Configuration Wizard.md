I have identified the reason why `/approval-mode yolo` is not working.

**Reason:**
The current implementation in `crates/session.py` treats all user messages, including those starting with `/`, as standard chat prompts and forwards them directly to the Qwen CLI. The Qwen CLI, when running in ACP mode, processes this as conversation text rather than a configuration command. To support slash commands like `/approval-mode`, we need to intercept them in the backend before they reach the CLI.

**Plan:**
I will modify `crates/session.py` to implement the approval mode logic in the Python wrapper:

1.  **Intercept Commands:** Update `send_message` to check if a message starts with `/approval-mode`.
    *   If detected, parse the mode (`plan`, `default`, `auto-edit`, `yolo`) and update the session's state.
    *   Emit a system message to the frontend confirming the mode change.
    *   Prevent the message from being sent to the Qwen CLI.

2.  **Implement Approval Logic:** Update the `_start_readers` function to check the session's `approval_mode` when a `permission_request` is received from the CLI.
    *   **YOLO Mode:** Automatically send a "proceed" response for all permission requests.
    *   **Auto-Edit Mode:** Automatically send a "proceed" response for file editing tools (e.g., `edit`, `write_file`), while still prompting for other tools (like shell commands).
    *   **Default/Plan Mode:** Retain the current behavior (forward request to frontend).

3.  **Initialize State:** Ensure `approval_mode` is initialized to "default" (or based on config) in `start_session`.

This approach allows runtime switching of approval modes without needing to restart the Qwen CLI process.