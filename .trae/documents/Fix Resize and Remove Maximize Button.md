I will fix the dialog resizing issue and remove the maximize button as requested.

The current implementation using CSS `resize: both` on the `DialogContent` likely fails because:

1. The `DialogContent` component from `shadcn/ui` / `radix-ui` has strict positioning (`fixed`, `transform: translate(-50%, -50%)`) which conflicts with native CSS resizing.
2. The `DialogOverlay` might be interfering with mouse events.

**Plan:**

1. **Remove Maximize Button & Logic:**

   * Remove `isMaximized` state and `toggleMaximize` function.

   * Remove the Maximize/Minimize button from the UI.

   * Clean up `Maximize2`/`Minimize2` imports.

2. **Implement Custom Resizing Logic:**

   * Instead of relying on CSS `resize: both`, I will implement a custom mouse-based resize handler, similar to how I implemented the drag logic.

   * I will add a "resize handle" element (a small div) to the bottom-right corner of the dialog.

   * I will add `size` state (`width`, `height`) to the component.

   * I will implement `handleResizeStart` which listens to `mousemove` and `mouseup` to update the `size` state.

3. **Refine Styles:**

   * Update `dialogStyle` to use the explicit `width` and `height` from state (if resizing has occurred), falling back to default/auto.

   * Ensure `maxWidth` and `maxHeight` are set to `none` or large enough values when resizing is active to prevent constraints.

**Details for Resize Implementation:**

* **State**: `const [size, setSize] = useState<{ width: number; height: number } | null>(null);`

* **Handle**: `<div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" onMouseDown={handleResizeStart} />`

* **Logic**:

  * On `mousedown` of the handle: capture current mouse pos and current dimensions.

  * On `mousemove`: calculate delta and update `size`.

  * On `mouseup`: cleanup listeners.

**Todo List:**

1. Update `FileContentViewer.tsx` to remove maximize functionality and implement custom resize logic with a drag handle.

