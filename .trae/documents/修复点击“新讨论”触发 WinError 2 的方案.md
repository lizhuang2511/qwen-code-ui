## 目标
- 将默认后端切换为 Qwen CLI（qwencodecli）并启用 OAuth 模式。
- 修复点击“新讨论”时的 `FileNotFoundError: [WinError 2]`，并完善后端会话启动以支持 Qwen。

## 变更范围
- 前端默认配置与显示文案
- 后端 API 透传参数
- 会话启动与 CLI 进程管理（Python）

## 具体改动
- 前端默认配置：`frontend/src/utils/backendDefaults.ts`
  - 将 `defaultBackendState.selectedBackend` 由 `"gemini"` 改为 `"qwen"`（`frontend/src/utils/backendDefaults.ts:35`）。
  - 将 `defaultQwenConfig.useOAuth` 设为 `true`（`frontend/src/utils/backendDefaults.ts:18-24`）。
  - 如需一致的名称显示，将 Qwen 的显示名改为“qwencodecli”（可在 i18n 或 `frontend/src/utils/backendText.ts` 的 Qwen 分支中统一为用户期望名称）。

- 前端启动参数：`frontend/src/App.tsx:371-377`
  - 在调用 `api.start_session({...})` 时，增加 `backend: selectedBackend` 字段（保留现有的 `backendConfig`）。
  - 继续在 Qwen 后端下传递 `backendConfig`（OAuth 时 `api_key` 为空字符串，已满足现有逻辑）。

- 后端 API 透传：`crates/backend/api.py:17-21`
  - 改为将 `params` 整体透传给 `session.start_session(...)`，新增签名：
    - `start_session(session_id, working_directory, model, backend=None, backend_config=None)`。
  - `check_cli_installed` 改为 `shutil.which("gemini") is not None`，避免 Windows 上的 WinError 2。

- 会话启动（Python）：`crates/session.py`
  - 新增对后端类型的分支：
    - 若 `backend == "qwen"`：优先查找 `shutil.which("qwencodecli")`，找不到则依次尝试 `shutil.which("qwen-code")`、`shutil.which("qwen")`。
    - 若是 Windows 且命令为 `.cmd`/`.bat`：使用 `args = ["cmd.exe", "/c", cli_path, "--model", model]`；否则直接执行可执行文件路径。
    - 在启动前用 `os.path.isdir(working_directory)` 验证目录；不通过则走模拟分支（不使用异常处理）。
  - 保留原有 Gemini 分支：若找不到 CLI 或目录无效，进入模拟分支，事件输出维持现有格式，前端监听兼容。

## 根因与修复点说明
- 现状：`crates/session.py:39-47` 始终尝试启动 `gemini`，当系统实际安装为 `*.cmd/*.bat` 或 PATH 无法直接执行时，在 `shell=False` 下会抛出 WinError 2；同时未支持 Qwen CLI，导致默认切到 Qwen 仍走 Gemini 逻辑。
- 修复：
  - 为 Windows 的批处理脚本提供正确的启动方式。
  - 根据 `backend` 切换到 `qwencodecli`（OAuth 由 CLI 处理）。
  - 目录校验避免将无效 `cwd` 传入 `Popen`。

## 验证步骤
- 默认启动后端为 Qwen（OAuth）：主页标题与文案显示“qwencodecli/Qwen Desktop”（取决于文案设置）。
- 进入项目详情，点击“新讨论”：
  - 未安装 CLI：日志出现模拟会话启动（`[session] gemini not found; using simulation` 或对应 Qwen 文案），无 WinError 2。
  - 安装了 `qwencodecli`（或 `qwen-code/qwen`）：真实 CLI 启动，`[session] started ... cli` 出现在输出；前端 `frontend/src/lib/api.ts:194-197` 不再打印 WinError 2。
- `useCliInstallation` 保持 Qwen 后端下恒为已安装（无需改动），Gemini 后端仍按 PATH 检测。

## 注意事项
- 不使用 `try/except`，通过条件分支与前置校验规避异常路径。
- 其他平台维持原有行为；Windows 下新增 `.cmd/.bat` 处理。
- 不更改事件名称与结构，保障前端进度与日志监听不受影响。