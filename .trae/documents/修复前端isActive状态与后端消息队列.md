# 修复前端交互与后端消息竞争计划

## 问题诊断
1.  **前端 UI 被强制禁用**:
    *   在 `frontend/src/App.tsx` 中，`currentConversation` 的计算逻辑显式地将 `isActive` 属性覆盖为 `undefined`。
    *   `MessageInputBar` 组件依赖 `isConversationActive` 属性（来自 `isActive`）来决定是否启用输入框。由于该值为 `undefined`，输入框始终处于不可用状态。

2.  **后端消息竞争 (Race Condition)**:
    *   前端在调用 `start_session` 后立即调用 `send_message`。
    *   后端的 `start_session` 是异步初始化的（握手过程在线程中运行）。
    *   如果在握手完成前 `send_message` 到达，消息可能会被丢弃（因为 `proc` 尚未准备好）或干扰握手过程。

## 修复步骤

### 1. 修复前端 `App.tsx`
*   **目标**: 移除 `isActive: undefined` 的覆盖逻辑，使其正确反映从后端获取的 `processStatus`。
*   **文件**: `d:\giteecode\qwencode5\frontend\src\App.tsx`
*   **修改**: 简化 `currentConversation` 的 `useMemo` 逻辑，直接返回 `currentConversationWithStatus`。

### 2. 增强后端 `crates/session.py`
*   **目标**: 实现消息队列机制，确保在会话完全就绪前收到的消息不会丢失。
*   **文件**: `d:\giteecode\qwencode5\crates\session.py`
*   **修改**:
    *   在 `_sessions` 状态中增加 `ready` 标志（默认为 False）和 `msg_queue` 列表。
    *   修改 `send_message`：如果 `ready` 为 False，将消息加入队列。
    *   修改 `handshake` 流程：在发送 `ready` 事件前，将 `ready` 设为 True，并按顺序处理 `msg_queue` 中的所有消息。

## 验证
1.  应用前端修改后，用户需重新构建或刷新前端（如果是开发模式）。
2.  应用后端修改后，需重启后端服务。
3.  **预期结果**:
    *   新建会话后，输入框应立即变为可用状态。
    *   发送的第一条消息应能被后端正确处理并收到回复，不会因初始化延迟而丢失。
