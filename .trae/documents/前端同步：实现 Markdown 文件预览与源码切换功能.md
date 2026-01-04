我将修改前端代码，在 `FileContentViewer.tsx` 中为 Markdown 文件添加“阅读模式”和“源代码模式”的切换功能，复刻之前后端修改的效果。

### 计划修改内容：

1.  **修改 `FileContentViewer.tsx`**：
    *   **状态管理**：增加 `viewMode` 状态，用于在 Markdown 文件的“Preview”（预览）和“Code”（源码）之间切换。
    *   **界面元素**：
        *   在 Markdown 文件视图中添加切换按钮（例如“Preview”和“Source”）。
        *   当处于 Preview 模式时，使用 `MarkdownRenderer` 组件渲染内容。
        *   当处于 Source 模式时，使用 `CodeMirrorViewer` 组件显示源码（复用现有的编辑视图逻辑，但作为只读展示或编辑入口）。
    *   **逻辑处理**：
        *   检测文件类型是否为 Markdown。
        *   如果是 Markdown，默认显示 Preview 模式。
        *   确保 Edit 功能依然可用，点击 Edit 自动切换到源码编辑模式。

2.  **验证 `MarkdownRenderer`**：
    *   确保 `MarkdownRenderer` 能正确处理 Markdown 内容。
    *   现有的 `MarkdownRenderer.tsx` 已经使用了 `react-markdown` 和相关插件（gfm, math, katex），功能应该足够。

### 详细步骤：

1.  在 `FileContentViewer` 组件中添加 `const [mdViewMode, setMdViewMode] = useState<"preview" | "source">("preview");`。
2.  在文件类型判断逻辑中，针对 Markdown 文件（`ext === "md" || ext === "markdown"`），在顶部工具栏添加切换按钮。
3.  在渲染内容区域：
    *   如果文件是 Markdown 且 `mdViewMode === "preview"` 且不在编辑模式 (`!isEditing`)，渲染 `<MarkdownRenderer>{fileContent.content}</MarkdownRenderer>`。
    *   否则（源码模式或编辑模式），保持原有的 `CodeMirrorViewer` 渲染逻辑。
4.  更新 Edit 按钮逻辑：点击 Edit 时，自动将视图切换为源码模式（如果尚未切换）。

### 预期效果：
*   打开 Markdown 文件时，默认显示渲染后的 HTML 预览。
*   点击“Source”按钮，切换到代码编辑器视图，查看 Markdown 源码。
*   点击“Edit”按钮，进入编辑状态（源码视图）。
*   其他文件类型保持原有行为。

请确认是否执行此计划。