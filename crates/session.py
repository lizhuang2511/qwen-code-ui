import threading
import subprocess
import shutil
import os
import time
import json
import queue
from typing import Dict, Optional, List, Any
from pathlib import Path
from datetime import datetime
import events
import projects
import watcher
from cli_runner import build_client, build_command, resolve_executable, STREAM_LIMIT_BYTES, LINE_LIMIT_BYTES
from parsers import parse_qwen_line
from qwen_adapter import QwenProcess

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
# Default project ID for single-project mode
DEFAULT_PROJECT_ID = "default"

_sessions: Dict[str, Dict] = {}

class RpcLogger:
    def __init__(self, session_id: str, project_id: str = DEFAULT_PROJECT_ID):
        self.session_id = session_id
        self.project_id = project_id
        self.log_path = self._get_log_path()
        self._ensure_dir()

    def _get_log_path(self) -> Path:
        # Use timestamp-based filename like Rust project: rpc-log-<timestamp>.log
        # But we need to persist the SAME file for the session duration.
        # We store the filename in the session state or generate a deterministic one?
        # Actually, start_session generates a new session. We can use session_id if it's timestamp based,
        # or generate a timestamp here.
        # Ideally, session_id IS unique.
        # The Rust project uses rpc-log-<timestamp>.log.
        # We will use rpc-log-<session_id>.log if session_id is a timestamp, or just <session_id>.log.
        # To match Rust exactly: rpc-log-<timestamp>.log
        # We'll assume session_id MIGHT be a timestamp or UUID.
        # Let's just use session_id for now to ensure we can find it back.
        # Or, we can store the log path in the session object.
        return PROJECTS_DIR / self.project_id / f"rpc-log-{self.session_id}.log"

    def _ensure_dir(self):
        if not self.log_path.parent.exists():
            self.log_path.parent.mkdir(parents=True, exist_ok=True)

    def log(self, data: Any):
        """Append a JSON-RPC message (or any dict) to the log file."""
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                # Add timestamp if not present (though Rust logs raw JSONRPC which doesn't always have it at top level)
                # But for our parser we might want it.
                # Rust reader handles [timestamp] prefix OR json content.
                # We will write pure JSON lines.
                line = json.dumps(data, ensure_ascii=False)
                f.write(line + "\n")
                # Debug print for troubleshooting
                print(f"[RpcLogger] Wrote to {self.log_path.name}: {line[:100]}...")
        except Exception as e:
            print(f"Error writing to RPC log {self.log_path}: {e}")

def _get_logger(session_id: str) -> Optional[RpcLogger]:
    s = _sessions.get(session_id)
    if s and "logger" in s:
        return s["logger"]
    return None

# save_all_conversations removed as we now use real-time RpcLogger

def _emit_progress(session_id: str, stage: str, message: str, percent: int, details: Optional[str] = None) -> None:
    payload = {"stage": stage, "message": message, "progress_percent": percent}
    if details:
        payload["details"] = details
    print(f"[SESSION] {session_id} stage={stage} percent={percent} message={message}" + (f" details={details}" if details else ""))
    events.emit(f"session-progress-{session_id}", payload)

def qwen_handshake(base_url: str, api_key: str, model: str) -> int:
    import json as _json
    from urllib.request import Request, urlopen
    url = base_url.rstrip("/") + "/chat/completions"
    body = _json.dumps({"model": model, "messages": [{"role": "user", "content": "ping"}]}).encode("utf-8")
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    req = Request(url, data=body, headers=headers, method="POST")
    resp = urlopen(req, timeout=10)
    return getattr(resp, "status", 200)

def _spawn_cli(command: str, working_directory: str, model: str):
    cmd_path = shutil.which(command) or command
    args = []
    if os.name == "nt" and (cmd_path.lower().endswith(".cmd") or cmd_path.lower().endswith(".bat")):
        args = ["cmd.exe", "/c", cmd_path]
    else:
        args = [cmd_path]
    if model:
        args += ["--model", model]
    
    kwargs = {}
    if os.name == "nt":
        kwargs["creationflags"] = 0x08000000

    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=working_directory if working_directory else None,
        text=True,
        bufsize=1,
        **kwargs
    )
    return proc

