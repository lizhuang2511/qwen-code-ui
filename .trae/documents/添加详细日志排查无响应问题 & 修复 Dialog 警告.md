**分析**

当前仍有两个问题：
1.  **Dialog 警告**: 用户指出的 `use-controllable-state.tsx:42` 警告依然存在。这通常是因为组件在生命周期中从非受控（props.open 为 undefined）变为受控（props.open 为 boolean），或者反之。虽然我之前修改了 `CommandDialog`，但可能还有遗漏，或者调用方传递了 `undefined`。
2.  **长时间不回复**: 用户反馈发送消息后长时间无响应。Session 启动看起来是成功的，问题可能出在消息传递或处理环节。

**解决方案**

1.  **增强后端日志 (Backend Logging)**:
    *   在 `crates/session.py` 的 `_process_queued_messages` 和 `start_session` 中添加日志，确认消息是否被正确取出并传递给 `proc`。
    *   在 `crates/qwen_adapter.py` 的 `handle_input` 和 `run_query` 中添加详细日志：
        *   打印接收到的用户输入。
        *   打印构建的完整 prompt。
        *   打印 `subprocess.Popen` 的参数。
        *   打印从 `proc.stdout` 读取的每一行原始内容（raw line）。
        *   打印解析后的 `content`。
        *   打印 `run_query` 线程的启动和结束。
    *   在 `crates/parsers/qwen.py` 中，如果解析失败或遇到非预期格式，打印警告日志。

2.  **检查 Dialog 警告**:
    *   我之前修改了 `CommandDialog`，强制要求传入 `open` 和 `onOpenChange`。
    *   需要检查 `frontend/src/components/common/SettingsDialog.tsx` 中使用 `Command` 组件的地方。`SettingsDialog` 内部使用了 `Command` 相关组件（`CommandInput`, `CommandList` 等），这些是 `cmdk` 的组件，而不是我修改的 `CommandDialog`。
    *   但是，`CommandDialog` 本身在 `frontend/src/components/ui/command.tsx` 中定义。
    *   检查 `SettingsDialog` 是否有条件渲染 `CommandDialog` 或者 `Dialog`，导致状态切换。
    *   特别注意：`SettingsDialog` 内部有一个 `comboboxOpen` 状态控制的下拉框，它使用了一个绝对定位的 `div` 包裹 `Command` 组件，而不是 `CommandDialog`。这看起来没问题。
    *   **关键点**: 用户报错提到的 `use-controllable-state` 通常是 Radix UI 的组件报的。可能是 `Dialog` 本身。
    *   我会再次检查 `frontend/src/components/ui/dialog.tsx` 和相关使用。如果找不到明显的“切换”点，我将确保所有 `Dialog` 的使用都显式传递 `open={!!someBoolean}` 来强制转换为布尔值，避免 `undefined`。

3.  **执行计划**:
    *   修改 `crates/session.py` 添加日志。
    *   修改 `crates/qwen_adapter.py` 添加日志。
    *   修改 `crates/parsers/qwen.py` 添加日志。
    *   (可选) 检查前端 `Dialog` 用法，确保 `open` 属性不为 `undefined`。

**验证**
*   让用户运行并提供新的日志。
*   通过日志判断是消息没发出去，还是发出去没回包，还是回包解析失败。

我将优先添加日志，这是定位“长时间不回复”问题的关键。同时，我会尝试修复 Dialog 警告，通过确保 `open` 属性始终为布尔值。