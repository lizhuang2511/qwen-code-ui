I will implement the Zip-based version control system, replacing Git, with the specific `watchdog` optimization requested.

**Refined Requirements:**
1.  **Watchdog Logic**: Instead of comparing with the zip, `watchdog` will monitor the current folder for *any* file changes.
2.  **Persistence**: The change status (modified files or "dirty" flag) must be saved to a file (e.g., `.history/status.json`) so it persists across app restarts.
3.  **Zip & Restore**: Same as before (Zip to `.history`, Clean & Unzip for restore).

**Implementation Plan:**

1.  **Modify `crates/backend/git_utils.py`**:
    *   **Dependencies**: Import `zipfile`, `shutil`, `watchdog.observers`, `watchdog.events`.
    *   **`init_repo(path)`**:
        *   Create `.history` directory.
        *   Zip current workspace to `.history/初始.zip`.
        *   Initialize `.history/status.json` with empty changes.
        *   Start Watchdog.
    *   **`commit(path, message)`**:
        *   Zip workspace to `.history/<message>.zip`.
        *   Clear changes in `.history/status.json` (mark as clean).
    *   **`get_log(path)`**:
        *   List `.zip` files in `.history`, sorted by modification time.
    *   **`restore(path, zip_name)`**:
        *   Stop Watchdog.
        *   Delete workspace files (except `.history`).
        *   Unzip `.history/<zip_name>.zip`.
        *   Clear changes in `.history/status.json`.
        *   Restart Watchdog.
    *   **`get_status(path)`**:
        *   Read `.history/status.json` to return modified files/status.
    *   **Watchdog Handler**:
        *   On `on_modified`, `on_created`, `on_deleted`, `on_moved`:
            *   Update `.history/status.json` (add changed file path).
            *   Save to disk immediately.

2.  **Modify `crates/backend/api.py`**:
    *   Map `git_*` endpoints to the new `git_utils` functions.

3.  **Startup Logic**:
    *   Ensure Watchdog starts when the backend/session starts (likely in `init_repo` or a new `start_monitoring` function called by `api.py` or `main.py`). *Optimization*: I'll add `start_monitoring(path)` to `git_utils` and call it from `get_status` or explicitly if needed.

This approach satisfies the "no git", "zip backup", "watchdog for local changes", and "persistence" requirements.