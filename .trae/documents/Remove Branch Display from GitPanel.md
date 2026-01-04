I will modify `frontend/src/components/git/GitPanel.tsx` to remove the "master" branch display from the header, as the concept of branches is no longer relevant in this snapshot-based backup system.

**Proposed Changes:**
1.  **Update Header**: Replace the Git Branch icon and "master" text with a static title **"版本列表" (Version List)**.
2.  **Keep Refresh Button**: The refresh button will be preserved on the right side of the header.

This will eliminate the confusing "master" and "clean" status indicators from the interface.