收到，我将调整计划，暂时只专注于添加 Qwen 的模型选择功能，并保持现有的默认设置。

### 修改计划：

1.  **前端界面修改 (`SettingsDialog.tsx`)**：
    *   **修改 Qwen 配置区域**：将原本的“模型”文本输入框改为**下拉选择菜单 (Select)**。
    *   **预设选项**：下拉菜单将包含以下选项：
        *   `qwen-max` (Qwen Max - 旗舰模型)
        *   `qwen-plus` (Qwen Plus - 均衡模型)
        *   `qwen-turbo` (Qwen Turbo - 快速模型)
        *   `qwen-coder-plus` (Qwen Coder Plus - 代码专用)
        *   `qwen-coder-turbo` (Qwen Coder Turbo - 代码快速)
        *   `custom` (自定义 - 允许手动输入其他模型名称)
    *   **默认行为**：如果用户之前没有设置模型，或者选择保持默认，下拉菜单将默认选中当前配置的值（如果当前值不在列表中，则显示为自定义）。如果不做任何更改，系统将保持现有的模型设置不变。

2.  **后端支持 (`crates/session.py`)**：
    *   **环境变量 Key 支持**：虽然不修改全局配置界面，但后端代码中会确保如果用户在界面留空 API Key，系统会自动尝试读取 `DASHSCOPE_API_KEY` 环境变量，方便配置。

这个计划只涉及模型选择界面的优化，不添加新的全局文本配置区域。