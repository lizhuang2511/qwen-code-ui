I will implement the requested changes to the backup system, moving away from `commits.json` and simplifying the interface.

### Backend Changes (`crates/backend/version_utils.py`)
1.  **Stop using `commits.json`**:
    *   Modify `_load_versions` to ignore `commits.json` and always list `.zip` files from the `.history` directory directly, sorting by modification time.
    *   Modify `create_snapshot` to stop writing new entries to `commits.json`.
    *   Modify `delete_version` to stop updating `commits.json` when deleting a backup.
    *   Remove `_save_versions` usage.

### Frontend Changes (`frontend/src/components/version/VersionPanel.tsx`)
1.  **Remove Detailed Info Input**:
    *   Remove the "Remark info" (备注信息) input field and expand/collapse logic under the submit button.
    *   Update `handleCreateVersion` to stop sending the message field.
2.  **Remove Detailed Info Display**:
    *   Remove the click handler on backup items that showed details.
    *   Remove the bottom detail area (remark info display).
    *   Remove the `selectedVersion` state and related logic.

### Verification
*   I will verify the changes by checking the modified code.
*   The user can verify by running the application and checking that:
    *   Backups are listed correctly based on files.
    *   The detailed info input and display are gone.
    *   `commits.json` is no longer used/updated.