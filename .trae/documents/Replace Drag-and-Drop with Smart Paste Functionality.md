# Remove Drag-and-Drop & Implement Smart Paste

## 1. Remove Drag-and-Drop Functionality
- **`d:\giteecode\qwencode5\main.py`**:
    - Remove `from webview.dom import DOMEventHandler`.
    - Remove `on_drop` handler and `bind` function.
    - Revert `create_window` to remove `easy_drag=False`.
    - Restore original startup logic (start ticker, etc.).
- **`d:\giteecode\qwencode5\crates\backend\api.py`**:
    - Remove `set_drag_target` method and `drag_target_dir` property.
- **`d:\giteecode\qwencode5\frontend\src\lib\api.ts` & `webApi.ts`**:
    - Remove `set_drag_target` definition and implementation.
- **`d:\giteecode\qwencode5\frontend\src\components\common\DirectoryPanel.tsx`**:
    - Remove `handleDrop`, `handleDragOver`.
    - Remove `useEffect` for setting drag target.
    - Remove `app:file-change` listener (unless needed for other things, but likely part of the drag drop feature).
    - Remove `onDragOver` and `onDrop` props from the container `div`.
- **`d:\giteecode\qwencode5\frontend\src\App.tsx`**:
    - Remove global `dragover` and `drop` event listeners.

## 2. Implement Backend Clipboard API
- **`d:\giteecode\qwencode5\crates\backend\api.py`**:
    - Add `get_clipboard_content()` method.
    - **Implementation Strategy**:
        - Use `win32clipboard` (since it's available and robust on Windows) to check for `CF_HDROP` (file list) first.
        - If `CF_HDROP` exists, return `{"type": "files", "content": [list_of_paths]}`.
        - If not, check for text/unicode text.
        - If text exists, check if the text string is a valid absolute path to an existing file/directory using `os.path.exists`.
            - If valid path: return `{"type": "files", "content": [path]}`.
            - If not path: return `{"type": "text", "content": text_string}`.
        - Handle errors gracefully (return empty/null).

## 3. Implement Frontend Paste Feature
- **`d:\giteecode\qwencode5\frontend\src\lib\api.ts` & `webApi.ts`**:
    - Add `get_clipboard_content()` to the interface.
- **`d:\giteecode\qwencode5\frontend\src\components\common\DirectoryPanel.tsx`**:
    - Import `Clipboard` icon from `lucide-react`.
    - Add a "Paste" button in the header (before `RefreshCw`).
    - **Button Handler (`handlePaste`)**:
        - Call `api.get_clipboard_content()`.
        - **Case 1: Files (`type === 'files'`)**:
            - Call `api.copy_files({ paths: content, target: workingDirectory })`.
            - Refresh directory.
            - Show success toast.
        - **Case 2: Text (`type === 'text'`)**:
            - Open a "New File from Clipboard" dialog (reuse `PasteJsonDialog` logic or create a simple prompt).
            - Default filename: First 10 chars of text (sanitized) + `.txt`.
            - Allow user to edit filename.
            - On confirm: Call `api.write_file_content({ path: workingDirectory + '/' + filename, content: text })`.
            - Refresh directory.

## 4. UI Components
- Create/Reuse a simple Dialog for the filename prompt if one doesn't exist (e.g., using `sonner` for simple prompts or a small `Dialog` component). I'll use a standard `Dialog` component for better UX.
