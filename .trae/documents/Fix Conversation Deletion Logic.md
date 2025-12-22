I will fix the issue where deleting a conversation record does not work. The issue is that the `delete_conversation` method in the backend API is currently empty.

Here is the plan:

1.  **Update `crates/search.py`**:
    -   Add a new function `delete_conversation(chat_id: str) -> bool`.
    -   This function will search for the conversation log file (pattern `rpc-log-{chat_id}.log`) across all project directories.
    -   If found, it will delete the file using `path.unlink()`.
    -   I will ensure **no `try-except` statements** are used in this new function, as requested.

2.  **Update `crates/backend/api.py`**:
    -   Modify the `delete_conversation` method in the `Api` class.
    -   First, call `session.kill_process(chat_id)` to terminate any active session associated with this conversation.
    -   Then, call the newly created `search.delete_conversation(chat_id)` to remove the log file.

This will ensure that when you click "Delete" in the UI, the backend actually removes the conversation file and stops any running process.
