I will implement auto-refresh for file changes and ensure that expanded folders remain open after refreshing.

### 1. Create Backend Watcher (`crates/watcher.py`)
- **Implement `FileWatcher`**: A class to monitor the working directory.
- **Dual Strategy**: 
    - Use `watchdog` if available for efficient monitoring.
    - Fallback to `PollingWatcher` (checks mtime every 2s) if `watchdog` is missing.
- **Event Emission**: Emit `fs-change` event via `events.emit` on file creation, deletion, or modification.

### 2. Integrate Watcher into Session (`crates/session.py`)
- **Lifecycle Management**: Start the watcher in `start_session` and stop it in `kill_process`.
- **State**: Store the watcher instance in the `_sessions` dictionary.

### 3. Update Frontend DirectoryPanel (`frontend/src/components/common/DirectoryPanel.tsx`)
- **State Management**: Add `expandedPaths` state (`Set<string>`) to track expanded folders persistently across refreshes.
- **Update Logic**: Modify `toggleDirectory` to sync with `expandedPaths`.
- **Smart Refresh**: Rewrite `initializeRoot` (renamed/wrapped as `refreshTree`) to:
    - Recursively load directory contents for all paths in `expandedPaths`.
    - Reconstruct the tree with the correct expansion state and updated file lists.
    - This ensures that when a refresh occurs (auto or manual), the user's view (open folders) is preserved.
- **Event Listener**: Listen for `fs-change` with a debounce (e.g., 500ms) to trigger the smart refresh without overwhelming the UI.

This approach solves the "refresh needed" issue while respecting the user's request to "keep folders open".
