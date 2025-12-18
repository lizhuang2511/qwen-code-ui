I will fix the React `DialogContent` warning and add logging to debug the "stuck" CLI process.

1.  **Fix React Warning (`frontend/src/components/ui/dialog.tsx`)**:
    *   The warning `Missing Description or aria-describedby={undefined} for {DialogContent}` indicates that `DialogContent` is rendered without a description, which is required for accessibility by Radix UI.
    *   I will add `aria-describedby={undefined}` to the `DialogPrimitive.Content` component in `frontend/src/components/ui/dialog.tsx` as a default fallback, or ensure consuming components provide a description. Given the generic nature of the UI component, adding `aria-describedby={props["aria-describedby"]}` explicitly or defaulting it might be needed, but the warning suggests `aria-describedby={undefined}` is the current state.
    *   A better fix is to ensure that `DialogContent` properly handles the absence of a description. However, the simplest fix for the warning (if a description isn't always logically present) is to suppress it or provide a hidden default. But the warning says "Missing `Description` OR `aria-describedby={undefined}`", which is slightly confusing phrasing. It usually means *either* provide a `<DialogDescription>` *or* set `aria-describedby={undefined}` to opt-out if you really don't need one.
    *   I will update `frontend/src/components/ui/dialog.tsx` to include `aria-describedby={undefined}` in the `DialogPrimitive.Content` props if one isn't provided, to silence the warning for dialogs that don't need a description.

2.  **Add Debug Logging (`crates/session.py` & `crates/qwen_adapter.py`)**:
    *   I will add print statements (which appear in the terminal/console) to trace the flow of permission handling.
    *   **In `crates/session.py`**:
        *   Log when `acp-permission-request` is emitted, including the `request_id` and `toolCallId`.
        *   Log inside `handle_permission_response`:
            *   Log the incoming `tool_call_id` and `outcome`.
            *   Log the resolved `req_id` (or if it failed to resolve).
            *   Log the payload being sent to `proc.send_response`.
    *   **In `crates/qwen_adapter.py`**:
        *   Log inside `send_response` to confirm the JSON payload matches expectations.
        *   Log inside `_read_loop` to see if the CLI sends any response *after* we send the permission decision (e.g., does it error out? does it send the tool output?).

3.  **Verify**:
    *   After applying these changes, the user (or I) can reproduce the "Allow" click.
    *   The logs will reveal if the `req_id` mapping is correct and if the message is actually sent to the CLI.

This approach addresses the user's immediate UI warning and provides the necessary visibility to solve the persistent "stuck" bug.