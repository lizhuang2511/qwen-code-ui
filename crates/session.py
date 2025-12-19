import threading
import subprocess
import shutil
import os
import time
import json
from typing import Dict, Optional, List
import events
from cli_runner import build_client, build_command, resolve_executable, STREAM_LIMIT_BYTES, LINE_LIMIT_BYTES
from parsers import parse_qwen_line
from qwen_adapter import QwenProcess

_sessions: Dict[str, Dict] = {}

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
    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=working_directory if working_directory else None,
        text=True,
        bufsize=1,
    )
    return proc

def _start_readers(session_id: str, proc: subprocess.Popen, backend: str, timeout_seconds: int):
    def read_stdout():
        total = 0
        for line in proc.stdout:
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
                        stop_reason = (parsed.get("content") or {}).get("stopReason")
                        print(f"[SESSION] Turn finished: {stop_reason}")
                        events.emit(f"ai-turn-finished-{session_id}", {"stopReason": stop_reason})
                        continue

                    if status == "error":
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
                        events.emit(f"ai-output-{session_id}", content)
            else:
                events.emit(f"cli-io-{session_id}", {"type": "output", "data": ln})
            if total >= STREAM_LIMIT_BYTES:
                events.emit(f"cli-io-{session_id}", {"type": "output", "data": "[limit] output truncated"})
                break
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
            try:
                proc.stdin.write(msg + "\n")
                proc.stdin.flush()
            except Exception as e:
                print(f"Error writing queued message to stdin: {e}")

def start_session(session_id: str, working_directory: Optional[str], model: Optional[str], backend: Optional[str] = None, backend_config: Optional[Dict] = None) -> None:
    wd = working_directory or "."
    mdl = model or ""
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
    }
    print(f"[SESSION] Registered session {session_id}")

    if not os.path.isdir(wd):
        _emit_progress(session_id, "failed", "Invalid working directory", 100, wd if wd else None)
        events.emit(f"ai-error-{session_id}", f"Invalid working directory: {wd}")
        events.emit("process-status-changed", get_process_statuses())
        print(f"[SESSION] {session_id} error=invalid_working_directory path={wd}")
        return

    # Permission check
    abs_wd = os.path.abspath(wd)
    print(f"[SESSION] 检查工作目录权限: {abs_wd}")
    try:
        test_file = os.path.join(abs_wd, ".perm_check")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
        print(f"[SESSION] 权限检查通过: 后端进程拥有写入权限")
    except Exception as e:
        print(f"[SESSION] 权限检查失败: 后端进程无法写入工作目录! Error: {e}")
        print(f"[SESSION] 建议: 请尝试以管理员身份运行")

    backend_name = (backend or "").lower()

    if backend_name == "qwen":
        exe = resolve_executable("qwen")
        _emit_progress(session_id, "validating_cli", "Validating CLI availability", 20, exe)
        
        proc = QwenProcess(exe, mdl, wd)
        
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

    client = build_client(backend_name, mdl, wd)
    cmd_list = build_command(client)
    exe = cmd_list[0] if len(cmd_list) > 0 else ""
    has_cli = exe != "" and (shutil.which(exe) is not None or os.path.basename(exe))
    if has_cli:
        _emit_progress(session_id, "validating_cli", "Validating CLI availability", 20, exe)
        proc = subprocess.Popen(
            cmd_list,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=wd if wd else None,
            text=True,
            bufsize=1,
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
            try:
                proc.stdin.write(message + "\n")
                proc.stdin.flush()
            except Exception as e:
                print(f"Error writing to stdin: {e}")
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

def handle_permission_response(session_id: str, tool_call_id: str, outcome: str) -> None:
    print(f"[SESSION] Handling permission response: id={tool_call_id} outcome={outcome}")
    print(f"[SESSION] 后端: 收到权限响应: id={tool_call_id} outcome={outcome}")
    s = _sessions.get(session_id)
    if not s:
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
