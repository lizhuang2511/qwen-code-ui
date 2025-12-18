## 问题分析
- 运行时在 `window.__TAURI_OS_PLUGIN_INTERNALS__.platform` 处抛错，脚本中断导致页面空白。
- 该全局变量是 Tauri v2 OS 插件的内部桥接标识，并不保证在业务代码中可用；在纯 Web 环境或配置关闭全局注入时会为 `undefined`。
- 项目当前配置 `tauri.conf.json` 中 `app.withGlobalTauri: false`，不暴露 `window.__TAURI__` 全局，插件需通过模块 API 使用。
- 前端源码已正确通过 `@tauri-apps/plugin-os` 引用平台信息（示例）：
  - `frontend/src/App.tsx:46` `import { platform } from "@tauri-apps/plugin-os";`
  - `frontend/src/hooks/useTauriMenu.ts:8` `import { platform } from "@tauri-apps/plugin-os";`
  - `frontend/src/components/layout/CustomTitleBar.tsx:3` 同上

## 方案概述
- 删除业务代码中对 `window.__TAURI_OS_PLUGIN_INTERNALS__` 的直接访问，统一改用官方模块 API。
- 封装一个异步平台获取函数，在纯 Web 环境做显式短路，避免白屏。
- 按现有代码风格将平台信息用于条件渲染和样式（与 `App.tsx` 的 `body.classList.add("os-<p>")` 一致）。

## 具体改动
1. 新增工具函数（示例放置 `frontend/src/utils/platform.ts`）：
   ```ts
   import { platform } from "@tauri-apps/plugin-os";

   export async function getPlatform() {
     if (typeof globalThis !== "undefined" && (globalThis as any).__WEB__) return "web";
     return await platform();
   }
   ```
2. 将原有 `Ff()` 的实现全部替换为对 `getPlatform()` 的调用；或直接在使用处 `await platform()`，与已有文件保持一致。
3. 调整调用点为异步（如需），并按现有模式添加/更新 `body` 上的 `os-<platform>` 类名以驱动样式。
4. 不引入任何 `try/catch`，通过环境短路和模块 API 保证安全性。

## 验证步骤
- 在 Tauri 开发环境启动应用，打开 DevTools：确认不再出现 `Cannot read properties of undefined (reading 'platform')`。
- 检查 `document.body` 是否包含 `os-windows`/`os-macos`/`os-linux` 等类名，界面正常加载不再白屏。
- 在纯 Web 模式（`__WEB__` 为真）下页面可渲染，平台判定返回 `"web"`，不触发插件调用。

## 影响范围与风险
- 仅替换错误的全局访问点为模块 API；不改动现有依赖与插件初始化，风险低。
- 如有同步调用场景需改为 `await`，请在对应组件的 `useEffect` 或事件回调中处理。