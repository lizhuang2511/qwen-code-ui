## 前端参数映射
- 触发入口：`handleNewDiscussion → startNewConversation → api.start_session(...)`：`frontend/src/pages/ProjectDetail.tsx:109-138`、`frontend/src/App.tsx:371-378`。
- Qwen 模式参数：`backend:"qwen"`，`backendConfig:{ api_key, base_url(默认 https://openrouter.ai/api/v1), model }`：`frontend/src/App.tsx:300-308`。
- 进度事件监听：`listen('session-progress-<id>')`，初始种子为 `5%`：`frontend/src/hooks/useSessionProgress.ts:86-93`。

## 测试目标
- 在不依赖真实 UI 和外网的情况下，基于前端的参数形态，编写 pytest 用例来验证：
  - 后端 `Api.start_session` 在 `backend=="qwen"` 时，会按 `backendConfig` 构造一次 HTTP 调用（模拟 OpenRouter `/v1/chat/completions`）。
  - HTTP 调用携带正确的 Header（`Authorization: Bearer <api_key>`、`Content-Type: application/json`）与 Body（至少包含 `model` 和一个初始消息）。
  - 成功后派发一次 `session-progress-<sessionId>` 事件，`stage: Ready`、`progress_percent: 100`，用于把前端进度从 5% 推进。

## 测试设计
- 目录：新建 `test/` 文件夹，添加两个测试文件：
  1) `test/test_qwen_handshake.py`
   - 注入 `FakeWebView`：向 `sys.modules['webview']` 写入一个对象，暴露 `windows=[FakeWindow]`，其 `evaluate_js` 会把事件名与 `detail` JSON 记录下来。
   - 使用 `monkeypatch` 替换后端里使用的 `requests.post`（或内部 HTTP 客户端方法），返回伪成功响应（200 + 最小 JSON）。
   - 调用 `Api().start_session({ sessionId:"t-1", workingDirectory:".", backend:"qwen", backendConfig:{ api_key:"sk-xxx", base_url:"https://openrouter.ai/api/v1", model:"qwen-2.5-coder" } })`。
   - 断言：
     - 被调用的 URL 形如 `https://openrouter.ai/api/v1/chat/completions`（或实现中的等价路径）。
     - Header 含 `Authorization: Bearer sk-xxx`，`Content-Type: application/json`。
     - Body 含 `model: qwen-2.5-coder` 与一条初始 `messages`。
     - `evaluate_js` 记录到 `session-progress-t-1` 事件，`progress_percent==100`、`stage=="Ready"`。
  2) `test/test_event_payload_shape.py`
   - 针对派发的 `detail`，校验结构符合前端 `SessionProgressPayload`（`stage/message/progress_percent/details` 四字段），字段值类型正确，百分比单调递增（若实现为多阶段）。

## 辅助桩要求
- 为了满足测试，我们会在后端实现时：
  - 抽象一个 HTTP 调用函数（如 `qwen_post(base_url, api_key, payload)`），方便单元测试用 `monkeypatch` 劫持。
  - 统一的事件派发函数 `emit_session_progress(session_id, payload)`，方便测试记录。
- 代码遵循“禁止使用 try/except”，通过参数校验与早返回保证健壮性。

## 执行步骤
1) 新建 `test/` 目录与上述两个测试文件，使用 `pytest` 运行：`pytest -q`。
2) 首次运行预期失败（后端尚未实现），随后我们据此补齐后端：
   - 在 `backend/api.py` 实现 `start_session` 的 Qwen 分支：构造一次握手 HTTP 调用，并在成功后派发 `Ready(100%)` 事件；必要时补充 `send_message`。
   - 提供可注入的 HTTP 层与事件派发层，满足测试的劫持与断言。
3) 反复运行测试直至通过，再验证 UI 点击“新讨论”时进度不再停留在 `5%`。

## 交付物
- `test/test_qwen_handshake.py`、`test/test_event_payload_shape.py` 两个 pytest 用例文件。
- 后端实现将按测试约束补齐（下一步执行），不引入 `try/except`。