**问题概述**
- 后端异常：`TypeError: can only concatenate str (not "dict")` 出现在 `crates/qwen_adapter.py:100`，因 `record.content` 有时是 `dict`，被当作 `string` 累加。
- 前端表现：CLI 长时间显示“生成中”，只看到原始 JSON，未渲染助手回复；同时出现 `use-controllable-state.tsx:42` 警告，提示某个 `Dialog` 从非受控切换为受控。

**根因定位**
- 解析链路：`session.py:63-68` 使用 `parse_qwen_line` 提取 `content` 并通过事件 `ai-output-<id>` 推送；当前 `parsers/qwen.py` 在 `content` 为嵌套对象时直接返回 `dict`（`crates/parsers/qwen.py:1-33`），导致后端和前端都处理异常。
- 记录类：`agents/qwen_code/core.py` 的 `QwenRecord._post_load` 对 `data["content"]` 未做类型归一，可能设置为 `dict`（`crates/agents/qwen_code/core.py:63-79`）。
- 适配器：`qwen_adapter.py` 直接 `full_response += record.content`（`crates/qwen_adapter.py:98-101`），遇到 `dict` 触发 TypeError，线程退出，前端收不到文本流。
- Dialog 警告：Radix 的 `Dialog` 要么受控（传 `open/onOpenChange`），要么非受控（仅用 `DialogTrigger`）。当同一个 `Dialog` 实例生命周期内从不传 `open` 切到传 `open` 就会出现该警告。代码库中既有受控用法（如 `frontend/src/components/common/SettingsDialog.tsx:224`），也有非受控用法（如 `frontend/src/components/conversation/MessageActions.tsx:29-50`）。需要确保同一实例不混用。

**修复方案（不使用 try/except）**
- Python 解析统一：
  - 在 `crates/parsers/qwen.py` 扩展 `parse_line`，保证返回的 `content` 始终为 `string`：
    - 若 `data.content` 是 `string`，直接返回；
    - 若为 `dict`，优先提取 `text`、`message`、`chunk`；若为 `parts: [{text: ...}]`，拼接文本；否则返回空字符串。
    - 同时支持新结构：`data.method == "session/update"` 时取 `data.params.update.content.text`；`streamAssistantMessageChunk` 时取 `data.params.chunk.text`。
  - 好处：`session.py:63-68` 推送的 `ai-output-<id>` 始终为字符串，前端 `useConversationEvents.ts:374-407` 追加文本不再出现“[object Object]”或空白。
- 记录类归一：
  - 在 `crates/agents/qwen_code/core.py::_post_load` 对 `self.content` 做类型归一：
    - 若为 `dict`，按上述同样规则抽取为 `string`；若为 `list(parts)`，用现有 `_extract_parts_content` 组装；否则设为 `""`。
  - `QwenRecord.get_content()` 始终返回 `string`。
- 适配器安全拼接：
  - 在 `crates/qwen_adapter.py:98-101` 改为仅当 `record.content` 为 `string` 时累加；若不是，先通过归一后的 `QwenRecord.get_content()` 获取文本再累加。这样不会触发 TypeError，线程能持续向队列写入。
- Dialog 受控策略统一：
  - 审核所有 `<Dialog>` 用法（已检索到 20+ 处）。确保同一组件实例只走一种模式：
    - 受控：始终传 `open` 与 `onOpenChange`（如 `ConversationSearchDialog.tsx:111`）。
    - 非受控：不传 `open`，只用 `DialogTrigger`（如 `MessageActions.tsx:29`）。
  - 重点检查包装组件 `frontend/src/components/ui/command.tsx` 的 `CommandDialog`：它把 `props` 直接透传到 `<Dialog {...props}>`，不同调用方可能混用。将其改为明确受控或明确非受控两种独立组件，或在所有使用点统一为受控（始终传 `open/onOpenChange`）。

**验证步骤**
- 后端：
  - 启动后端，复现一次对话；观察不再出现 `Thread-XX run_query` TypeError；`Terminal` 应持续打印 `ai-output-<id>` 文本事件。
- 前端：
  - 发送消息后，`useConversationEvents.ts:374-407` 应看到逐步追加的文本；对话界面正常渲染而非原始 JSON。
- Dialog：
  - 操作所有弹窗（设置、搜索、进程卡片等），确保控制台不再出现 `use-controllable-state.tsx:42` 警告。

**改动范围与影响**
- 仅修改 `crates/parsers/qwen.py`、`crates/agents/qwen_code/core.py`、`crates/qwen_adapter.py` 和可能的 `frontend/src/components/ui/command.tsx`（若确认为问题源）；不引入 `try/except`。
- 这些改动提升兼容性，对既有 JSONL/文本流格式都向后兼容。

请确认以上方案后我来执行修改与验证。