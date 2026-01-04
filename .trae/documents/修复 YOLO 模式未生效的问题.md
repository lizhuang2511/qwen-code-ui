我已找到导致 YOLO 模式失效的原因：**后端代码未将前端的 YOLO 配置传递给底层的 AI 进程**。

虽然前端已正确发送了 `yolo: true` 的配置，但在启动 CLI 工具（如 `qwen` 或 `gemini`）时，Python 后端（`session.py`, `cli_runner.py`, `qwen_adapter.py`）均忽略了该参数，导致底层进程不知道需要跳过审批，从而继续向用户请求权限。

### 修复计划

我将修改以下三个后端文件来修复此问题：

#### 1. 修改 `crates/cli_runner.py`
更新 `build_client` 函数以支持 `yolo` 参数。
- **改动**: 增加 `yolo` 参数，并在为 True 时向命令行参数添加 `--yolo` 标志。

#### 2. 修改 `crates/qwen_adapter.py`
更新 `QwenProcess` 类以支持 `yolo` 参数。
- **改动**: 在 `__init__` 中接收 `yolo` 参数。
- **改动**: 在 `_start_process` 构建启动命令时，如果启用 YOLO 模式，则追加 `--yolo` 参数。

#### 3. 修改 `crates/session.py`
更新 `start_session` 函数以从配置中读取 YOLO 设置并传递。
- **改动**: 从 `backend_config` 中读取 `yolo` 字段。
- **改动**: 在实例化 `QwenProcess` 和调用 `build_client` 时传递该参数。

### 预期结果
修复后，当你在设置中开启 YOLO 模式时，后端会正确地向底层 CLI 传递 `--yolo` 参数。底层 CLI 接收到该参数后，将自动批准工具调用，不再弹出审批请求。
