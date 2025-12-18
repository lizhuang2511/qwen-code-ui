## 问题概述
- 你看到的错误是 WebSocket 连接失败：`ws://localhost:1420/api/ws`。这是前端 Web 模式的事件通道，桌面 Pywebview 模式不应去连接它。
- 根因：`frontend/src/lib/listen.ts:8-12` 用 `w.pywebview.state` 来判断是否在 Pywebview 下，但 Pywebview 并不提供 `state` 字段，导致错误地走到 WebSocket 分支。
- 结果：进度一直停在 5%，且输入框不出现，因为事件监听没有接收到后端的进度/进程状态。 

## 修改方案
1. 更正事件监听的运行时检测（前端）
- 文件：`frontend/src/lib/listen.ts`
- 变更：改为使用已存在的 `isPywebview()` 检测或 `window.pywebview.api`，强制在桌面模式走 `pywebviewListen`，避免创建 WebSocket。
- 代码：
```ts
import { webListen } from "./webApi";
import { pywebviewListen } from "./pywebviewBridge";
import { isPywebview } from "./runtime";

export async function listen<T>(event: string, callback: (event: { payload: T }) => void): Promise<() => void> {
  if (isPywebview()) {
    return pywebviewListen<T>(event, callback);
  }
  return webListen<T>(event, callback);
}
```

2. 防御式加固（可选）
- 文件：`frontend/src/lib/webApi.ts`
- 位置：`WebSocketManager.connect()`
- 加保护：检测 `isPywebview()` 时直接返回，不发起连接；或在 `getWebSocketManager()` 中检测后返回一个空实现，以防未来代码直接使用 WebSocket 管理器。
- 示例（其一）：
```ts
import { isPywebview } from "./runtime";
...
private connect() {
  if (isPywebview()) return; // 桌面模式不连接 WS
  ...
}
```

3. 后端联动（如仍卡 5%）
- 文件：`backend/api.py`
- 补齐与前端一致的事件：
  - 启动会话后主动广播 `process-status-changed`（前端的 `useProcessManager` 会监听），并广播 `session-progress-{id}` 的 Ready 事件。
  - 实现 `get_process_statuses`、`kill_process`，直接代理到 `crates/session.py`，保证输入框的活跃态判断有数据来源。

## 验证步骤
- 启动应用后打开 DevTools：不再出现 WebSocket `error` 事件（`readyState: 3`）。
- 点击“新讨论”：
  - 进度由 5% 快速到 100%，侧边卡片显示活动状态；
  - 首页底部出现可输入的 `MessageInputBar`。
- 发送消息：日志弹窗能看到 CLI/仿真输出事件。

## 注意
- 全程不引入 `try/except`；前端 TypeScript 保持现有风格与工具。
- 仅修正运行时分支与事件广播，不改动业务逻辑。

确认后我将按上述修改点实施，并在本地运行验证，确保错误消失且输入框正常渲染。