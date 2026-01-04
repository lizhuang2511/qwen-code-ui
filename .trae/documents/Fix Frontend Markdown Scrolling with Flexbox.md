I will fix the Markdown scrolling issue in the Frontend by refining the Flexbox layout structure in `FileContentViewer.tsx`. The current structure relies on `h-full` inside a block container, which can sometimes lead to scrolling issues. I will convert the container to a flex column and use `flex-1` for the scrollable areas, which is a more robust way to ensure scrolling works correctly within the `Dialog` constraints.

**Changes in** **`frontend/src/components/common/FileContentViewer.tsx`:**

1. **Update Content Container:**
   Change the main content wrapper (around line 576) from:
   `<div className="flex-1 min-h-0 overflow-hidden">`
   to:
   `<div className="flex-1 min-h-0 overflow-hidden flex flex-col">`

2. **Update Markdown Wrapper:**
   Change the Markdown preview wrapper (around line 640) from:
   `<div className="h-full overflow-auto p-4 bg-background">`
   to:
   `<div className="flex-1 overflow-y-auto p-4 bg-background">`

3. **Update CodeMirror Wrapper:**
   Change the CodeMirror wrapper (around line 650) from:
   `<div className="h-full overflow-auto">`
   to:
   `<div className="flex-1 overflow-auto">`

This ensures that the scrollable area correctly fills the available vertical space defined by the `Dialog` and handles overflow appropriately.

**Verification:**
This change aligns with standard CSS Flexbox patterns for scrollable areas within fixed-height (or max-height) modals.

**Todo:**

1. Update `FileContentViewer.tsx` to implement the Flexbox layout fixes.

