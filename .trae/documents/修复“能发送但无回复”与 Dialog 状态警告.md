## 选择与理由
- 采用方案 A（后端实现 REST 路由）：桌面 `pywebview` 环境中，前端当前已走 REST 发送路径，保留现状最小改动即可打通；事件仍通过后端广播（WS 或 WebView 桥）传回前端。

## 后端改动（REST 路由）
1. 在 `server/main.py` 新增：
   - `POST /api/start-session`：解析 `sessionId`、模型、后端类型等，调用现有 `start_session(...)`（与 WS 路由一致的处理）。
   - `POST /api/send-message`：解析 `sessionId`、消息文本等，调用现有 `send_message(...)`。
   - 使用 FastAPI/Pydantic 参数校验与条件分支，避免 `try/except`。
2. 确保调用链触发事件：会话与消息处理产生 `events.emit(event, payload)` → `event_bridge` → `broadcast`，从而推送到前端监听的事件名（例如 `ai-output-<id>`、`cli-io-<id>`）。

## 事件与日志埋点（便于定位问题）
- 统一使用 `logging`：`logger = logging.getLogger("app")`，`logger.setLevel(DEBUG)`，在关键路径记录结构化信息（不使用 `try/except`）。
- 埋点位置：
  - REST 入参：
    - `POST /api/start-session`：`logger.info("start-session", extra={"session_id": id, "backend": b, "model": m})`
    - `POST /api/send-message`：`logger.info("send-message", extra={"session_id": id, "size": len(msg)})`
  - WS 入口：`@app.websocket("/api/ws")` 收到命令时记录 `command` 与 `session_id`。
  - 事件桥 `event_bridge`：记录 `event` 名、`session_id`（若有）、`payload` 的关键字段摘要。
  - 广播 `ConnectionManager.broadcast`：记录当前连接数与事件名；对单连接发送失败进行移除与统计（条件分支，不用 `try/except`）。
  - 进程/适配器生命周期（已有 `[SESSION]` 日志）：补充必要字段以便关联到 `session_id`。
- 事件名约定：确保后端 `events.emit` 与前端监听一致，事件名包含会话 ID（如 `ai-output-<sanitizedId>`）。

## 前端保持现状与验证
- 保持 `frontend/src/hooks/useMessageHandler.ts` 中的 REST 调用不变。
- 确认 `frontend/vite.config.ts` 的代理：`/api`→`http://localhost:1858`，`/api/ws`→`ws://localhost:1858`。
- 验证流程：
  - REST 返回 2xx 后，终端应出现新的事件日志；前端应收到并渲染回复。
  - 若为 `pywebview` 环境，确认事件桥接仍生效（前端监听应收到事件）。

## 修复 Dialog 受控状态警告
- 在使用 `Dialog` 的组件（`SettingsDialog.tsx`、`AboutDialog.tsx`、`ConversationSearchDialog.tsx`）：
  - 保证 `open` 初始为布尔值（通常 `false`），并始终作为受控值传入；或移除 `open/onOpenChange` 改用 `defaultOpen` 以保持非受控。
- 在 `App.tsx` 确认 `isSettingsOpen` 初始化为布尔值，不以 `undefined` 开始。

## 交付与验证
- 新增两个 REST 路由且打通调用链；无 `try/except`。
- 全面埋点日志（REST、WS、事件桥、广播、生命周期）。
- 验证聊天发送后收到回复；终端日志可清晰看到触发链条。
