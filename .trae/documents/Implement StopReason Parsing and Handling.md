I have read the `crates/backend/src/session/mod.rs` file from the reference code. This Rust file shows how the backend session management is implemented in the reference project. However, since the current project is Python-based (for the session management logic in `crates/session.py`), I need to apply the logic from my previous analysis to the Python codebase.

The previous plan to fix `crates/parsers/qwen.py` and `crates/session.py` is still valid and necessary to solve the "stuck in running" issue caused by missing `stopReason` handling.

**Plan:**

1.  **Modify `crates/parsers/qwen.py`**:
    *   Update `_parse_single` to correctly handle `session/update` messages. Instead of returning a generic `parsed` status, it should return specific statuses like `tool_call_update` or `agent_message_chunk` so `session.py` can route them properly.
    *   Add handling for generic JSON-RPC responses (lines starting with `{"jsonrpc": "2.0"` but without a `method`). Specifically, look for `result` containing `stopReason`. If found, return a `turn_finished` status.

2.  **Modify `crates/session.py`**:
    *   Update `read_stdout` to handle the new `turn_finished` status from the parser.
    *   When `turn_finished` is received, emit the `ai-turn-finished-{session_id}` event.
    *   Ensure the existing `tool_call_update` logic works with the data structure returned by the updated parser.

This will ensure that when the CLI outputs `{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}`, the backend correctly recognizes it as the end of the turn and signals the frontend to stop the loading indicator.