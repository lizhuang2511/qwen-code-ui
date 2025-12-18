## 当前通讯方式概览
- 桌面→Web：`main.py:29-43` 中的 `get_entry()` 启动/检查前端 Dev Server（默认 `http://localhost:1420`），窗口用 `webview.create_window("App", entry, js_api=Api())` 加载该地址并注入 Python `Api`。
- JS→Python：前端通过 `window.pywebview.api` 调用（代理层在 `frontend/src/lib/pywebviewApi.ts:1-22`），方法由 `crates/backend/api.py:10-131` 的 `Api` 提供。
- Python→JS：`main.py:46-61` 定时使用 `w.evaluate_js` 触发 `CustomEvent`，前端用 `frontend/src/lib/pywebviewBridge.ts:1-13` 通过 `window.addEventListener` 监听。
- Web 模式（浏览器端）：REST 与 WebSocket 在 `frontend/src/lib/webApi.ts:1-507`，与桌面模式 API 命名镜像；桌面模式通过 `api.ts:171-196` 动态选择 Pywebview/Tauri/Web 实现。

## 与文档的对应关系
- 你提到的文档片段（`…后端通讯方式分析文档编写计划.md#L55-59`）当前文件为 1-49 行；对应内容是“事件与通讯 / 传输层镜像”。可参照：
  - Web 传输与事件：`frontend/src/lib/webApi.ts:324-470`
  - 桌面事件桥：`frontend/src/lib/pywebviewBridge.ts:1-13`
  - 桌面命令镜像（Python Api）：`crates/backend/api.py:10-131`

## 保留“桌面模式调用 Web 模式”的方法
- 保留 `main.py:29-43` 的实现：优先使用 `FRONTEND_DEV_URL`，否则默认 `http://localhost:1420`；如果端口不可用，自动启动 `pnpm -C frontend run dev` 并轮询到上线。
- 当 `FRONTEND_DEV=1` 时开启 `pywebview` 的 `debug` 日志（`main.py:67-68`）。此方法不依赖后端 Web 服务，直接复用前端 Dev Server。

## Python 实现核查（已满足）
- 核查 `Api` 注入：`main.py:66` 的 `js_api=Api()` 取自 `crates/backend/api.py`（`main.py:9-16` 先把 `crates` 加入 `sys.path`，导入顺序保证用的是 `crates/backend` 版本）。
- 可用能力：会话控制、消息发送、进程状态、文件系统读写、项目/会话检索等，均在 `crates/backend/api.py:10-131` 映射，前端通过 `pywebviewApi` 直接调用。
- 事件桥：`evaluate_js` 触发的 `ticker` 示例已运行，前端监听在 `listen.ts:1-18` 会优先走 Pywebview 桥。

## 建议的轻量优化（确认后实施）
- 入口选择逻辑优化：当未设置 `FRONTEND_DEV` 时优先使用本地构建产物 `frontend/dist/index.html`（`main.py:18-27` 已有查找函数），否则走 Dev Server；确保开发/生产两种形态都可运行。
- Dev Server 健康检查替换：用 `subprocess` 调用 `node`/`pnpm` 保持现状，减少对系统 `curl` 的依赖；轮询仍用返回码判断，不引入 `try/except`。
- 能力自检：启动前做一次 `hasattr(Api, "start_session")` 等方法存在性检查，并在前端用 `pywebviewApi` 的错误提示统一处理，避免静态不一致。
- 文档同步：在 `…后端通讯方式分析文档编写计划.md` 中补充 Pywebview 桥接与 Dev Server 嵌入的说明，标注与 Web 模式的镜像关系与事件名称一致性。

## 验证步骤（确认后执行）
- 前端依赖：`pnpm -C frontend install` 并确保 `node`/`pnpm` 可用。
- 启动桌面：`python main.py`；首次会自动 `build` 并拉起 `dev`，窗口载入 `http://localhost:1420`。
- 功能验证：
  - 在前端调用 `api.check_cli_installed()`、`api.start_session()`，观察 Python 端日志与 UI。
  - 观察 `ticker` 事件是否每秒触发；在控制台验证 `window.addEventListener("ticker", ...)` 能收到负载。

请确认以上优化方向；收到确认后我会按上述方案调整入口选择逻辑、进行能力自检，并补充文档说明。