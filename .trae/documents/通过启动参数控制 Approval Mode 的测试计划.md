收到。根据您提供的 CLI 帮助信息，`qwen` 确实支持 `--approval-mode` 参数，并且有四种可选值：`plan`, `default`, `auto-edit`, `yolo`。

您的需求是在前端界面添加一个下拉菜单来动态切换这四种模式。当用户切换模式时，后端需要：
1.  **保留当前对话记录**。
2.  **重启后端 CLI 进程**（例如 `qwen`），并附带新的 `--approval-mode <mode>` 参数。
3.  **恢复对话上下文**（导入之前的记录）。

并且，这个设计需要保持前端通用性，适配未来可能接入的其他 CLI 后端。

### 实施计划

**1. 后端修改 (`crates/`)**

   - **修改 `QwenProcess` 类 (`qwen_adapter.py`)**：
     - 更新构造函数 `__init__`，支持接收 `approval_mode` 参数（字符串），替代原本的布尔值 `yolo`。
     - 在 `_start_process` 中，根据传入的 `approval_mode` 构建启动参数：`--approval-mode <mode>`。
     - 处理旧代码的兼容性（如果传入 `yolo=True`，则映射为 `approval_mode='yolo'`）。

   - **修改 `Session` 类 (`session.py`)**：
     - 添加 `restart_backend(new_approval_mode)` 方法：
       1.  保存当前 `self.history`。
       2.  调用 `self.backend.terminate()` 关闭旧进程。
       3.  使用新模式重新初始化 `self.backend`。
       4.  （可选）在新会话中重放历史记录（这取决于 CLI 是否支持 `session/history` 导入，或者我们需要通过多次 `session/prompt` 模拟）。*注：通常 CLI 重启后是全新的 Session，若要“导入”记录可能需要特殊处理，但目前先实现进程重启。*

   - **修改 API 接口 (`backend/api.py` 或 `rpc.py`)**：
     - 添加一个新的 RPC 方法 `set_approval_mode`，供前端调用。
     - 该方法接收模式字符串，并触发 Session 的重启逻辑。

**2. 前端修改 (`frontend/src/`)**

   - **添加 UI 组件**：
     - 在对话框上方或工具栏添加一个 **Select/Dropdown** 组件。
     - 选项内容：`Plan Only`, `Default (Ask)`, `Auto Edit`, `YOLO (Auto All)`。
     - 绑定值：`plan`, `default`, `auto-edit`, `yolo`。

   - **绑定事件**：
     - 当下拉框值改变时，调用后端的 `set_approval_mode` RPC 接口。
     - 显示“正在切换模式...”的加载状态，直到后端重启完成。

**3. 验证计划**
   - 编写一个新的测试脚本 `test_mode_switching.py`：
     - 模拟前端调用 `set_approval_mode`。
     - 验证后端是否重启了进程，且启动参数包含了正确的 `--approval-mode`。

请确认是否按照此架构方案进行实施。