# Add File Exclusion to Version Management

This plan implements a file exclusion feature for the version management system, allowing users to specify files and folders to ignore during backup and restore operations.

## Backend Changes

### `crates/backend/version_utils.py`
1.  **Implement `update_excluded_paths(path, excluded_paths)`**:
    *   Writes the provided list of excluded paths to `.history/config.json`.
    *   Ensures the parent directory exists.
2.  **Update `restore_version(path, version_id)`**:
    *   Call `get_excluded_paths(path)` to retrieve the exclusion list.
    *   When cleaning the current directory before restoration, **skip** deleting files or directories that match the exclusion list.
    *   Logic: Check if `item_path` or its relative path is in `excluded_paths` before calling `os.remove` or `shutil.rmtree`.
3.  **Verify `_zip_workspace`**:
    *   Ensure it correctly uses `get_excluded_paths` to skip files during compression (existing logic seems correct but will be verified).

### `crates/backend/api.py`
*   Verify `save_excluded_paths` maps to `version_utils.update_excluded_paths`.

## Frontend Changes

### `frontend/src/lib/api.ts`
1.  **Update `API` interface**:
    *   Add `get_excluded_paths(params: { path: string }): Promise<string[]>;`
    *   Add `save_excluded_paths(params: { path: string; excluded: string[] }): Promise<boolean>;`

### `frontend/src/components/version/VersionPanel.tsx`
1.  **Add "Excluded Files" Button**:
    *   Place a new button (e.g., "Excluded Files" or an icon) in the version list header or toolbar.
2.  **Implement Exclusion List Dialog**:
    *   Create a popup/modal that displays the list of currently excluded files and folders.
    *   **Requirement**: "Excluded folder internal files do not repeat display" - Ensure the list shows the entries from the JSON.
    *   Allow removing items from this list (optional but recommended for "Cancel Exclusion" context).

### `frontend/src/components/common/DirectoryPanel.tsx`
1.  **Add Context Menu Items**:
    *   In the file/folder context menu, add:
        *   **"Exclude from Version Control"**: Visible for non-excluded items.
        *   **"Cancel Exclusion"**: Visible for excluded items (or always visible).
2.  **Implement Handlers**:
    *   **Exclude**:
        *   Get relative path of the selected item.
        *   Fetch current excluded list.
        *   Add new path to list (avoid duplicates).
        *   Call `save_excluded_paths`.
    *   **Cancel Exclusion**:
        *   Get relative path.
        *   Fetch current list.
        *   Remove path from list.
        *   Call `save_excluded_paths`.

## Verification
*   **Version Reset**: Verify that resetting a version does not delete files in the excluded list.
*   **Compression**: Verify that creating a new version does not include excluded files in the zip.
*   **UI**: Verify the button appears, the dialog shows the list, and context menu adds/removes items correctly.
*   **Persistence**: Verify `.history/config.json` is created and updated correctly.
