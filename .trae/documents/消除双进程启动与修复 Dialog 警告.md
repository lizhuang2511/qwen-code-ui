## 问题梳理
- 日志显示同一会话先启动 Qwen 适配器，又启动 Gemini CLI；且 Qwen 适配器使用了 `gemini-2.5-flash` 模型。
- Dialog 仍报“受控/非受控切换”警告。

## 修复方案
1. 统一 Qwen 的模型参数
- 在 `App.tsx` 的 `startNewConversation` 调用中，当 `selectedBackend === "qwen"` 时，`model` 参数改为 `backendState.configs.qwen.model`（默认为 `qwen/qwen3-coder:free`），避免传入 Gemini 模型名。
- 目标位置：`frontend/src/App.tsx` 的 `api.start_session({ model: selectedModel, backend: selectedBackend, ... })`。

2. 防止重复启动会话
- 在 `useMessageHandler.handleSendMessage` 中：当已有 `activeConversation` 时不再调用 `start_session`，仅发送消息；只在新建会话流程调用 `start_session`（`startNewConversation` 已执行）。
- 可选增强：若需健壮性，可先读取 `processStatuses` 判断对应 `conversation_id` 的 `is_alive` 再决定是否启动。

3. Dialog 警告定位与消除
- 强制所有 `Dialog` 实例保持一致用法：受控组件始终传入布尔 `open` 与 `onOpenChange`；非受控不传 `open`，只用 `DialogTrigger`。
- 添加开发期诊断：在我们的 `ui/dialog.tsx` 包装层对 `DialogPrimitive.Root` 增加一次性日志（仅开发模式），当首次渲染 `open===undefined` 而后续变为布尔值时打印组件来源，定位具体触发组件。
- 若定位到具体组件后，移除导致在生命周期中切换受控/非受控的代码（例如条件渲染时有时传 `open`，有时不传）。

## 预期效果
- 启动会话仅出现一次：Qwen 使用正确模型；不会再次触发 Gemini 启动。
- 发送消息后，前端收到 `ai-output-<id>`，UI显示回复。
- Dialog 警告清除；若仍出现，通过诊断日志快速定位具体组件。

## 变更范围
- 修改：`frontend/src/App.tsx`（Qwen 模型参数）。
- 修改：`frontend/src/hooks/useMessageHandler.ts`（避免重复 `start_session`）。
- 可选：`frontend/src/components/ui/dialog.tsx`（开发期诊断日志，非生产）。

## 验证
- 运行桌面应用：观察仅有一条会话启动链；`spawn_adapter` 不再携带 Gemini 模型；无 `spawn_cli` 重复。
- 发送消息：控制台出现 `🐛 [cli-io]` 原始输出与 UI 回复；后端 `[bridge]/[broadcast]` 正常。
- Dialog 警告消失；若仍有，查看诊断日志中的组件出处并修复对应用法。