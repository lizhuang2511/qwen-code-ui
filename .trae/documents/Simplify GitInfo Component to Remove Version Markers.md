I will completely remove all Git-related code and terminology from both the backend and frontend, refactoring the system into a pure "Version Backup" system.

**Backend Refactoring:**
1.  **Rename & Clean Utils**: Rename `crates/backend/git_utils.py` to `crates/backend/version_utils.py`.
    *   Remove all fake Git status logic (`is_repo`, `staged`, `unstaged`, `current_branch`).
    *   Rename functions: `init_repo` → `init_backup`, `commit` → `create_snapshot`, `get_log` → `get_history`.
2.  **Update API**: Modify `crates/backend/api.py` to expose new endpoints (e.g., `version_init`, `version_create`) and remove `git_` endpoints.

**Frontend Refactoring:**
1.  **Update API Client**: Modify `frontend/src/lib/api.ts` and `types/backend.ts` to match the new backend endpoints and types (renaming `GitInfo` to `VersionInfo`).
2.  **Refactor Components**:
    *   **Rename Panel**: Rename `GitPanel.tsx` to `VersionPanel.tsx` and move to `components/version/`. Remove all Git UI elements (branch icons, staged files), keeping only the snapshot creation and history list.
    *   **Simplify Info Card**: Rename `GitInfo.tsx` to `ProjectInfo.tsx`. Remove all status indicators (colors, "clean/dirty" badges, branch names), leaving only the clean project directory display as requested.
3.  **Update References**: Update `App.tsx`, `AppHeader.tsx`, and `ProjectDetail.tsx` to use the new `VersionPanel` and `ProjectInfo` components.

**Migration Note**: Existing `.history` folders will be preserved and compatible, as the underlying storage format (zip files) remains unchanged. Only the code and terminology will change.