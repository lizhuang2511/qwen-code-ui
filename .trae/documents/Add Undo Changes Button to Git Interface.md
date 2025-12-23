I will implement the "Undo Changes" (撤销变更) button in the Git interface.

### Plan:
1.  **Modify `frontend/src/components/git/GitPanel.tsx`**:
    *   Import the `Undo` icon from `lucide-react`.
    *   Locate the "Commit" button section.
    *   Update the layout to place a new "Undo" button next to the "Commit" button using a flex container.
    *   Implement the `handleDiscard` function to handle the undo logic:
        *   Ask for user confirmation ("确定要撤销所有当前变更吗？...").
        *   Call `api.git_reset` with `commitHash: "HEAD"` and `mode: "hard"` to discard staged and unstaged changes.
        *   Use Promise chains (`.then().catch()`) instead of `try-catch` blocks as requested.
        *   Refresh the git status upon success.

### Technical Details:
*   The undo operation uses `git reset --hard HEAD` which reverts all tracked files to their state in the last commit.
*   Untracked files will remain untouched (safer approach).
