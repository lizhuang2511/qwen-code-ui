I will implement the backend logic to support deleting versions (zip backups).

**Note on Frontend**: I noticed that the frontend source code (e.g., `src` directory) is not visible in the file list (only `dist` is present). Therefore, I cannot add the "Delete" button to the right-click menu in the UI directly. I will implement the necessary backend API so that the functionality is available when the frontend is updated to call it.

**Implementation Plan:**

1.  **Modify `crates/backend/git_utils.py`**:
    *   Add `delete_commit(path: str, commit_hash: str) -> bool`.
    *   **Logic**:
        *   Construct path to `.history/<commit_hash>.zip`.
        *   Check if file exists.
        *   Delete the file using `os.remove`.
        *   Return `True` on success, `False` on error.

2.  **Modify `crates/backend/api.py`**:
    *   Add `git_delete_commit(self, params: Dict[str, Any]) -> bool`.
    *   **Logic**:
        *   Extract `path` and `commitHash` from params.
        *   Call `git_utils.delete_commit`.

This provides the required backend functionality for the "Delete Version" feature.