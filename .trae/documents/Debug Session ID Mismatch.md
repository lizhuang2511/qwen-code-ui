The log `[SESSION] Session 916de832... not found or dead` indicates that when `handle_permission_response` is called, the session object is missing from the global `_sessions` dictionary or marked as dead.

This happens because the frontend might be sending a different `sessionId` than what `session.py` is tracking, or the session was prematurely cleaned up.

**Hypothesis:**
1.  **Session ID Mismatch**: The backend initializes a session with one ID, but the frontend might be using a different one (e.g., from a previous run or a default).
2.  **Race Condition**: The session might be marked as "not alive" due to a timeout or error before the permission response arrives.

**Plan:**
1.  **Debug Session IDs**:
    *   I will add logging to `start_session` to print the initialized `session_id`.
    *   I will add logging to `handle_permission_response` to print *all* available keys in `_sessions` when a lookup fails. This will confirm if it's a mismatch.
2.  **Fix Mismatch (if confirmed)**:
    *   If the frontend sends a `sessionId` that doesn't exist, but we have *one* active session, we might want to fallback to that single active session (assuming single-window mode).
    *   However, `crates/session.py` relies on exact ID matches.
    *   I will modify `handle_permission_response` to fuzzy match or print available sessions to help debugging.
3.  **Investigate "Dead" Status**:
    *   The log says "not found or dead". I will split this check to see which one it is.
    *   If it's "dead", I need to check *why* it died (e.g., `process-timeout` in `monitor`).

**Actionable Steps:**
1.  Modify `crates/session.py`:
    *   In `start_session`: Print `[SESSION] Registered session {session_id}`.
    *   In `handle_permission_response`:
        *   Split the `if not s or not s.get("alive")` check.
        *   If `s` is None, print `[SESSION] Available sessions: {list(_sessions.keys())}`.
        *   If `s` is found but not alive, print `[SESSION] Session {session_id} is marked as dead`.

This will allow me to pinpoint why the session lookup fails in the next turn.