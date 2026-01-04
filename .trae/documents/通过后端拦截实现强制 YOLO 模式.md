搜索结果未发现关于 Qwen CLI YOLO 模式的具体命令行参数文档，这表明该功能可能是内部实现或未公开。

为了彻底解决“仍然需要批准”的问题，我将采取更稳健的**后端拦截策略**。与其依赖底层 CLI 工具支持 `--yolo` 参数，不如直接在 Python 后端拦截权限请求并自动批准。

### 修复计划

我将修改 `crates/session.py` 文件，实现以下逻辑：

1.  **保存 YOLO 状态**：
    在 `start_session` 函数中，将从配置中读取到的 `yolo` 状态保存到会话对象 `_sessions[session_id]` 中。

2.  **拦截并自动批准**：
    在 `_start_readers` 函数的输出监听循环中，当检测到 `permission_request`（权限请求）时：
    *   检查当前会话是否开启了 YOLO 模式。
    *   如果开启：
        *   **不发送** `acp-permission-request` 事件给前端（从而不弹出窗口）。
        *   直接调用 `handle_permission_response` 函数，模拟用户点击了“批准”，向底层 CLI 发送 `proceed` 响应。
    *   如果未开启：保持原有逻辑，发送请求给前端等待用户确认。

这种方法不依赖于底层 CLI 是否支持特定参数，能确保只要前端开启了 YOLO 模式，所有权限请求都会被自动通过。
