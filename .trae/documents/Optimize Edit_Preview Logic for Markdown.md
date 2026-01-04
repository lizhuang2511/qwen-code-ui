I will optimize the logic for file editing and viewing in `FileContentViewer.tsx`.

**Plan:**

1. **Remove View Mode Toggles**:

   * Remove the "Preview" and "Source" buttons and the `mdViewMode` state.

   * The logic will be simplified:

     * **Default State**: Render the Markdown Preview (read-only).

     * **Edit State**: When "Edit" is clicked, switch to the Code Editor (`CodeMirrorViewer`).

     * **Save State**: When "Save" is clicked, save the content and switch back to Markdown Preview.

2. **Update** **`FileContentViewer.tsx`**:

   * **State**: Remove `mdViewMode`.

   * **Rendering Logic**:

     * If `isEditing` is `true`: Show `CodeMirrorViewer` (Source Editor).

     * If `isEditing` is `false` (and file is Markdown): Show `MarkdownRenderer` (Preview).

   * **Handlers**:

     * `handleEdit`: Set `isEditing(true)`.

     * `handleSave`: Save content, then set `isEditing(false)`.

     * `handleCancel`: Set `isEditing(false)` and reset content.

**Todo List:**

1. Modify `frontend/src/components/common/FileContentViewer.tsx` to implement the simplified Edit/Preview flow.

