Based on my analysis of the Rust codebase (`crates/backend/src/session/mod.rs`) and successful verification with `test_acp.py`, the key to optimizing speed is **Persistence**.

**Why it's slow now:**
Currently, the Python wrapper starts a *new* `qwen` process for every query. This incurs a massive "Cold Start" penalty (approx. 85s) each time for model loading, authentication, and environment setup.

**How Rust makes it fast:**
The Rust implementation starts the `qwen` process **once** and keeps it running as a background service. It uses the **Agent Control Protocol (ACP)** over standard input/output (JSON-RPC) to send multiple requests to the same running process.

**Plan to Optimize:**
I will refactor `qwen_python_wrapper.py` to implement this "Persistent Session" pattern:

1.  **Create `PersistentQwenWrapper` Class**:
    *   Launches `qwen --experimental-acp` in the background.
    *   Implements the ACP handshake: `initialize` -> `session/new`.
    *   Maintains the process handle and pipes.

2.  **Implement JSON-RPC Communication**:
    *   Send requests (`session/prompt`) as JSON lines.
    *   Read responses (`session/update`) continuously to support streaming.
    *   Handle camelCase parameter requirements (as discovered in my research).

3.  **Update Test Script**:
    *   Modify `流式输出测试.py` to initialize the wrapper once.
    *   Run multiple queries to demonstrate that subsequent requests are near-instant (< 1s).

This approach will match the performance of the Rust implementation.