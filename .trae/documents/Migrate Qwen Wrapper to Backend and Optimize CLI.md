I will perform the following steps to migrate the Qwen wrapper functionality to the backend and optimize the CLI integration:

1. **Enhance** **`crates/cli_runner.py`**:

   * Update `resolve_qwen_executable` to include robust discovery logic (checking PowerShell, common paths) similar to the reference wrapper, ensuring the Qwen CLI is found even if not in PATH.

2. **Refactor** **`crates/qwen_adapter.py`**:

   * Rewrite `QwenProcess` to implement the persistent session model (ACP protocol) used in `QwenPersistentWrapper`.

   * **Initialization**: Launch the process with `--experimental-acp` and perform the JSON-RPC handshake (Initialize, Session/New) directly in `__init__`.

   * **Input Handling**: Implement `handle_input` to send `session/prompt` JSON-RPC requests to the persistent process.

   * **Output Handling**: Spawn a background thread to read the process `stdout`, forwarding the raw JSON-RPC lines to the session's output queue (which `session.py` consumes and `parsers/qwen.py` parses).

   * **Compliance**: Remove all `try-except` blocks, relying on explicit checks (`shutil.which`, `os.path.exists`, return codes) to handle errors.

3. **Create Test File** **`tests/test_qwen_backend.py`**:

   * Create a new test file to verify the backend CLI communication.

   * Implement a simple test case that initializes `QwenProcess`, sends a "1+1" query, and verifies that the response is received via the output queue.

4. **Verification**:

   * I will run the newly created test to ensure the refactored adapter works correctly.

