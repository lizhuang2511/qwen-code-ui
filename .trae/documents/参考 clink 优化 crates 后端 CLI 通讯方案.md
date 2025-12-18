## 目标
- 与 `QwenCode`/`qwencodecli` 建立稳定的 CLI 通讯通道，保留现有“流式事件”体验，补齐跨平台、超时、限流与解析能力
- 严格避免 `try/except`，以形态判定与状态码驱动替代容错

## 现状与切入点
- Qwen 检测与启动入口已存在：`crates/session.py:61-67` 优先寻找 `qwencodecli` → `qwen-code` → `qwen`
- 流式读取与事件转发在 `crates/session.py:31-39`，消息写入在 `94-106`
- API 层 `execute_confirmed_command` 使用 `shell=True`（`crates/backend/api.py:45`），需替换为列表参数执行以提高安全性

## 技术方案（面向 Qwen）
### 1) Qwen 客户端封装（命令构建与环境）
- `qwen` 可执行解析：沿用现有顺序 `qwencodecli` → `qwen-code` → `qwen`，用 `shutil.which` 与绝对路径归一化
- 命令构建：`[executable] + qwen 默认参数 + 会话配置参数 + 角色参数`
  - 若 Qwen 支持 JSON/JSONL 输出开关，则在“存在且安全”时加入；否则走纯文本模式
- 环境合并：仅合并合法 `str:str` 键值；空值与非字符串跳过

### 2) 流式通信与超时/限流
- 保持两条后台线程读取 `stdout/stderr` 并发事件（`events.emit`）
- 写入策略：逐行写入加 `flush`；在发送后记录“最后活动时间戳”
- 空闲超时：维护 `last_output_at`；在 `timeout_seconds` 未读到任何输出时发出 `process-timeout-<sessionId>`，并可选终止进程
- 输出限流：
  - 单行截断（例如 16KB）；累计输出上限（例如 10MB）超过后仅发出“溢出提示”事件，不再继续转发

### 3) Qwen 解析器（无 try/except）
- 解析器接口：`parse(stdout_line) -> ParsedItem(status, content, metadata)`，按行处理以适配 JSONL/纯文本
- 判定规则：
  - JSONL：仅当行以 `{` 开头且包含典型键（例如 `"content"`/`"message"`）且以 `}` 结尾时，才做 JSON 解析；否则视为纯文本
  - 纯文本：直接转发为 `content`，`metadata` 带来源与时间戳
- 失败路径：不抛异常，返回 `status="unparsed"`，由上层统一映射为“文本占位或错误提示”事件

### 4) API 层改造（与 Qwen 关联）
- `check_cli_installed`：扩展为检测 `qwencodecli/qwen-code/qwen/gemini` 并返回详细结果（含名称与路径）
- `execute_confirmed_command`：改为列表参数执行，移除 `shell=True`，统一返回 `exit_code/stdout/stderr`
- `start_session/send_message/kill_process`：联动新的状态事件（`process-started/process-timeout/process-status-changed`）

### 5) 文件结构调整
- 新增 `crates/parsers/qwen.py`：按行安全判定的 JSONL/文本解析器（无 `try/except`）
- 新增 `crates/cli_runner.py`：Qwen 命令构建、环境合并、限流参数、时间戳维护
- `crates/session.py`：调用 `cli_runner` 与解析器，补充状态字段（`backend/model/pid/is_alive/last_output_at`）
- `crates/backend/api.py`：安全命令执行与多后端探测

## 验证与测试
- 单元：
  - 解析器在 JSONL 行/文本行混合下返回符合预期的 `status/content/metadata`
  - 命令构建在 Windows 与非 Windows 下均返回可执行路径与参数列表
- 集成：
  - 启动 Qwen 会话，发送消息，验证流式事件、超时事件与累积限流
  - `execute_confirmed_command` 注入攻击尝试，确认被列表参数执行规避

## 风险与应对
- Qwen 输出格式多样：解析器默认采用“文本优先、JSONL 仅在明确特征时启用”，避免意外解析错误
- 无 `try/except` 降低容错性：通过形态判定 + 状态码回退 + 前置校验减少失败路径

## 交付与收益
- 面向 Qwen 的稳定通讯层，具备跨平台、限流、超时与安全执行
- 解析器可扩展，后续可根据实测 Qwen 输出特征增强 JSON/JSONL 支持