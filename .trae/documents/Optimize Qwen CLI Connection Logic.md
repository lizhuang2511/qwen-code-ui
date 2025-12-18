I will optimize the connection logic between the project and `qwencli` by integrating the logic from the provided `QwenPythonWrapper`.

### Plan

1.  **Enhance Qwen Parser (`crates/parsers/qwen.py`)**
    - Update `parse_line` to robustly handle JSON output using the `json` module, falling back to the existing regex method only if JSON parsing fails. This ensures compatibility with `stream-json` format.

2.  **Create Qwen Adapter (`crates/qwen_adapter.py`)**
    - Implement a `QwenProcess` class that mimics the `subprocess.Popen` interface (stdin, stdout, stderr) required by `session.py`.
    - This class will:
        - Manage credential checking (`~/.qwen/oauth_creds.json`) as per the reference code.
        - Maintain conversation history (state) internally, as the CLI is stateless.
        - Handle `stdin.write` by constructing the full prompt and executing the `qwen` CLI using `stream-json` format.
        - Stream the CLI output to a queue that acts as `stdout` for the session reader.

3.  **Update Session Management (`crates/session.py`)**
    - Import `QwenProcess` from `crates/qwen_adapter.py`.
    - Modify `start_session` to instantiate `QwenProcess` instead of `subprocess.Popen` when the backend is `qwen`.
    - Update the `handshake` function to prioritize `QwenProcess.check_credentials()` for authentication, while preserving the existing API key check as a fallback.

### Verification
- I will verify the changes by checking if `crates/parsers/qwen.py` correctly parses JSON lines.
- I will verify that `crates/session.py` can successfully "start" a session with the new adapter (mocking the CLI if necessary for the test environment).
