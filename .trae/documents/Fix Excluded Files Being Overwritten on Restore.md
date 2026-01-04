# Fix Defects in Version Restore Logic

After reviewing the source code in `crates/backend/version_utils.py`, I have identified two critical bugs that cause the issues you described ("deleted" and "replaced").

## Root Cause Analysis

1.  **"Deleted" (Deletion Logic Bug)**:
    *   In the deletion phase, the code iterates through files and checks `if rel_path not in excluded`.
    *   **The Bug**: This only checks for **exact matches**. If you exclude a folder (e.g., `src`), but the code encounters a file inside it (e.g., `src/main.py`), `src/main.py` is **not equal** to `src`.
    *   **Result**: The code erroneously deletes all files *inside* your excluded folders because they don't exactly match the folder name string.

2.  **"Replaced" (Extraction Logic Bug)**:
    *   In the restoration phase, the code uses `zipf.extractall(path)`.
    *   **The Bug**: `extractall` blindly unzips everything from the backup. If the old backup contains files that are now excluded, they will be extracted and **overwrite** whatever is currently on disk.
    *   **Result**: Even if a file survived the deletion phase, it gets replaced by the old version from the zip.

## Fix Plan

### 1. Implement Robust `is_path_excluded` Helper
Create a helper function that correctly handles directory hierarchy and path separators:
*   Normalize all paths to use `/`.
*   Check if the path **matches** an excluded entry.
*   Check if the path **is inside** an excluded directory (i.e., starts with `excluded_dir/`).

### 2. Fix `restore_version` Logic

**Step A: Fix Deletion Phase**
*   Modify the `os.walk` loop to use `is_path_excluded(rel_path, excluded)`.
*   This ensures that if `src` is excluded, `src/main.py` will also be recognized as excluded and **skipped** (not deleted).

**Step B: Fix Extraction Phase**
*   Remove `zipf.extractall(path)`.
*   Iterate through the zip file contents (`zipf.infolist()`).
*   For each file, check `is_path_excluded(filename, excluded)`.
*   **Only extract** files that are NOT excluded.

### 3. Apply to `_zip_workspace`
*   Apply the same `is_path_excluded` logic to the backup process to ensure future backups are clean and correct.

This comprehensive fix addresses both why files were disappearing (deletion bug) and why they were reverting (extraction bug).
