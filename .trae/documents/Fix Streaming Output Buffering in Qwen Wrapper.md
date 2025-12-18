The issue "Stream output stuck" is caused by **output buffering** between the `qwen` CLI and the Python wrapper.

**Analysis:**

1. **Node.js Buffering**: The `qwen` CLI is likely a Node.js application. When Node.js detects its `stdout` is a pipe (not a TTY), it defaults to block buffering (waiting until 8KB of data is accumulated before sending).
2. **Python Buffering**: The `subprocess.Popen` call uses `text=True` and `bufsize=1` (line buffering). While `bufsize=1` is intended to reduce buffering, the `text=True` wrapper (`TextIOWrapper`) can sometimes wait for more data to complete decoding, causing delays.

**Proposed Solution:**
I will modify `qwen_python_wrapper.py` to:

1. **Disable Python-side buffering**: Switch `subprocess.Popen` to binary mode (`text=False`) with `bufsize=0` (unbuffered).
2. **Handle Decoding Manually**: Use `codecs.getincrementaldecoder("utf-8")` to decode the byte stream in real-time, preventing issues with multi-byte characters split across reads.
3. **Encourage CLI Flushing**: Add environment variables `FORCE_COLOR=1` (tricks some Node apps into TTY mode) and `PYTHONUNBUFFERED=1` (if it happens to be Python) to the subprocess.

**Steps:**

1. Edit `d:/giteecode/qwencode5/参考文件/Python-wrapper-qwen-cli-main/qwen_python_wrapper.py`:

   * Add `import codecs`.

   * Update `流式查询` method with the improved unbuffered reading logic.
2. Run `流式输出测试.py` to verify the fix.

