I will redesign the `GitPanel` based on the user's simplified requirements.

**Plan:**

1. **Redesign Commit Section (`GitPanel.tsx`)**:

   * **Input**: A simple commit message input box (placeholder: "提交变更内容(Ctrl+Enter 在“main”提交)").

   * **Button**: A large blue "提交" (Commit) button below the input.

   * **Remove AI Feature**: Ensure no "sparkle" or AI commit message generation icon/feature is present.

2. **Redesign History/Version List (`GitPanel.tsx`)**:

   * **List Style**: Display commit history as a simple vertical list.

   * **Item Content**: Each item shows the commit message and author/date compactly.

   * **Context Menu**: Implement a right-click context menu (or a simple dropdown menu icon) on each commit item to offer the "Reset/Revert" (回退版本) option.

   * **Selection**: Allow clicking a commit to "select" it.

3. **Selected Version Detail Area (`GitPanel.tsx`)**:

   * Add a new section at the bottom (or below the list) that shows details *only for the selected commit*.

   * **Content**: Simplify this view to show a summary count and list of changed files (e.g., "3 files changed: file1.txt, file2.ts...").

   * **Default State**: If no version is selected, this area can be empty or show current working tree status.

4. **Hide Large File Lists**:

   * The main view will *not* show the long list of staged/unstaged files by default.

   * Instead, show a summary like "XX Pending Changes" which can be clicked to view details in the "Selected Version/Status" area.

**Implementation Details:**

* Modify `frontend/src/components/git/GitPanel.tsx`.

* Use a state variable `selectedCommit` to track which commit's details to show.

* Use `ContextMenu` or `DropdownMenu` from `radix-ui` (or `shadcn/ui` equivalents) for the right-click/menu actions.

