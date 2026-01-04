I will modify `crates/backend/git_utils.py` to exclude `.git` directories from both the backup (compression) and restore (deletion) processes, as well as the watchdog monitoring.

**Specific Changes:**

1.  **Modify `_zip_workspace`**:
    *   Update the `os.walk` loop to explicitly skip the `.git` directory. This ensures Git history files are never included in the `.history` zip backups.

2.  **Modify `restore`**:
    *   Update the cleanup loop to skip deleting the `.git` folder (in addition to skipping `.history`). This prevents the `PermissionError` [WinError 5] caused by trying to delete read-only Git object files.

3.  **Modify `ChangeHandler`**:
    *   Update `_add_change` to ignore any file events occurring within `.git`. This ensures that background Git operations don't trigger "Unsaved Changes" status in the application.

This will solve the permission error and keep the version control system purely focused on user code, co-existing peacefully with any existing `.git` repository.