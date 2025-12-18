# 修复 WebSocket 连接断开及交互问题计划

## 问题分析
1.  **WebSocketDisconnect 异常**: `server/main.py` 中的 `websocket_endpoint` 在发送初始状态后进入死循环等待 `receive_text()`，但未处理客户端断开连接的异常，也未处理接收到的任何消息。
2.  **对话输入框不显示**: 前端通常依赖后端发送的“会话已就绪”或类似事件来激活 UI。当前的 `crates/events.py` 错误地使用了 `pywebview.windows[0]` 来发送事件（这是为桌面应用设计的），而不是通过 WebSocket 发送给网页前端。因此，前端从未收到初始化完成的信号。
3.  **架构不匹配**: `crates` 库使用多线程 (`threading`) 和 `pywebview`，而 `server` 使用异步 (`asyncio`) 和 `FastAPI`。需要建立一个适配层来桥接这两者。

## 实施计划

### 1. 重构事件系统 (`crates/events.py`)
将 `events.py` 从 `pywebview` 解耦，使其支持自定义的事件回调。这样 `server` 可以注册一个回调函数，将事件转发给 WebSocket。

*   **修改**: 移除 `import webview`。
*   **新增**: 添加 `set_event_handler(handler)` 函数和全局变量，用于存储回调。
*   **逻辑**: `emit` 函数优先调用注册的回调，如果未注册则保留原有逻辑或打印日志。

### 2. 实现 WebSocket 通讯桥接 (`server/main.py`)
在 FastAPI 服务中实现消息的双向转发：从 WebSocket 接收指令调用 `crates`，从 `crates` 接收事件发送回 WebSocket。

*   **事件转发**:
    *   在 `websocket_endpoint` 中定义一个回调函数，该函数通过 `asyncio` 线程安全的方法（如 `loop.call_soon_threadsafe`）将事件放入队列或直接发送给 WebSocket。
    *   使用 `crates.events.set_event_handler` 注册此回调。
*   **指令处理**:
    *   循环接收 WebSocket 消息 (`receive_json`)。
    *   根据消息类型（如 `start-session`, `input` 等）调用 `crates.session.start_session` 或 `crates.session.send_message`。
*   **异常处理**:
    *   处理 `WebSocketDisconnect`，在连接断开时清理资源（如调用 `session.kill_process`）。*注意：虽然您禁止使用 try-except，但 WebSocketDisconnect 是 Starlette/FastAPI 控制连接生命周期的标准异常，我们需要在循环外层妥善处理它以避免报错堆栈，或者将其封装在迭代器中。*

### 3. 验证
*   启动服务器。
*   连接前端，观察控制台是否收到 `session-progress` 和 `ready` 事件。
*   确认输入框出现，并能进行对话交互。

## 下一步
确认计划后，我将修改 `crates/events.py` 和 `server/main.py`。
