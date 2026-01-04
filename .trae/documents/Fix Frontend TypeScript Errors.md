I will fix the TypeScript errors that caused the frontend build to fail.

**Errors Identified:**
1.  `src/components/git/GitPanel.tsx:15`: `'Undo' is declared but its value is never read`.
    *   **Fix**: Remove the unused `Undo` import.
2.  `src/lib/webApi.ts:35`: `Type ... is missing the following properties from type 'API': git_restore, git_delete_commit`.
    *   **Fix**: Update `webApi` (mock/web implementation) to include dummy implementations for `git_restore` and `git_delete_commit`, matching the interface update I made in `api.ts`.

**Plan:**
1.  **Modify `frontend/src/components/git/GitPanel.tsx`**: Remove `Undo` from imports.
2.  **Modify `frontend/src/lib/webApi.ts`**: Add mock functions for `git_restore` and `git_delete_commit` (returning `Promise.resolve(true)` or `false`).

This will resolve the compilation errors and allow the build to proceed.