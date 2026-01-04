I will modify the backend logic to explicitly exclude `.git` and `.history` directories from version control operations (backup and restore) while allowing other dot-files (e.g., `.env`, `.gitignore`).

### Modified Files:
1.  `crates/backend/git_utils.py`
2.  `crates/backend/version_utils.py`

### Changes:
#### 1. `_zip_workspace` (Backup Logic)
- **Current:** Filters out **all** directories and files starting with `.` (e.g., `.env`, `.git`, `.history`).
- **New:** 
    - Only filter out `.git` and `.history` (and `HISTORY_DIR_NAME`).
    - Allow other files/directories starting with `.` to be included in the zip.

#### 2. `restore` / `restore_version` (Restore Logic)
- **Current:** Skips deletion of **all** items starting with `.` during the workspace cleanup phase of a restore.
- **New:** 
    - Only preserve `.git` and `.history`.
    - Allow deletion (and subsequent overwrite from zip) of other dot-files to ensure the restored version is consistent.

### Verification:
- I will verify the changes by creating a test script that:
    1. Creates a dummy environment with `.git`, `.history`, `.env`, and normal files.
    2. Runs `_zip_workspace`.
    3. Checks the zip content to ensure `.env` is present but `.git` and `.history` are absent.
    4. Runs `restore` and verifies that `.env` is correctly restored/overwritten and `.git` is untouched.
