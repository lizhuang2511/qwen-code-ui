I will make the folder management area (Directory Panel) resizable, similar to the chat area.

Here is the plan:

1. **Update** **`frontend/src/hooks/useResizable.ts`**:

   * Add a `reverse` option to the hook to support resizing from the right side (where dragging left increases width).

2. **Update** **`frontend/src/components/ui/sidebar.tsx`**:

   * Export the `SidebarResizeHandle` component so it can be reused in the main layout.

3. **Update** **`frontend/src/App.tsx`**:

   * Import `useResizable` and `SidebarResizeHandle`.

   * Implement the resize logic for the Directory Panel using `useResizable` with `reverse: true`.

   * Update the grid layout to use the dynamic width instead of the fixed `20rem`.

   * Add the `SidebarResizeHandle` to the Directory Panel container.

