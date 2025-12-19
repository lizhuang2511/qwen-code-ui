# Fix Paste Functionality

## 1. Improve Backend Clipboard Handling (`crates/backend/api.py`)
- **Robustness**: Wrap `OpenClipboard` in a retry loop (it can fail if another app is accessing the clipboard).
- **Path Cleaning**: When analyzing text content, strip surrounding quotes (`"` or `'`) before checking `os.path.exists`. This handles cases where users copy "Copy as Path" which often includes quotes.
- **Multiple Formats**: Explicitly check for both `CF_HDROP` (files) and `CF_UNICODETEXT` (text).
- **Error Handling**: Ensure `CloseClipboard` is always called in a `finally` block or handled safely.

## 2. Frontend Logic Refinement (`frontend/src/components/common/DirectoryPanel.tsx`)
- **Review `handlePaste`**: Ensure `targetDir` is correctly propagated. The current implementation looks mostly correct, but I will double-check the `pasteTargetDir` state setting order.
- **Dialog Logic**: The dialog logic seems fine, but I'll ensure the `pasteTargetDir` state is set *before* opening the dialog to avoid any race conditions (though React state updates are batched, explicit ordering is safer).

## 3. Verify Dependencies
- `pywin32` is installed (verified).

## Implementation Steps
1.  **Modify `crates/backend/api.py`**:
    - Implement `get_clipboard_content` with retry logic for `OpenClipboard`.
    - Add quote stripping for text path check.
2.  **Verify Frontend**: The frontend logic was recently updated and looks good, but I will review it one last time to ensure no subtle bugs.

No additional file changes needed for `main.py` or `App.tsx` as the issue is isolated to the paste logic.
