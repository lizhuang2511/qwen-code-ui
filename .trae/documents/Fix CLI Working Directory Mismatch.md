I will fix the issue where the CLI runs in the wrong directory (source folder) instead of the selected project folder.

1.  **Modify `crates/qwen_adapter.py`**:
    *   Update `QwenProcess.__init__` to accept an optional `cwd` argument.
    *   Store `self.cwd` in the instance.
    *   In `_start_process`, pass `cwd=self.cwd` to `subprocess.Popen`.
    *   In `_perform_handshake`, use `self.cwd` (or default to `os.getcwd()`) when sending the `session/new` request.

2.  **Modify `crates/session.py`**:
    *   Update the `start_session` function to pass the `wd` (working directory) variable when creating the `QwenProcess` instance.

This ensures the CLI process is launched in the correct directory and the ACP session is initialized with the correct workspace path, solving the issue of files being created in the wrong location (and triggering unintended backend reloads).