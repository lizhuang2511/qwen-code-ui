## 现状诊断
- 白屏与报错来源：业务代码直接访问 `window.__TAURI_OS_PLUGIN_INTERNALS__.platform`，在纯 Web/非注入场景为 `undefined`，导致脚本中断。
- 项目中已使用 `@tauri-apps/plugin-os` 的 `platform()`（如 `frontend/src/App.tsx:46`），这是正确方式；但仍存在对内部全局的直接访问（`Ff()`）。
- 需求：学习 `d:\giteecode\qwencode5\参考文件\pywebview-vite-react-tutorial-main` 与官方文档，改为使用 pywebview 作为桌面宿主。

## 目标架构
- 桌面宿主：用 Python `pywebview` 创建窗口、加载前端页面、进行 JS ↔ Python 通信。
- 前端保持 Vite + React，不再依赖 Tauri 全局与插件；平台判定与原生交互通过 pywebview 的 `window.pywebview.api`。
- 开发模式：`pnpm run dev` 提供 `http://localhost:5173`，pywebview 载入该地址。
- 生产模式：pywebview 加载本地 `frontend/dist/index.html`（使用 `file://` URI）。

## 后端（Python）实现
- 在仓库根或 `backend/` 下新增入口 `main.py`：
  - `webview.create_window(title, url)` 加载前端页面（开发加载 `http://localhost:5173`；生产加载 `file:///.../frontend/dist/index.html`）。
  - 定义 `Api` 类暴露方法（如 `platform()`、配置读写等），通过 `js_api=Api()` 注入。
  - 使用 `webview.start()` 启动 GUI 消息循环，可通过传入函数对窗口执行初始化（如 `toggle_fullscreen()`、`evaluate_js()`）。
- 参考路径：`d:\giteecode\qwencode5\参考文件\pywebview-vite-react-tutorial-main\backend\index.py` 与官方文档示例（窗口对象、事件、通信）。

## 前端改造
- 新增 `frontend/src/lib/runtime.ts` 封装运行时检测与平台获取：
  - `isPywebview()`：检测 `window.pywebview` 是否存在。
  - `getPlatform()`：优先调用 `window.pywebview.api.platform()`；否则降级为 `navigator.userAgentData?.platform || navigator.platform`。
- 替换错误实现：移除 `Ff()` 对 `window.__TAURI_OS_PLUGIN_INTERNALS__` 的访问，改为调用 `getPlatform()`。
- 统一调用点调整为异步：
  - `frontend/src/App.tsx:585` 附近的平台初始化使用 `await getPlatform()`，并设置 `document.body.classList.add(
    
      os-<platform>
    
  )`。
  - `frontend/src/hooks/useTauriMenu.ts:21` 与 `useTauriRustMenu.ts:31` 等涉及 Tauri 菜单的逻辑改为前端内置菜单或条件禁用（pywebview 不提供原生 AppMenu）。
  - `frontend/src/components/layout/CustomTitleBar.tsx:67` 使用 `await getPlatform()` 控制标题栏显示；保留 Web/Windows 的自定义标题栏策略。
- 若存在 `@tauri-apps/api` 的 `invoke` 调用，新增轻量适配层：
  - 若 `isPywebview()` 为真，使用 `window.pywebview.api.<method>(...)`；否则维持 Web 降级实现或直接使用前端逻辑。

## 构建与运行流程
- 开发：
  - 启动前端 `pnpm run dev`（端口如 `5173`）。
  - 运行 Python：`python main.py` 创建 pywebview 窗口加载 `http://localhost:5173`。
- 生产：
  - 构建前端：`pnpm run build`。
  - Python 端解析 `frontend/dist/index.html` 绝对路径，构造 `file://` URI 并加载。

## 验证
- 打开 DevTools（前端）检查：不再出现 `Cannot read properties of undefined (reading 'platform')`。
- 页面正常渲染，`document.body` 包含 `os-windows`/`os-macos`/`os-linux` 或 `os-web` 类名。
- JS ↔ Python：在前端调用 `window.pywebview.api.platform()` 返回期望值；在后端收到调用并返回。
- 事件：使用 `window.events.shown`、`closing` 验证窗口事件订阅与触发。

## 兼容与风险
- 原 Tauri 菜单与插件能力需要前端替代或后端 Python 实现（文件系统、进程等可通过 Python 提供 API）。
- 代码中禁止使用 `try/except`，通过显式环境分支与 API 存在性检测避免异常分支。
- 渐进迁移：先保证不白屏与关键路径可用，再逐步替换剩余 Tauri 交互点。

## 下一步改动清单（落地到代码）
- 新增 `main.py`（或 `backend/main.py`）实现 pywebview 启动与 `Api` 类。
- 新增 `frontend/src/lib/runtime.ts` 并在 `App.tsx`、`CustomTitleBar.tsx`、`useTauriMenu.ts`、`useTauriRustMenu.ts` 引入。
- 删除/替换 `Ff()` 中对 `window.__TAURI_OS_PLUGIN_INTERNALS__` 的访问；统一为 `getPlatform()`。
- 为生产模式解析并加载 `frontend/dist/index.html` 的 `file://` 路径。
