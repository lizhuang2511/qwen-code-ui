I will implement chat history saving in `qwencode5` by modifying `session.py` to persist conversation data to disk, aligning with the structure expected by `search.py`.

### Plan

1.  **Enhance `session.py` to support History Management**:
    -   Import `datetime` and `pathlib` for file handling.
    -   Import `search` to access `CONV_DIR` and `INDEX_FILE` paths (or redefine them to avoid circular imports if needed).
    -   Add a `save_conversation(session_id)` helper function that writes the current session's history to `data/conversations/<session_id>.json`.
    -   Add a `update_index(session_id, title, ...)` helper function to update `data/conversations/index.json`.

2.  **Integrate persistence into Session Lifecycle**:
    -   **Start Session**:
        -   In `start_session`, initialize a `history` list in the session state.
        -   Create the conversation file immediately.
        -   Add a new entry to `index.json`.
    -   **User Messages**:
        -   In `send_message`, append the user's message to the `history` list.
        -   Update the conversation file and `index.json` (message count, last activity).
    -   **Assistant Messages (Qwen Backend)**:
        -   In `_start_readers`, buffer incoming tokens/lines.
        -   When `turn_finished` is detected, append the complete assistant message to `history`.
        -   Trigger a save to disk.
    -   **Generic Backend**:
        -   Append stdout lines to history as they arrive (or buffer them).

3.  **Data Format**:
    -   Use the format expected by `search.py`:
        ```json
        {
          "id": "session_id",
          "title": "Title",
          "started_at_iso": "...",
          "messages": [
            {
              "sender": "user",
              "parts": [{"type": "text", "text": "..."}]
            },
            {
              "sender": "model",
              "parts": [{"type": "text", "text": "..."}]
            }
          ]
        }
        ```

4.  **Verification**:
    -   Start a session and send a message.
    -   Verify that `data/conversations/index.json` is updated.
    -   Verify that `data/conversations/<session_id>.json` contains the messages.
    -   Verify that `search.py` can find the saved chat.

This approach "refers" to `gemini-cli-desktop`'s feature set (persistent history, search capability) but adapts the implementation to `qwencode5`'s existing Python architecture and `search.py` stub.
