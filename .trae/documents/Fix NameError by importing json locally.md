**修复调试日志并验证文件处理架构**

经过分析 Rust 参考代码 (`gemini-cli-desktop`) 和当前 Python 代码，我确认了以下几点：
1.  **架构确认**：Rust 实现中确实将 `client_capabilities.fs` (文件系统能力) 显式设为 `false`。这意味着**Agent (Qwen CLI) 必须自行处理文件读写**，后端不应干预。当前的 Python 实现 (`qwen_adapter.py`) 配置与此完全一致，符合您的要求。
2.  **问题定位**：目前工具调用返回 `failed` 且没有详细原因，是因为我之前添加的错误日志代码中遗漏了 `import json`，导致抛出 `NameError` 掩盖了真正的 Qwen CLI 错误信息。

**执行计划：**

1.  **修复 `crates/session.py`**：
    *   在 `_start_readers` 函数内部的 `read_stdout` 线程函数中添加 `import json`，解决 `NameError`。
    *   这将使后端能够正确打印 Qwen CLI 返回的详细错误 JSON，从而确定是权限不足、路径错误还是其他原因。

2.  **优化建议 (待错误信息确认后)**：
    *   如果日志显示 "Permission denied"，则证实需要管理员权限。
    *   Qwen CLI 的启动参数目前是标准的。如果需要管理员权限，建议您以管理员身份启动 Trae/终端，因为 Python 脚本很难在不弹窗的情况下自动提升子进程权限。

我将立即修复代码，以便我们能看到真正的错误信息。