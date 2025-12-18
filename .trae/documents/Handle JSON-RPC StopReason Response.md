Based on the logs:
1.  **Tool Execution**: The CLI successfully executed the tool and returned a `tool_call_update` with `status: completed` (inferred from the subsequent text output, although the raw `tool_call_update` log line is truncated in the snippet, we see the agent continuing to generate text).
2.  **Turn Completion**: The CLI emitted `{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}` at the very end.
3.  **Frontend State**: The frontend is still stuck in "Running" (or "Loading the next great idea...").

**Root Cause:**
The backend `session.py` is not handling the `stopReason` in the final JSON-RPC response correctly.
The log shows: `[QwenAdapter] STDOUT: {"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}`.
However, `session.py`'s `parse_qwen_line` (or the logic consuming it) might expect `session/update` events, but this is a *response* to the `session/prompt` request (id=3 was likely the prompt request ID).

In `crates/session.py`, we primarily handle `session/update` notifications. We need to also handle the *final response* to the prompt request, which contains the `stopReason`. If we miss this, the frontend never gets the signal that the turn is truly over.

**Fix Plan:**
1.  **Modify `crates/session.py`**:
    *   In `read_stdout`, specifically check for JSON-RPC *responses* (where `id` is present and matches a request we tracked, or just generic responses).
    *   If the response contains `result.stopReason`, we must emit `ai-turn-finished-{session_id}`.
    *   Currently, `parse_qwen_line` might be filtering this out or categorizing it as something else. I need to check `crates/parsers/qwen.py` first to see how it parses standard JSON-RPC responses.
    *   If `parsers` doesn't handle it, I'll add logic in `session.py` to parse raw JSON if `parse_qwen_line` returns nothing or "unknown".

2.  **Verify `crates/parsers/qwen.py`** (I will read it first):
    *   Does it handle `{"jsonrpc": "2.0", "id": ..., "result": ...}`?
    *   If not, I will update `session.py` to handle this case directly.

This will ensure that when the CLI says "I'm done" (`end_turn`), the frontend actually stops loading.