I have identified the issue: the global CSS disables scrolling on the `body` element (`overflow: hidden`), but the Projects page lacks a scrollable container. This prevents the user from scrolling when the list of projects exceeds the window height.

I will fix this by modifying `frontend/src/pages/Projects.tsx` to make the root container of the page take up the full available height and enable vertical scrolling.

**Plan:**
1.  **Edit `frontend/src/pages/Projects.tsx`**:
    - Change the root `div`'s class from `w-full` to `w-full h-full overflow-y-auto`.
    - This ensures the page fills the available space within the application layout and provides its own scrollbar when content overflows.

This change is minimal and directly addresses the user's request to allow scrolling down the projects list.
