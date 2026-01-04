I will optimize `crates/mdConvert.py` to ensure robust scrolling behavior in the generated HTML. The previous implementation relied on `document.body` scrolling, which can be inconsistent when toggling modes. I will switch to a container-based scrolling approach where both the Preview and Edit views have their own independent scrollable areas, and the main body is fixed.

**Changes to** **`crates/mdConvert.py`:**

1. **Update CSS:**

   * Set `html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }` to prevent the window itself from scrolling.

   * Set `#preview-container { height: 100%; overflow-y: auto; box-sizing: border-box; }` so the preview area handles its own scrolling.

   * Ensure `#raw-content-area` also has `height: 100%; overflow-y: auto;`.

2. **Update JavaScript:**

   * Remove `document.body.style.overflow = ...` assignments in `toggleMode()`. Since `body` is now permanently `overflow: hidden`, we don't need to toggle it. The visibility toggle of the containers (`display: block/none`) is sufficient because each container handles its own scrolling.

This ensures that "Read Mode" (Preview) always has a working scrollbar and responds to mouse wheel events, solving the "cannot scroll" issue.

**Frontend (`FileContentViewer.tsx`) Note:**
The frontend implementation already uses `h-full overflow-auto` on the container, which is the correct way to handle scrolling in React/Flexbox layouts. No changes are required there based on the "mouse cannot scroll" description, as standard CSS overflow handles this. The focus is on the backend-generated HTML file.

**Todo List:**

1. Modify `d:\giteecode\qwencode5\crates\mdConvert.py` to update the CSS injection (add html/body and preview-container styles).
2. Modify `d:\giteecode\qwencode5\crates\mdConvert.py` to update the JS `toggleMode` function (remove body overflow manipulation).

