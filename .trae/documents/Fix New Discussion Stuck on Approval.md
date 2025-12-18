The analysis reveals that the "New Discussion" process gets stuck because the backend's `send_tool_call_confirmation_response` method is currently a placeholder that does nothing. When the frontend sends an approval confirmation, it expects the backend to acknowledge it and update the tool call status. Since the backend fails to do so, the frontend remains in a "running" state indefinitely.

To fix this, I will implement the `send_tool_call_confirmation_response` method in `crates/backend/api.py`.

### Plan:
1.  **Modify `crates/backend/api.py`**:
    *   Locate the `send_tool_call_confirmation_response` method.
    *   Implement logic to parse the `outcome` from the parameters.
    *   Determine the new status (`completed` for approval, `failed` for rejection).
    *   Emit an `acp-session-update` event using `events.emit` to notify the frontend of the status change.

### Implementation Details:
The new implementation will look approximately like this:
```python
    def send_tool_call_confirmation_response(self, params: Dict[str, Any]) -> None:
        session_id = params.get("sessionId", "")
        tool_call_id = params.get("toolCallId", "")
        outcome = params.get("outcome", "")
        
        # Determine status based on outcome
        # Covers "proceed_once", "proceed_always", etc.
        is_approved = outcome.startswith("proceed") or outcome.startswith("allow")
        
        status = "completed" if is_approved else "failed"
        result = "Permission granted" if is_approved else "Permission denied"
        
        # Emit update event to frontend
        events.emit(f"acp-session-update-{session_id}", {
            "sessionUpdate": "tool_call",
            "toolCallId": tool_call_id,
            "status": status,
            "result": result
        })
```

This change will ensure that when the user approves the "init" tool call (or any future tool calls), the frontend receives the completion signal and unblocks the UI.