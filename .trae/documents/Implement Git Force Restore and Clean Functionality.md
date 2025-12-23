I will implement the `restore` functionality using `gitpython` to support both "Force Restore to Version" and "Discard Uncommitted Changes" (Undo).

1.  **Modify `crates/backend/git_utils.py`**:
    *   Add `restore(path: str, commit_hash: str = None) -> bool`.
    *   **Logic**:
        *   If `commit_hash` is provided: `repo.git.reset("--hard", commit_hash)`.
        *   If `commit_hash` is NOT provided (Undo/Discard case): `repo.git.reset("--hard")` (Resets to HEAD).
        *   **Clean Untracked**: Execute `repo.git.clean("-fd")` to remove untracked files and directories.
    *   This function uses `gitpython` directly and avoids `try-except` blocks.

2.  **Modify `crates/backend/api.py`**:
    *   Add `git_restore(self, params: Dict[str, Any]) -> bool`.
    *   Accepts `path` and optional `commitHash`.
    *   Calls `git_utils.restore`.

This provides the backend logic to force the repository to a clean state matching the specified version (or HEAD), effectively implementing both "Right Click Restore" and "Undo Uncommitted Changes".