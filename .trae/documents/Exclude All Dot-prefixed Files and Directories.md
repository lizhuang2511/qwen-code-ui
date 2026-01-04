I will modify `crates/backend/git_utils.py` to exclude all files and directories starting with `.` (dot) from the version control operations (compression, restoration, and monitoring).

**Specific Changes:**

1.  **Modify `_zip_workspace`**:
    *   Update the exclusion logic to skip any directory or file name that starts with `.`. This will cover `.git`, `.history`, `.vscode`, `.env`, etc.

2.  **Modify `restore`**:
    *   Update the cleanup logic to skip deleting any file or directory starting with `.`. This ensures configuration files and hidden folders are preserved during a reset.

3.  **Modify `ChangeHandler._add_change`**:
    *   Update the filter to ignore any path component starting with `.`. This prevents changes in hidden files from triggering the "unsaved changes" status.

This approach provides a cleaner and more robust exclusion rule consistent with common version control practices for hidden files.