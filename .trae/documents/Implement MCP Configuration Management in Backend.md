I will implement the backend logic to read and update the `qwencodecli` configuration file for MCP settings, as requested.

### Plan: Update `crates/backend/api.py`

I will add two new methods to the `Api` class in `crates/backend/api.py`:

1.  **`get_mcp_config(self) -> Dict[str, Any]`**
    *   Target file: `~/.qwen/settings.json`.
    *   Logic:
        *   Expand the user path.
        *   Check if the file exists using `os.path.exists`.
        *   If it exists, read the file and parse it as JSON.
        *   Return the configuration (specifically the `mcpServers` section).
        *   If it doesn't exist, return a default empty configuration.

2.  **`save_mcp_config(self, params: Dict[str, Any]) -> bool`**
    *   Target file: `~/.qwen/settings.json`.
    *   Logic:
        *   Receive the new MCP configuration (the `mcpServers` object) from `params`.
        *   Check if the file exists.
        *   If it exists, read it to preserve other settings.
        *   If it doesn't exist, start with an empty dictionary.
        *   Update the `mcpServers` key with the new configuration.
        *   Ensure the directory (`~/.qwen`) exists.
        *   Write the updated dictionary back to the file in JSON format.
        *   Return `True` on success.

### Constraints
*   **No `try-except` blocks**: I will rely on explicit checks (like `os.path.exists`) and assume the file content is valid JSON if it exists (or let it fail if corrupted, adhering strictly to the "no try-except" rule).
*   **Language**: The code will be in Python, and I will continue to communicate in Chinese.

This implementation allows the frontend (or other callers) to manage the MCP configuration without the backend application itself managing the MCP processes, fulfilling the requirement that "the software merely reads qwencodecli's config and updates the settings file".
