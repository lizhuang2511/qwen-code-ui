## 目标
将现有基于 Tauri/HTTP 的前后端通信改造为 pywebview 的 JS↔Python 直连方式，保留现有 React 前端界面与业务逻辑，逐步替换后端调用与事件通道；在项目根目录新增 `crates`（Python 包）一比一镜像参考 Rust 后端目录结构，完成主要功能，并提供一个可启动的桌面主程序。

## 当前结构与关键调用
- 前端统一调用入口：`src/lib/api.ts`（Tauri `invoke` 与 Web `axios` 双栈）d:\giteecode\qwencode5\frontend\src\lib\api.ts:166
- Web HTTP 客户端与 WS：`src/lib/webApi.ts` d:\giteecode\qwencode5\frontend\src\lib\webApi.ts:35
- 事件抽象：`src/lib/listen.ts` d:\giteecode\qwencode5\frontend\src\lib\listen.ts:4
- 会话与流事件：`src/hooks/useConversationEvents.ts` d:\giteecode\qwencode5\frontend\src\hooks\useConversationEvents.ts:264
- 入口与会话启动：`src/App.tsx` d:\giteecode\qwencode5\frontend\src\App.tsx:365
- 参考 pywebview 用法：Python `backend/index.py` d:\giteecode\qwencode5\参考文件\pywebview-vite-react-tutorial-main\backend\index.py:9 与前端 `components/Ticker` d:\giteecode\qwencode5\参考文件\pywebview-vite-react-tutorial-main\frontend\src\components\Ticker\Ticker.tsx:8
- 参考业务后端功能（Rust crates）：`crates/backend/src/lib.rs` d:\giteecode\qwencode5\参考文件\gemini-cli-desktop-0.3.14\crates\backend\src\lib.rs:66

## 总体方案
- 保留前端路由与界面，新增 `pywebview` 适配层，使 `api.ts` 中的所有方法改为调用 `window.pywebview.api.<method>`，同时将事件监听改为 `window.pywebview` 注入的回调或自定义事件。
- 在项目根创建 `crates`（Python 包），子目录一比一镜像 Rust crates（`backend/ events/ filesystem/ projects/ rpc/ search/ session/ server/ tauri_app`），但以 `.py` 文件实现；核心模块提供与前端 `API` 接口一致的方法名。
- 用 `pywebview.create_window(..., js_api=Api())` 暴露 Python `Api` 类；在 Python 端通过 `webview.windows[0].evaluate_js(...)` 推送事件到前端。
- 禁止使用 try/except：Python 端使用条件判断、返回码、`assert` 与显式 `raise`，不在业务层捕获异常；前端保留已有 `toast` 错误提示。

## 前端改造
1) 新增适配层
- 新建 `src/lib/pywebviewApi.ts`：实现与 `API` 等价的对象，内部通过 `window.pywebview.api.<method>(args)` 调用。
- 修改 `src/lib/api.ts` 的 Proxy `get` 分支，在检测到 `window.pywebview` 时优先走 `pywebviewApi`，否则保留原逻辑；删除对 `axios`/Tauri 的硬依赖路径。
- 替换监听：`src/lib/listen.ts` 改为当存在 `window.pywebview` 时使用自定义事件或 `window.pywebview.state.<on>` 回调，保持签名一致。

2) 事件总线适配
- 在前端全局注入事件桥：开机时监听 `pywebviewready`，建立 `window.pywebview.state`，提供：`emit(event, payload)`、`on(event, cb)`、`off(event, cb)`。
- 将 `useConversationEvents.ts` 中使用的事件名与负载统一映射：
  - `cli-io-<id>` → Python 调用 `evaluate_js('window.pywebview.state.emit("cli-io-...", payload)')`
  - `ai-output-<id>`、`ai-thought-<id>`、`acp-session-update-<id>`、`acp-permission-request-<id>`、`ai-turn-finished-<id>` 同理；保持现有负载结构，减少前端改动量。

3) 保留 UI 交互
- `App.tsx` 的会话启动、消息发送、确认请求等原调用不变，仅 `api` 与 `listen` 的实现发生变化。
- Tauri 特有的菜单与窗口标题暂时降级（或通过 pywebview 的 fullscreen、文件对话等替代）；不影响核心会话流与文件系统浏览。

## Python 后端实现
1) 目录结构（镜像 Rust crates）
- `crates/backend/`：提供 `Api` 类，方法与前端 `API` 完全对齐：
  - `check_cli_installed`
  - `start_session(sessionId, workingDirectory, model, backendConfig, geminiAuth, llxprtConfig)`
  - `send_message(sessionId, message, conversationHistory, ...)`
  - `get_process_statuses` / `kill_process`
  - `send_tool_call_confirmation_response(sessionId, requestId, toolCallId, outcome)`
  - `execute_confirmed_command(command)`
  - `generate_conversation_title(message, model)`
  - 目录/文件读写、Git 信息、最近会话、搜索、项目增删改查等
