I will enhance the `FileContentViewer` component to support maximizing, dragging, and resizing.

**Plan:**

1. **Modify** **`frontend/src/components/common/FileContentViewer.tsx`**:

   * **Imports**: Add `Maximize` and `Minimize` icons from `lucide-react`.

   * **State**: Add `isMaximized` (boolean) and `position` ({ x: number, y: number } | null).

   * **Refs**: Add `dialogRef` to access the dialog content DOM element.

   * **Handlers**:

     * `toggleMaximize`: Switch between maximized and normal state.

     * `handleDragStart`: logic to calculate initial position and start dragging (using mousemove/mouseup listeners on document).

   * **Styles**:

     * Apply `cursor-move` to `DialogHeader`.

     * Apply dynamic styles to `DialogContent`:

       * When **Maximized**: `width: 100vw`, `height: 100vh`, `top: 0`, `left: 0`, `transform: none`, `maxWidth: none`.

       * When **Dragged**: `top: y`, `left: x`, `transform: none`, `maxWidth: none`.

       * **Resize**: Add `resize: 'both', overflow: 'auto'` to `DialogContent` styles to allow native resizing.

   * **UI**:

     * Add the Maximize/Restore button to the `DialogTitle` (next to the Close button or in the controls area).

**Note on Resizing**: I will enable CSS native resizing (`resize: both`) on the dialog content. This provides a drag handle at the bottom-right corner.

**Note on Dragging**: I will implement a custom drag handler attached to the `DialogHeader`, which updates the `position` state.

**Validation**:

* Verify that clicking the Maximize button toggles full screen.

* Verify that dragging the header moves the window.

* Verify that the window can be resized using the bottom-right handle.

**Todo List**:

1. Update `FileContentViewer.tsx` to add icons, state, handlers, and update the UI.