def _start_readers(session_id: str, proc: subprocess.Popen, backend: str, timeout_seconds: int):
    def read_stdout():
        total = 0
        log_buffer = []
        ui_buffer = []
        last_emit_time = 0

        def flush_ui_buffer():
            nonlocal ui_buffer, last_emit_time
            if not ui_buffer:
                return
            full_text = "".join(ui_buffer)
            events.emit(f"ai-output-{session_id}", full_text)
            ui_buffer.clear()
            last_emit_time = time.time()

        def flush_log_buffer():
            nonlocal log_buffer
            if not log_buffer:
                return
            full_text = "".join(log_buffer)
            log_buffer.clear()
            logger = _get_logger(session_id)
            if logger:
                payload = {
                    "method": "session/update",
                    "params": {"update": {"sessionUpdate": "agent_message_chunk", "content": {"type": "text", "text": full_text}}},
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
                logger.log(payload)

        def line_generator():
            if isinstance(proc, QwenProcess):
                while True:
                    try:
                        # QwenProcess.stdout_queue stores decoded strings or None
                        line = proc.stdout_queue.get(timeout=0.05)
                        if line is None:
                            return
                        yield line
                    except queue.Empty:
                        flush_ui_buffer()
            else:
                for line in proc.stdout:
                    yield line

        for line in line_generator():
            txt = line.rstrip("\n")
            ln = txt[:LINE_LIMIT_BYTES]
            total += len(ln.encode("utf-8"))
            now = int(time.time())
            s = _sessions.get(session_id, {})
            s["last_output_at"] = now
            _sessions[session_id] = s
            if backend == "qwen":
                # print(f"[SESSION-RAW] {ln[:100]}") # Debug raw input
                parsed_list = parse_qwen_line(ln)
                for parsed in parsed_list:
                    status = parsed.get("status")
                    # print(f"[SESSION-PARSE] status={status}") # Debug parsed status
                    if status == "permission_request":
                        flush_ui_buffer()
                        flush_log_buffer()
                        data = parsed.get("content")
                        raw_data = parsed.get("raw", "")
                        events.emit(f"cli-io-{session_id}", {"type": "output", "data": raw_data})
                        
                        # Keep ID as-is (likely int) for correct JSON-RPC response matching
                        req_id = data.get("id")
                        params = data.get("params") or {}
                        tool_call = params.get("toolCall") or {}
                        tool_call_id = tool_call.get("toolCallId")
                        
                        # Store mapping if toolCallId exists
                        if tool_call_id:
                             if "pending_permissions" not in _sessions[session_id]:
                                 _sessions[session_id]["pending_permissions"] = {}
                             
                             # Check for duplicates
                             if tool_call_id in _sessions[session_id]["pending_permissions"]:
                                 print(f"[SESSION] Ignoring duplicate permission request for toolCallId {tool_call_id}")
                                 continue

                             _sessions[session_id]["pending_permissions"][tool_call_id] = req_id
                             print(f"[SESSION] Mapped toolCallId {tool_call_id} -> requestId {req_id} (type: {type(req_id)})")

                        payload = {
                            "request_id": str(req_id), # Frontend expects string
                            "request": params
                        }
                        events.emit(f"acp-permission-request-{session_id}", payload)
                        continue

                    if status == "tool_call_update":
                        flush_ui_buffer()
                        data = parsed.get("content") or {}
                        params = data.get("params") or {}
                        update = params.get("update") or {}
                        tool_call_id = update.get("toolCallId")
                        tool_status = update.get("status")
                        
                        print(f"[SESSION] Processing tool_call_update: id={tool_call_id} status={tool_status}")
                        print(f"[SESSION-RAW-UPDATE] {ln}") # Debug full raw update

                        # Cleanup pending permissions if tool call is done
                        if tool_status in ["completed", "failed"] and tool_call_id:
                            if "pending_permissions" in _sessions[session_id] and tool_call_id in _sessions[session_id]["pending_permissions"]:
                                del _sessions[session_id]["pending_permissions"][tool_call_id]
                                print(f"[SESSION] Cleaned up pending permission for finished tool {tool_call_id}")
                                
                        # Forward event to frontend to ensure UI updates
                        print(f"[SESSION] 后端: 已发送工具调用更新到前端: toolCallId={tool_call_id} status={tool_status}")
                        events.emit(f"acp-session-update-{session_id}", {
                            "sessionUpdate": "tool_call_update",
                            "toolCallId": tool_call_id,
                            "status": tool_status,
                            "result": update.get("result")
                        })
                        
                        # Log tool call update
                        logger = _get_logger(session_id)
                        if logger:
                            payload = {
                                "method": "session/update",
                                "params": {
                                    "update": {
                                        "sessionUpdate": "tool_call_update",
                                        "toolCallId": tool_call_id,
                                        "status": tool_status,
                                        "content": update.get("content") or [],
                                        "serverName": update.get("serverName") or "local",
                                        "toolName": update.get("toolName") or "unknown"
                                    }
                                },
                                "timestamp": datetime.utcnow().isoformat() + "Z"
                            }
                            logger.log(payload)
                        
                        # If failed, ensure we signal turn end if not already signaled
                        if tool_status == "failed":
                             print(f"[SESSION] Tool failed, emitting turn finished for {session_id}")
                             result = update.get("result")
                             content_err = update.get("content")
                             print(f"[SESSION] 后端: 工具调用失败详情(result): {json.dumps(result, ensure_ascii=False)}")
                             print(f"[SESSION] 后端: 工具调用失败内容(content): {json.dumps(content_err, ensure_ascii=False)}")
                             events.emit(f"ai-turn-finished-{session_id}", {})
                        continue

                    if status == "turn_finished":
                        flush_ui_buffer()
                        flush_log_buffer()
                        stop_reason = (parsed.get("content") or {}).get("stopReason")
                        print(f"[SESSION] Turn finished: {stop_reason}")
                        events.emit(f"ai-turn-finished-{session_id}", {"stopReason": stop_reason})
                        
                        # Log turn finished
                        logger = _get_logger(session_id)
                        if logger:
                            logger.log({
                                "result": {
                                    "stopReason": stop_reason
                                },
                                "timestamp": datetime.utcnow().isoformat() + "Z"
                            })
                        continue

                    if status == "error":
                        flush_ui_buffer()
                        flush_log_buffer()
                        error_data = (parsed.get("content") or {}).get("error")
                        print(f"[SESSION] Protocol Error: {error_data}")
                        events.emit(f"ai-turn-finished-{session_id}", {"error": error_data})
                        continue

                    # Handle errors explicitly to unblock UI (fallback for older parser versions)
                    data = parsed.get("content")
                    if isinstance(data, dict) and "error" in data:
                        error_data = data["error"]
                        print(f"[SESSION] Protocol Error (fallback): {error_data}")
                        events.emit(f"ai-turn-finished-{session_id}", {"error": error_data})
                        continue

                    content = parsed.get("content", "")
                    raw_data = parsed.get("raw", "")
                    cli_data = raw_data if raw_data else content
                    events.emit(f"cli-io-{session_id}", {"type": "output", "data": cli_data})
                    if content:
                        ui_buffer.append(content)
                        if time.time() - last_emit_time > 0.05:
                            flush_ui_buffer()
                        
                        # Buffer assistant message chunk for logging
                        log_buffer.append(content)
                        if len("".join(log_buffer)) > 100:
                            flush_log_buffer()
            else:
                events.emit(f"cli-io-{session_id}", {"type": "output", "data": ln})
            if total >= STREAM_LIMIT_BYTES:
                events.emit(f"cli-io-{session_id}", {"type": "output", "data": "[limit] output truncated"})
                break
        flush_ui_buffer()
    def read_stderr():
        total = 0
        for line in proc.stderr:
            txt = line.rstrip("\n")
            ln = txt[:LINE_LIMIT_BYTES]
            total += len(ln.encode("utf-8"))
            now = int(time.time())
            s = _sessions.get(session_id, {})
            s["last_error_at"] = now
            _sessions[session_id] = s
            print(f"[SESSION-STDERR] {ln}")
            events.emit(f"cli-io-{session_id}", {"type": "output", "data": ln})
            if total >= STREAM_LIMIT_BYTES:
                events.emit(f"cli-io-{session_id}", {"type": "output", "data": "[limit] stderr truncated"})
                break
    def monitor():
        while True:
            s = _sessions.get(session_id, {})
            if not s.get("alive"):
                break
            last = s.get("last_output_at") or s.get("last_error_at") or 0
            now = int(time.time())
            if last > 0 and now - last >= timeout_seconds:
                events.emit(f"process-timeout-{session_id}", {"timeoutSeconds": timeout_seconds})
                if s.get("proc"):
                    s["proc"].terminate()
                s["alive"] = False
                _sessions[session_id] = s
                break
            time.sleep(1)
    threading.Thread(target=read_stdout, daemon=True).start()
    threading.Thread(target=read_stderr, daemon=True).start()
    threading.Thread(target=monitor, daemon=True).start()

def _process_queued_messages(session_id: str):
    sess = _sessions.get(session_id)
    if not sess:
        return
    queue = sess.get("msg_queue", [])
    if not queue:
        return
    
    proc = sess.get("proc")
    if not proc:
        return

    # Process all queued messages
    while queue:
        msg = queue.pop(0)
        print(f"[SESSION] Processing queued message for {session_id}: {msg[:50]}...")
        # Check if it's QwenProcess (has handle_input) or subprocess (has stdin)
        if hasattr(proc, "handle_input"):
             proc.handle_input(msg)
        elif proc.stdin:
            if proc.poll() is not None:
                print(f"Process {proc.pid} is dead. Cannot write queued message to stdin.")
            else:
                proc.stdin.write(msg + "\n")
                proc.stdin.flush()

def start_session(session_id: str, working_directory: Optional[str], model: Optional[str], backend: Optional[str] = None, backend_config: Optional[Dict] = None) -> None:
    wd = working_directory or "."
    mdl = model or ""
    
    # Resolve project ID
    project_id = projects.ensure_project(wd)
    
    _emit_progress(session_id, "starting", "Starting session initialization", 5, wd if wd else None)
    
    # Initialize session state early with ready=False and empty queue
    _sessions[session_id] = {
        "working_directory": wd,
        "model": mdl,
        "alive": False,
        "proc": None,
        "backend": backend or "",
        "last_output_at": 0,
        "last_error_at": 0,
        "ready": False,
        "msg_queue": [],
        "history": [],
        "title": "New Conversation",
        "started_at_iso": datetime.utcnow().isoformat() + "Z",
        "current_assistant_message": "",
        "logger": RpcLogger(session_id, project_id),
        "file_watcher": None
    }
    
    # Initialize logger
    print(f"[SESSION] Registered session {session_id} with logger at {_sessions[session_id]['logger'].log_path}")
    
    # Start file watcher
    try:
        w = watcher.FileWatcher(wd)
        w.start()
        _sessions[session_id]["file_watcher"] = w
    except Exception as e:
        print(f"[SESSION] Failed to start file watcher: {e}")

    if not os.path.isdir(wd):
        _emit_progress(session_id, "failed", "Invalid working directory", 100, wd if wd else None)
        events.emit(f"ai-error-{session_id}", f"Invalid working directory: {wd}")
        events.emit("process-status-changed", get_process_statuses())
        print(f"[SESSION] {session_id} error=invalid_working_directory path={wd}")
        return

    # Permission check
    abs_wd = os.path.abspath(wd)
    print(f"[SESSION] 检查工作目录权限: {abs_wd}")
    test_file = os.path.join(abs_wd, ".perm_check")
    if os.access(abs_wd, os.W_OK):
        print(f"[SESSION] 权限检查通过: 后端进程拥有写入权限")
    else:
        print(f"[SESSION] 权限检查失败: 后端进程无法写入工作目录!")
        print(f"[SESSION] 建议: 请尝试以管理员身份运行")

    backend_name = (backend or "").lower()

    if backend_name == "qwen":
        exe = resolve_executable("qwen")
        _emit_progress(session_id, "validating_cli", "Validating CLI availability", 20, exe)
        
        # Determine mode from config or fallback to file existence
        use_oauth = True
        api_key = ""
        yolo_mode = False
        if backend_config:
             use_oauth = backend_config.get("useOAuth", True)
             api_key = backend_config.get("apiKey", "")
             yolo_mode = backend_config.get("yolo", False)
        else:
             # Fallback if no config provided (e.g. tests)
             use_oauth = QwenProcess.check_credentials()

        mdl_to_use = mdl
        env_vars = {}

        if use_oauth:
            # OAuth Mode: Enforce qwenfree if credentials exist or we expect them
            # Note: If credentials don't exist, CLI might prompt or fail, but we follow user instruction to use OAuth mode for qwenfree.
            if QwenProcess.check_credentials():
                 print(f"[SESSION] OAuth mode enabled and credentials found. Enforcing model: qwenfree")
                 mdl_to_use = "qwenfree"
            else:
                 print(f"[SESSION] OAuth mode enabled but no credentials found. Keeping model {mdl} (CLI may prompt)")
        else:
            # OpenAI Mode: Use provided model and inject API Key
            print(f"[SESSION] OpenAI mode enabled. Using model: {mdl}")
            if api_key:
                print(f"[SESSION] Injecting DASHSCOPE_API_KEY from config")
                env_vars["DASHSCOPE_API_KEY"] = api_key
                # Also set OPENAI_API_KEY just in case
                env_vars["OPENAI_API_KEY"] = api_key

        proc = QwenProcess(exe, mdl_to_use, wd, env_vars=env_vars, yolo=yolo_mode)
        
        _emit_progress(session_id, "spawning_process", "Spawning process", 40, wd if wd else None)
        print(f"[SESSION] {session_id} spawn_adapter backend={backend_name} exe={exe} model={mdl} cwd={wd}")
        
        # Update session with proc
        _sessions[session_id]["proc"] = proc
        _sessions[session_id]["backend"] = backend_name
        _sessions[session_id]["alive"] = True
        events.emit("process-status-changed", get_process_statuses())
        
        _start_readers(session_id, proc, backend_name, 1800)
        
        events.emit(f"cli-io-{session_id}", {"type": "output", "data": "[session] started cli (stateless adapter)"})
        events.emit(f"process-started-{session_id}", {"pid": proc.pid})
        
        _emit_progress(session_id, "initializing", "Initializing session", 80, wd if wd else None)
        
        def handshake():
            if QwenProcess.check_credentials():
                _emit_progress(session_id, "creating_session", "Creating session", 95, wd if wd else None)
            elif backend_config:
                api_key = str(backend_config.get("api_key") or "")
                # Try to get API key from environment if not provided
                if not api_key:
                    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
                    if api_key:
                        print(f"[SESSION] Using DASHSCOPE_API_KEY from environment")

                base_url = str(backend_config.get("base_url") or "")
                mdl_cfg = str(backend_config.get("model") or mdl)
                if api_key and base_url and mdl_cfg:
                    _emit_progress(session_id, "authenticating", "Authenticating with backend", 85, base_url)
                    code = qwen_handshake(base_url, api_key, mdl_cfg)
                    if code >= 200 and code < 300:
                        _emit_progress(session_id, "creating_session", "Creating session", 95, wd if wd else None)
                    else:
                        _emit_progress(session_id, "failed", f"Handshake failed (code {code})", 100, base_url)
                        events.emit(f"ai-error-{session_id}", f"Handshake failed: {code}")
                        print(f"[SESSION] {session_id} error=handshake_failed code={code} url={base_url} model={mdl_cfg}")
                        return
            
            # Set ready and process queue
            s = _sessions.get(session_id)
            if s: s["ready"] = True
            _process_queued_messages(session_id)
            
            _emit_progress(session_id, "ready", "Session ready", 100, wd if wd else None)
            events.emit(f"ai-turn-finished-{session_id}", True)
            
        threading.Thread(target=handshake, daemon=True).start()
        
        def fallback():
            time.sleep(0.5)
            s = _sessions.get(session_id, {})
            last = s.get("last_output_at") or s.get("last_error_at") or 0
            if last == 0:
                pass
        threading.Thread(target=fallback, daemon=True).start()
        return

    yolo_mode = False
    if backend_config:
        yolo_mode = backend_config.get("yolo", False)
    client = build_client(backend_name, mdl, wd, yolo=yolo_mode)
    cmd_list = build_command(client)
    exe = cmd_list[0] if len(cmd_list) > 0 else ""
    has_cli = exe != "" and (shutil.which(exe) is not None or os.path.basename(exe))
    if has_cli:
        _emit_progress(session_id, "validating_cli", "Validating CLI availability", 20, exe)
        
        kwargs = {}
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000

        proc = subprocess.Popen(
            cmd_list,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=wd if wd else None,
            text=True,
            bufsize=1,
            **kwargs
        )
        _emit_progress(session_id, "spawning_process", "Spawning process", 40, wd if wd else None)
        print(f"[SESSION] {session_id} spawn_cli backend={backend_name} exe={exe} cwd={wd} cmd={' '.join(cmd_list)}")
        
        # Update session with proc
        _sessions[session_id]["proc"] = proc
        _sessions[session_id]["backend"] = backend_name
        _sessions[session_id]["alive"] = True
        events.emit("process-status-changed", get_process_statuses())
        
        _start_readers(session_id, proc, backend_name, client.timeout_seconds)
        events.emit(f"cli-io-{session_id}", {"type": "output", "data": "[session] started cli"})
        events.emit(f"process-started-{session_id}", {"pid": proc.pid})
        _emit_progress(session_id, "initializing", "Initializing session", 80, wd if wd else None)
        def handshake():
            if backend_name == "qwen" and backend_config:
                api_key = str(backend_config.get("api_key") or "")
                # Try to get API key from environment if not provided
                if not api_key:
                    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
                    if api_key:
                        print(f"[SESSION] Using DASHSCOPE_API_KEY from environment")

                base_url = str(backend_config.get("base_url") or "")
                mdl = str(backend_config.get("model") or mdl)
                if api_key and base_url and mdl:
                    _emit_progress(session_id, "authenticating", "Authenticating with backend", 85, base_url)
                    code = qwen_handshake(base_url, api_key, mdl)
                    if code >= 200 and code < 300:
                        _emit_progress(session_id, "creating_session", "Creating session", 95, wd if wd else None)
                    else:
                        _emit_progress(session_id, "failed", f"Handshake failed (code {code})", 100, base_url)
                        events.emit(f"ai-error-{session_id}", f"Handshake failed: {code}")
                        print(f"[SESSION] {session_id} error=handshake_failed code={code} url={base_url} model={mdl}")
                        return
            
            # Set ready and process queue
            s = _sessions.get(session_id)
            if s: s["ready"] = True
            _process_queued_messages(session_id)
            
            _emit_progress(session_id, "ready", "Session ready", 100, wd if wd else None)
            events.emit(f"ai-turn-finished-{session_id}", True)
        threading.Thread(target=handshake, daemon=True).start()
        def fallback():
            time.sleep(0.5)
            s = _sessions.get(session_id, {})
            last = s.get("last_output_at") or s.get("last_error_at") or 0
            if last == 0:
                pass
        threading.Thread(target=fallback, daemon=True).start()
    else:
        _emit_progress(session_id, "failed", "CLI not found", 100, exe or "")
        events.emit(f"ai-error-{session_id}", f"CLI not found: {exe}")
        events.emit("process-status-changed", get_process_statuses())
        print(f"[SESSION] {session_id} error=cli_not_found exe={exe} backend={backend_name}")

def send_message(session_id: str, message: str) -> None:
    sess = _sessions.get(session_id, {})
    events.emit(f"cli-io-{session_id}", {"type": "input", "data": message})
    
    # Log user message (session/prompt)
    logger = _get_logger(session_id)
    if logger:
        # Construct session/prompt payload
        # This matches the Rust implementation structure
        payload = {
            "method": "session/prompt",
            "params": {
                "prompt": [{"type": "text", "text": message}]
            },
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        logger.log(payload)
    
    # Check if session is ready
    if not sess.get("ready", False):
        print(f"Session {session_id} not ready, queuing message")
        if "msg_queue" not in sess:
            sess["msg_queue"] = []
        sess["msg_queue"].append(message)
        return

    proc = sess.get("proc")
    if proc:
        if hasattr(proc, "handle_input"):
             proc.handle_input(message)
        elif proc.stdin:
            if proc.poll() is not None:
                print(f"Process {proc.pid} is dead. Cannot write to stdin.")
            else:
                proc.stdin.write(message + "\n")
                proc.stdin.flush()
    else:
        # Fallback for simulation or error state
        def run():
            events.emit(f"ai-output-{session_id}", f"Echo: {message}")
            events.emit(f"ai-turn-finished-{session_id}", True)
        threading.Thread(target=run, daemon=True).start()

def get_process_statuses():
    items = []
    for cid, s in _sessions.items():
        proc = s.get("proc")
        pid = proc.pid if proc else None
        is_alive = bool(s.get("alive"))
        items.append({
            "conversation_id": cid, 
            "pid": pid, 
            "created_at": 0, 
            "is_alive": is_alive,
            "isActive": is_alive  # Map isActive to is_alive for frontend compatibility
        })
    return items

def kill_process(conversation_id: str) -> None:
    s = _sessions.get(conversation_id)
    if s:
        s["alive"] = False
        if s.get("proc"):
            s["proc"].terminate()
        
        # Stop file watcher
        w = s.get("file_watcher")
        if w:
            try:
                w.stop()
            except Exception as e:
                print(f"[SESSION] Error stopping watcher: {e}")
            s["file_watcher"] = None

def handle_permission_response(session_id: str, tool_call_id: str, outcome: str) -> None:
    print(f"[SESSION] Handling permission response: id={tool_call_id} outcome={outcome}")
    print(f"[SESSION] 后端: 收到权限响应: id={tool_call_id} outcome={outcome}")
    s = _sessions.get(session_id)
    if not s:
        print(f"[SESSION] Session {session_id} not found via direct lookup. Searching by proc.session_id...")
        found = False
        for cid, sess_data in _sessions.items():
            proc = sess_data.get("proc")
            # Check if proc is QwenProcess and has matching session_id
            if proc and hasattr(proc, "session_id") and proc.session_id == session_id:
                print(f"[SESSION] Found session {cid} matching UUID {session_id}")
                s = sess_data
                session_id = cid # Update local var to use internal ID
                found = True
                break
        
        if not found:
            print(f"[SESSION] Session {session_id} not found. Available: {list(_sessions.keys())}")
            # Try to find a fallback session if only one exists
            if len(_sessions) == 1:
                fallback_id = list(_sessions.keys())[0]
                print(f"[SESSION] Fallback: using single available session {fallback_id}")
                s = _sessions[fallback_id]
                session_id = fallback_id # Update local var
            else:
                return

    if not s.get("alive"):
        print(f"[SESSION] Session {session_id} is marked as dead")
        return
    
    # Resolve toolCallId to request_id
    pending = s.get("pending_permissions", {})
    req_id = pending.get(tool_call_id)
    
    # Fallback to direct conversion if mapping not found (e.g. legacy or restart)
    if req_id is None:
        print(f"[SESSION] toolCallId {tool_call_id} not found in pending map: {list(pending.keys())}")
        if isinstance(tool_call_id, str) and tool_call_id.isdigit():
            req_id = int(tool_call_id)
            print(f"[SESSION] Fallback: treating toolCallId as requestId: {req_id}")
        else:
             # Can't respond without ID
             print(f"[SESSION] Error: Could not resolve request ID for toolCallId {tool_call_id}")
             return
    else:
        print(f"[SESSION] Resolved requestId {req_id} from map")
    
    # Cleanup mapping
    if tool_call_id in pending:
        del pending[tool_call_id]

    proc = s.get("proc")
    if proc and hasattr(proc, "send_response"):
         is_approved = outcome.startswith("proceed") or outcome.startswith("allow")
         print(f"[SESSION] Sending response to proc: approved={is_approved}")
         print(f"[SESSION] 后端: 开始处理权限响应, 准备发送到适配器: req_id={req_id}")
         
         if is_approved:
             # Construct ACP PermissionResult - nested based on Rust source
             # PermissionResult { outcome: PermissionOutcome }
             # PermissionOutcome::Selected { optionId: ... } -> { "outcome": "selected", "optionId": ... }
             result = {
                 "outcome": {
                     "outcome": "selected",
                     "optionId": outcome
                 }
             }
             proc.send_response(req_id, result)
             print(f"[SESSION] 后端: 已完成发送响应到适配器 (result={json.dumps(result)})")
         else:
              # For rejection
              if outcome.startswith("reject"):
                   result = {
                       "outcome": {
                           "outcome": "selected",
                           "optionId": outcome
                       }
                   }
                   proc.send_response(req_id, result)
                   print(f"[SESSION] 后端: 已完成发送响应到适配器 (result={json.dumps(result)})")
              else:
                   # Cancelled case - PermissionOutcome::Cancelled -> { "outcome": "cancelled" }
                   result = {
                       "outcome": {
                           "outcome": "cancelled"
                       }
                   }
                   proc.send_response(req_id, result)
                   print(f"[SESSION] 后端: 已完成发送响应到适配器 (result={json.dumps(result)})")
