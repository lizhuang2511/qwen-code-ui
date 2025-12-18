我将执行以下步骤来更新环境并优化后端：

1. **安装依赖**: 根据参考项目的 `pyproject.toml` 文件，使用 `pip` 安装必要的依赖项 `PyYAML`。
2. **迁移参考代码**: 将 `agents`、`core` 文件夹以及 `cligent.py` 文件从 `d:\giteecode\qwencode5\参考文件\cligent-main\python\src\` 复制到主项目根目录 `d:\giteecode\qwencode5\`。
3. **优化 Qwen Adapter**: 修改 `d:\giteecode\qwencode5\crates\qwen_adapter.py` 以优化后端与 `qwencodecli` 的交互：

   * 引入并使用迁移过来的 `agents.qwen_code` 模块中的 `QwenRecord` 进行日志解析，复用现有代码。

   * 重构 `QwenProcess` 类，**严格移除所有** **`try-except`** **语句**。

   * 使用 `shutil.which` 预先检查可执行文件是否存在，替代异常捕获。

   * 直接处理子进程输出，让潜在错误自然抛出而不是被掩盖。

