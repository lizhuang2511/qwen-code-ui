I will fix the issue where the frontend state remains stuck in "Running" even after tool execution fails or is cancelled, and improve robustness against concurrent permission requests.

1.  **Modify `crates/session.py` to handle tool call completion/failure events**:
    *   In `_start_readers`, parse `session/update` messages.
    *   If a `tool_call_update` event is received with `status` as `completed` or `failed`, emit an `acp-session-update-{sessionId}` event to the frontend to force a state update.
    *   If a `stopReason` event (like "cancelled") is received, emit an `ai-turn-finished-{sessionId}` event to ensure the frontend stops the loading indicator.

2.  **Modify `crates/session.py` to clean up pending permissions**:
    *   When a `tool_call_update` with a terminal status (`completed` or `failed`) is received, check if there are any pending permission requests for that tool call ID and remove them from the `pending_permissions` map. This prevents stale mappings from causing confusion.

3.  **Modify `crates/session.py` to emit turn finished on error**:
    *   When an ACP protocol error (like the one seen in logs: `-32603 Internal error`) is detected in the output stream, emit `ai-turn-finished-{sessionId}`. This ensures that even if the CLI crashes or errors out without a standard stop reason, the frontend doesn't hang indefinitely.

This plan addresses the root cause of the "stuck" UI: the frontend isn't receiving the necessary signals to know that the turn has ended (abnormally) or that the tool execution has finished/failed. By proactively emitting these events from the backend, we force the UI to synchronize state.