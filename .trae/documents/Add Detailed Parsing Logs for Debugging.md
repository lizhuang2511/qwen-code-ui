Based on the logs and user feedback, there's still an issue where the frontend state gets stuck because the CLI output (especially tool completion) isn't fully processed or recognized. The user wants "more process printing" to debug.

I will add more granular logging to `crates/session.py` to trace exactly what messages are being parsed and how `parse_qwen_line` is interpreting them. This will help confirm if the `tool_call_update` messages are even reaching the event logic.

1.  **Enhance Logging in `crates/session.py`**:
    *   In `_start_readers` -> `read_stdout`, add a log before calling `parse_qwen_line` to show the raw line length/content (truncated).
    *   Inside the loop iterating `parsed_list`, add a log showing the `status` of each parsed message.
    *   Specifically log when `tool_call_update` is encountered, printing its `status` (e.g., "completed", "in_progress") and `toolCallId`.
    *   Log when `ai-turn-finished` is emitted.

This additional visibility will confirm if the CLI is sending the completion signal and if `session.py` is correctly identifying it to trigger the UI update.