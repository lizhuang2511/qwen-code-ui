Based on the analysis of the logs and the codebase, the issue is that the `QwenAdapter` and the Qwen parser are failing to correctly parse the JSON output from the Qwen CLI. The CLI is returning the response in a `result` field or a nested `message.content` list, but the current code only looks for specific fields like `content` (as a string) or `message` (as a string). This causes the adapter to miss the response ("No response content captured"), failing to update the conversation history and potentially causing the "rendering unsuccessful" issue on the frontend.

Here is the plan to fix this:

1.  **Update `crates/parsers/qwen.py`**:
    *   Modify `parse_line` to check for the `result` field in the JSON object.
    *   Improve handling of `message` field to support it being a dictionary containing a `content` list (which is a common format for rich text/multimodal messages).
    *   Enhance `_extract_text_from_dict` to be more robust in extracting text from various JSON structures.

2.  **Update `crates/qwen_adapter.py`**:
    *   Update the `read_stdout` method in `QwenProcess` to use the same improved parsing logic.
    *   Specifically add support for extracting content from the `result` field and `message.content` list.
    *   Add comprehensive logging to print the keys of parsed JSON objects to help with future debugging.
    *   Ensure that even if partial content is found, it is accumulated correctly into `full_response`.

3.  **Verification**:
    *   The fix will be verified by the user running the system again. The logs should show "Full response captured" instead of "No response content captured", and the "rendering" should succeed as the `ai-output` events will contain the correct text.

This plan directly addresses the "long response time" (which might be a symptom of waiting or retrying due to missing response) and "rendering unsuccessful" (due to missing output) issues.
