I will add Chinese logging statements to the frontend and backend to trace the "allow" permission flow and subsequent tool execution updates.

**Frontend Changes**

1. **File:** `frontend/src/hooks/useToolCallConfirmation.ts`

   * **Action:** Add `console.log("前端: 用户点击允许，准备发送请求");` in `handleConfirmToolCall` before sending the request.
2. **File:** `frontend/src/hooks/useConversationEvents.ts`

   * **Action:** Add `console.log("前端: 收到后端工具调用更新:", update);` in the `acp-session-update` event listener.

**Backend Changes**

1. **File:** `crates/session.py`

   * **Action:** In `handle_permission_response`:

     * Add `print(f"[SESSION] 后端: 收到权限响应: id={tool_call_id} outcome={outcome}")` at the start.

     * Add `print(f"[SESSION] 后端: 开始处理权限响应, 准备发送到适配器: req_id={req_id}")` before `proc.send_response`.

     * Add `print(f"[SESSION] 后端: 已完成发送响应到适配器")` after `proc.send_response`.

   * **Action:** In `_start_readers`:

     * Add `print(f"[SESSION] 后端: 已发送工具调用更新到前端: toolCallId={tool_call_id} status={tool_status}")` when handling `tool_call_update` before emitting the event.

