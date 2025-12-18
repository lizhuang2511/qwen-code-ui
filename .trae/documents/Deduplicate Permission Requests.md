I will fix the duplicate permission request issue.

1.  **Modify `crates/session.py`**:
    *   In the `permission_request` handling block (inside `read_stdout`), check if the `toolCallId` is already in `pending_permissions`.
    *   If it *is* already pending, log a warning and *skip* emitting the `acp-permission-request` event to the frontend. This prevents the UI from rendering a second "Allow/Deny" card for the same tool call.
    *   Alternatively, check if the `request_id` matches. If the CLI sends a duplicate request (retry) with the *same* ID, we should just ignore it or update the mapping, but definitely not show the UI again.
    *   Since the CLI seems to be retrying or sending redundant requests, deduping by `toolCallId` is the safest bet to keep the UI clean.

This ensures that for any given tool call unique ID, only one permission card is presented to the user.