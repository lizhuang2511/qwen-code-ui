I will modify `crates/session.py` to implement output buffering in the `read_stdout` function. This will reduce the frequency of UI updates (screen flickering) during code generation by batching text chunks and emitting them at a controlled rate (e.g., every 50ms) instead of on every token.

**Specific changes:**

1. In `crates/session.py`, inside `_start_readers` -> `read_stdout`:

   * Initialize `ui_buffer` list and `last_emit_time` timestamp.

   * Add a `flush_ui_buffer` helper function to emit accumulated text to the frontend.

   * Update the loop to append content to `ui_buffer` instead of emitting immediately.

   * Emit the buffer only when a time threshold (50ms) is exceeded or when specific events occur (like turn finish, error, or permission request).

   * Ensure the buffer is flushed before handling state-changing events to maintain correct message ordering.

