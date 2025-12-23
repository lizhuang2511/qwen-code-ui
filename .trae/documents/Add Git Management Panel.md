I will add a Git management panel to the application, allowing users to initialize repositories, view status, commit changes, view history, and reset to previous versions.

**Plan:**

1. **Backend Implementation**:

   * Create `crates/backend/git_utils.py`: Implement Git operations using `gitpython` (`init`, `status`, `commit`, `log`, `reset`).

   * Update `crates/backend/api.py`: Expose these Git operations via the `Api` class (`git_init`, `git_status`, `git_commit`, `git_log`, `git_reset`).

2. **Frontend API Definition**:

   * Update `frontend/src/lib/api.ts`: Add the new Git API method signatures to the `API` interface and the `api` proxy.

3. **Frontend Components**:

   * Create `frontend/src/components/git/GitPanel.tsx`: A new component to display Git status, commit interface, and history.

   * Update `frontend/src/components/layout/AppHeader.tsx`: Add a "Git" button next to the Directory button.

4. **Frontend Integration (`App.tsx`)**:

   * Refactor the right panel state from a boolean (`directoryPanelOpen`) to a type (`'none' | 'directory' | 'git'`) to manage which panel is displayed.

   * Update the layout to render either `DirectoryPanel` or `GitPanel` in the resizable right sidebar based on the active state.

**Dependencies:**

* I will assume `gitpython` is installed or needs to be installed. I will add a check/try-except block in the backend to handle if it's missing gracefully (or just let it fail if the user expects it).

