I will modify `crates/backend/version_utils.py` and `crates/backend/git_utils.py` to use `.history/config.json` and ensure the directory exists.

**Plan:**

1. **Modify** **`_get_config_path`**: Return `.history/config.json`.
2. **Update** **`get_excluded_paths`**:

   * Ensure the `.history` directory exists (create it if missing).

   * Check if `.history/config.json` exists.

   * If it **does not exist**, create it with default content (`{"excluded_paths": []}`) and return an empty list.

   * If it exists, read and return the exclusions.
3. **Update** **`update_excluded_paths`**:

   * Write to `.history/config.json` (ensuring the directory exists).
4. **Update** **`_zip_workspace`**:

   * Add `.history/config.json` to the zip archive.

   * Continue excluding the `.history` folder itself.

**Files to modify:**

* `crates/backend/version_utils.py`

* `crates/backend/git_utils.py`

