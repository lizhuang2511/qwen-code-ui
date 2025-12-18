I will modify `crates/parsers/qwen.py` to correctly identify `tool_call_update` and `stopReason` messages, and then update `crates/session.py` to handle them.

1. **Modify** **`crates/parsers/qwen.py`**:

   * Update `_parse_single` to explicitly handle `session/update` where the update type is `tool_call_update`. Return `{"status": "tool_call_update", "content": data, ...}` so `session.py` can route it.

   * Update `_parse_single` to handle generic JSON-RPC responses (where `result` exists but no `method`).

   * Specifically check for `result.stopReason`. If found, return `{"status": "turn_finished", "content": data, ...}`.

2. **Modify** **`crates/session.py`**:

   * In the `read_stdout` loop, handle the new `turn_finished` status.

   * When `turn_finished` is received, emit `ai-turn-finished-{session_id}`.

This ensures that the "end of turn" signal from the CLI is correctly parsed and triggers the UI state update. The previous fix in `session.py` was trying to handle `tool_call_update` but `parsers/qwen.py` was likely swallowing it into a generic "parsed" status or not returning the specific status needed.

**Wait**, looking at `parsers/qwen.py`:

```python
            if method == "session/update":
                # ...
                # Always return parsed status for session/update to prevent raw JSON display
                return {"status": "parsed", "content": extracted, ...}
```

This is the bug! It swallows `session/update` messages and returns `status="parsed"` with just the text content. It *hides* the `tool_call_update` details from `session.py`.

I need to change this logic to expose `tool_call_update` and `agent_message_chunk` (with stop reason if any) correctly.

**Revised Plan:**

1. **Update** **`crates/parsers/qwen.py`**:

   * Inside `if method == "session/update":` block:

     * Check `sessionUpdate` type.

     * If `tool_call_update`, return `{"status": "tool_call_update", "content": data}`.

     * If `agent_message_chunk`, check for `_meta` or other signals, but mainly keep returning text.

   * Add handling for generic responses (no `method`):

     * If `result` has `stopReason`, return `{"status": "turn_finished", "content": data}`.

2. **Update** **`crates/session.py`**:

   * Handle `turn_finished` status (emit `ai-turn-finished`).

   * Ensure `tool_call_update` logic works with the data structure returned by the updated parser.

