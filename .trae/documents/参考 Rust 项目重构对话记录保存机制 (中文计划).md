我将参考 Rust 项目 (`gemini-cli-desktop`) 的实现，重构 `qwencode5` 的对话记录保存机制，使其更加健壮和标准。

### 核心变更计划

目前 Python 版使用的是“全量快照”模式（每次更新都重写整个 JSON 文件），而 Rust 版使用的是**“追加日志” (Append-only Log)** 模式。我们将迁移到日志模式，这能有效防止程序崩溃导致的数据丢失，并提供更完整的操作审计。

#### 1. 数据存储结构重构
*   **弃用**: `data/conversations/<session_id>.json` (快照文件) 和 `data/conversations/index.json` (索引文件)。
*   **启用**: `data/projects/default/rpc-log-<timestamp>.log`。
    *   采用与 Rust 项目一致的文件命名和目录结构。
    *   文件内容为 **JSON Lines** 格式，每一行都是一个标准的 JSON-RPC 消息（请求或响应）。

#### 2. 修改 `session.py` (写入端)
*   **引入 `RpcLogger`**: 实现一个轻量级的日志记录器，负责将事件追加写入到日志文件中。
*   **记录用户消息**: 在 `send_message` 时，不再更新内存列表，而是直接向日志写入 `session/prompt` 事件。
*   **记录模型回复**: 在接收到后端输出时，实时将 `agent_message_chunk`、`tool_call` 等事件追加写入日志。
*   **移除**: 移除之前的 `_save_conversation` 和 `save_all_conversations` 函数，因为日志是实时写入的，无需手动保存。

#### 3. 重写 `search.py` (读取端)
*   **`get_recent_chats`**:
    *   不再读取 `index.json`。
    *   改为遍历 `data/projects/default/` 目录下的 `.log` 文件。
    *   读取每个文件的元数据（第一条消息作为标题，修改时间作为时间戳）来生成列表。
*   **`get_detailed_conversation`**:
    *   不再直接读取 JSON 对象。
    *   改为逐行读取 `.log` 文件。
    *   **重组逻辑**: 将分散的 `agent_message_chunk` 聚合成完整的 Assistant 消息，将 `tool_call` 和 `tool_result` 关联起来，还原出完整对话上下文。

### 预期效果
*   **数据零丢失**: 即使程序意外崩溃（如断电、强制关闭），已写入日志的最后一行数据（包括正在生成的回复）也会被保留。
*   **格式兼容**: 采用与 Rust 项目一致的日志格式，未来可能实现跨工具兼容。
*   **无需手动保存**: 彻底解决“关闭时未保存”的问题。

### 执行步骤
1.  修改 `session.py`，实现基于文件的日志记录。
2.  重写 `search.py`，实现基于日志文件的对话重组和列表查询。
3.  验证新机制下的对话保存和读取功能。