- `crates/events/`：封装事件名与 `emit(event, payload)`（内部 `evaluate_js`）；统一序列化为 JSON 字符串后注入前端。
- `crates/session/`：会话管理（子进程/线程、缓冲、ID 映射）；集成 Gemini/Qwen/LLxprt CLI（使用 `subprocess`/`asyncio.create_subprocess*`）；解析 CLI 输出，按现有事件名推送。
- `crates/filesystem/`：实现目录与文件操作、递归遍历、读取二进制 base64、`get_canonical_path`。
- `crates/search/`：最近聊天、全文搜索、详细会话；初期可基于现有日志存储格式实现，若无现成存储，则先提供内存/文件型简单实现，后续迭代。
- `crates/projects/`：项目列表与元数据；与 `Projects.tsx` 的展示契合（返回结构参考 `webApi.ts`）。
- `crates/rpc/`：最小化 JSON-RPC 封装（构造 `session/update`、`session/prompt` 等消息），与 CLI 的交互保持一致格式。
- `crates/server/`：可空（不再需要 HTTP/WS）；如需兼容 Web 模式，可保留轻量占位。
- `crates/tauri_app/`：不实现；相关功能迁移到 `events/` 或丢弃。

2) 通信与事件映射
- Python `Api` 的每个方法直接返回结果到前端 Promise；流式/异步事件通过 `evaluate_js` 触发前端总线。
- 事件命名与负载严格遵循现有前端：
  - `cli-io-<conversationId>`：`{ type: "input"|"output", data }`
  - `ai-output-<id>`：文本块
  - `ai-thought-<id>`：思维块
  - `acp-session-update-<id>`：`{ sessionUpdate, toolCallId, kind, title, ... }`
  - `acp-permission-request-<id>`：`{ request_id, request: { toolCall, options, ... } }`
  - `ai-turn-finished-<id>`：布尔值

3) 依赖与约束
- 使用 `pywebview`、`subprocess`、`json`、`base64`、`pathlib`、`hashlib`、`sqlite3`（如需要持久化）；严格避免 `try/except`，出错直接 `raise` 或返回失败状态码与描述字符串。

## 启动与文件结构
- 新增 `main.py`（项目根）：
  - 构建前端：`pnpm -C frontend build`，入口指向 `frontend/dist/index.html`
  - 启动：`webview.create_window("App", entry, js_api=Api())`；注册周期性任务或后台监听线程（如需）。
- 保留前端开发模式：`pnpm -C frontend dev` 仅用于浏览器开发，不参与 pywebview 通信；桌面效果以 `python main.py` 为准。

## 具体改造清单
- 前端
  - 新建 `src/lib/pywebviewApi.ts`（方法与 `API` 同名）
  - 修改 `src/lib/api.ts`：检测 `window.pywebview` → 调用 `pywebviewApi`；保留错误提示逻辑。d:\giteecode\qwencode5\frontend\src\lib\api.ts:171
  - 修改 `src/lib/listen.ts`：注入 `window.pywebview.state.on/emit`。d:\giteecode\qwencode5\frontend\src\lib\listen.ts:4
  - 新建 `src/lib/pywebviewBridge.ts`：初始化 `state`、封装 `emit/on/off`、监听 `pywebviewready`。
- 后端（Python）
  - 新建 `crates/backend/api.py`：定义 `class Api` 暴露上述方法；内部调用其他模块并通过 `events.emit` 推送流事件。
  - 新建镜像目录与模块文件（`events.py`、`session.py`、`filesystem.py`、`search.py`、`projects.py`、`rpc.py` 等）。
  - 新建 `main.py`：加载 `frontend/dist/index.html`，启动窗口。

## 验证策略
- 用现有页面与流程进行端到端验证：
  - 启动会话与流式消息（`start_session` → 监听 `ai-output-*`）
  - 触发工具调用与确认（`acp-session-update-*`、`acp-permission-request-*`）
  - 文件系统浏览（`DirectoryPanel`）与文件读写
- 提供一个最小可运行路径：
  - `check_cli_installed`、`start_session`（伪造轻量输出流）、`send_message`（返回固定块）、事件推送（每秒 ticker）
  - 确保不使用 `try/except`，前端 `toast` 能显示错误。

## 迭代与扩展
- 第一阶段：完成 API 适配与最小事件桥、启动桌面应用；
- 第二阶段：完善 CLI 交互与 ACP 事件完整性（严格负载结构）；
- 第三阶段：补齐项目/搜索/持久化与菜单等非核心功能。

## 风险与应对
- 事件时序与前端监听 race：保持 `useConversationEvents` 先注册监听再启动会话，Python 端延迟首个块 100ms。
- 复杂 CLI 流程：逐步对齐，先保证核心文本流与工具确认。
- Tauri 专有能力：以 pywebview 可用替代降级；必要时在前端分支处理。

## 交付物
- 可运行的 `python main.py` 启动桌面应用（加载 `frontend/dist/index.html`）
- 新的前端适配层与事件桥文件
- `crates` Python 包一比一子目录与方法骨架，并实现核心功能
- 文档：启动步骤与开发说明
