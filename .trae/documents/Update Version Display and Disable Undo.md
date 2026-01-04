I will modify `crates/backend/git_utils.py` to adjust how the version history is displayed and ensure the undo functionality is disabled.

**Changes:**

1.  **Modify `get_log` function**:
    *   **List Display**: Change the `summary` field to use the zip filename (`name`). This ensures the file name appears in the main list view (fixing the issue where it currently shows "Archive size").
    *   **Detailed Info**: Change the `message` field to include the file size (e.g., `Archive size: 1024 bytes`). This ensures the detailed view shows the size information.

2.  **Verify `restore` function**:
    *   Ensure it continues to return `False` when no `commit_hash` is provided. This effectively disables the "Undo" operation (which typically calls restore without a hash), fulfilling the requirement to cancel the undo function.

This directly addresses the user's UI display requirements and functional constraints.