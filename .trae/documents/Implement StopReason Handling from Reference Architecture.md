I have confirmed with the reference code (`crates/backend/src/session/mod.rs` lines 1576-1586) that the backend **must** explicitly listen for JSON-RPC responses containing `stopReason: "end_turn"` and emit a "turn finished" event. The reference Rust code does exactly this:

```rust
if let Ok(result) = serde_json::from_value::<SessionPromptResult>(...) 
    && result.stop_reason == "end_turn" {
    let _ = event_tx.send(InternalEvent::GeminiTurnFinished { ... });
}
```

My proposed plan for the Python implementation mirrors this logic exactly.

**Fix Plan:**

1.  **Modify `crates/parsers/qwen.py`**:
    *   Upgrade the parser to recognize generic JSON-RPC responses (messages with `result` but no `method`).
    *   Extract `stopReason` from these responses.
    *   Return a status of `turn_finished` when a stop reason is found.
    *   Also ensure `tool_call_update` messages are correctly identified and returned with `status="tool_call_update"`.

2.  **Modify `crates/session.py`**:
    *   Update the main read loop to handle the `turn_finished` status.
    *   Emit the `ai-turn-finished-{session_id}` event to the frontend when this status is received.
    *   This will signal the UI to stop the "Running" indicator and enable the input box for the next turn.

This will resolve the "stuck in running" issue by correctly closing the turn when the CLI finishes its work.