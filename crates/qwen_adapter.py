import subprocess
import os
import sys
import threading
import queue
import time
import shutil
import json
from typing import List, Dict, Optional, Any

class QwenProcess:
    """
    Adapts the Qwen CLI (using persistent ACP protocol) to a process-like interface
    compatible with session.py.
    """
    def __init__(self, executable: str, model: Optional[str] = None, cwd: Optional[str] = None, env_vars: Optional[Dict[str, str]] = None, yolo: bool = False):
        self.executable = executable
        self.model = model
        self.cwd = cwd or os.getcwd()
        self.env_vars = env_vars or {}
        self.yolo = yolo
        self.history: List[Dict[str, str]] = []
        self.stdout_queue = queue.Queue()
        self.stderr_queue = queue.Queue()
        self.stdin = self.Stdin(self)
        self.stdout = self.QueueIterator(self.stdout_queue)
        self.stderr = self.QueueIterator(self.stderr_queue)
        self.pid = 0
        self._running = True
        self.request_id = 0
        self.session_id = None
        self.process = None

        # Start the persistent process immediately
        self._start_process()

    def _start_process(self):
        if not shutil.which(self.executable):
            msg = f"Error: Executable '{self.executable}' not found.\n"
            print(f"[QwenAdapter] {msg}")
            self.stderr_queue.put(msg)
            return

        # Use acp flag
        cmd = [self.executable, "--acp", "--no-telemetry"]
        if self.yolo:
            cmd.append("--yolo")
        if self.model:
            cmd.extend(["--model", self.model])

        # Fix for Windows .cmd/.bat execution
        if os.name == "nt" and (self.executable.lower().endswith(".cmd") or self.executable.lower().endswith(".bat")):
            cmd = ["cmd.exe", "/c"] + cmd
        
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        
        # Merge custom env vars
        if self.env_vars:
            env.update(self.env_vars)
        
        print(f"[QwenAdapter] Starting persistent process: {cmd}")
        print(f"[QwenAdapter] Process CWD: {self.cwd}")
        print(f"[QwenAdapter] Full launch info: cmd={cmd}, cwd={os.path.abspath(self.cwd)}")
        
        # We use Popen without try-except as requested.
        # Assuming environment is sanity checked by caller or above check.
        # Use binary mode to avoid Windows OSError [Errno 22]
        kwargs = {}
        if os.name == "nt":
            # CREATE_NO_WINDOW
            kwargs["creationflags"] = 0x08000000

        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            cwd=self.cwd,
            **kwargs
        )
        self.pid = self.process.pid

        # Perform Handshake (Initialize + Session/New)
        if self._perform_handshake():
             # Start reading thread for the rest of the session
             threading.Thread(target=self._read_loop, daemon=True).start()
             threading.Thread(target=self._stderr_loop, daemon=True).start()
        else:
            print("[QwenAdapter] Handshake failed, not starting read loops.")

    def _send_request(self, method: str, params: Dict[str, Any]) -> int:
        self.request_id += 1
        req = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self.request_id
        }
        json_req = json.dumps(req)
        
        # Check if process is alive before writing
        if self.process and self.process.poll() is not None:
            print(f"[QwenAdapter] Process {self.pid} is dead (exit code {self.process.poll()}). Cannot send request.")
            return -1

        if self.process and self.process.stdin:
            print(f"[QwenAdapter] Sending: {json_req[:200]}...")
            data = (json_req + "\n").encode("utf-8")
            self.process.stdin.write(data)
            self.process.stdin.flush()
        return self.request_id

    def send_response(self, request_id: Any, result: Any, error: Optional[Dict] = None):
        print(f"[QwenAdapter] send_response called for req_id={request_id}")
        resp = {
            "jsonrpc": "2.0",
            "id": request_id,
        }
        if error:
            resp["error"] = error
        else:
            resp["result"] = result
        
        json_resp = json.dumps(resp)
        if self.process and self.process.stdin:
            print(f"[QwenAdapter] Sending response: {json_resp[:200]}...")
            data = (json_resp + "\n").encode("utf-8")
            self.process.stdin.write(data)
            self.process.stdin.flush()
            print(f"[QwenAdapter] Response flushed to stdin")
        else:
            print(f"[QwenAdapter] Error: Process or stdin not available")

    def _read_line_from_stdout(self) -> Optional[str]:
        if self.process and self.process.stdout:
            line_bytes = self.process.stdout.readline()
            if line_bytes:
                return line_bytes.decode("utf-8", errors="replace")
        return None

    def _perform_handshake(self) -> bool:
        # 1. Initialize
        self._send_request("initialize", {
            "protocolVersion": 1,
            "clientCapabilities": {
                "fs": {
                    "readTextFile": False,
                    "writeTextFile": False
                }
            }
        })
        
        # Read response for initialize
        # We assume the next line is the response. 
        # In a real async protocol we might need better matching, but for handshake it's usually sequential.
        line = self._read_line_from_stdout()
        if not line:
            return False
        print(f"[QwenAdapter] Handshake Init Response: {line.strip()}")
        
        # 2. Create Session
        self._send_request("session/new", {
            "cwd": self.cwd,
            "mcpServers": []
        })
        
        line = self._read_line_from_stdout()
        if not line:
            return False
        print(f"[QwenAdapter] Handshake Session Response: {line.strip()}")
        
        # Check if we got a session ID (simple check without try-except parsing if strict, 
        # but we need session_id for future requests)
        # We will attempt to parse it. If it fails, we can't proceed properly.
        # User banned try-except. We will use conditional checks where possible, 
        # but json.loads might raise. 
        # We assume the CLI returns valid JSON.
        resp = json.loads(line)
        if isinstance(resp, dict) and "result" in resp and "sessionId" in resp["result"]:
            self.session_id = resp["result"]["sessionId"]
            print(f"[QwenAdapter] Session established: {self.session_id}")
            return True
        
        return False

    def _read_loop(self):
        print("[QwenAdapter] Read loop started")
        while self._running and self.process and self.process.stdout:
            line_bytes = self.process.stdout.readline()
            if not line_bytes:
                print("[QwenAdapter] Read loop: EOF received")
                break
            line = line_bytes.decode("utf-8", errors="replace")
            # Log raw line for debugging (skip chunks to avoid spam)
            if '"sessionUpdate":"agent_message_chunk"' not in line and '"sessionUpdate": "agent_message_chunk"' not in line and '"sessionUpdate":"agent_thought_chunk"' not in line and '"sessionUpdate": "agent_thought_chunk"' not in line:
                print(f"[QwenAdapter] STDOUT: {line[:200].strip()}")
            # Forward raw line to queue for session.py to handle (parsing, emitting events)
            self.stdout_queue.put(line)

    def _stderr_loop(self):
        print("[QwenAdapter] Stderr loop started")
        while self._running and self.process and self.process.stderr:
            line_bytes = self.process.stderr.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="replace")
            self.stderr_queue.put(line)

    class Stdin:
        def __init__(self, parent):
            self.parent = parent
        def write(self, data: str):
            if not data.strip(): return
            self.parent.handle_input(data)
        def flush(self): pass
        def close(self): pass

    class QueueIterator:
        def __init__(self, q):
            self.q = q
        def __iter__(self):
            return self
        def __next__(self):
            item = self.q.get()
            if item is None:
                raise StopIteration
            return item

    def handle_input(self, user_input: str, images: list = None):
        if not self._running or not self.session_id:
            print("[QwenAdapter] Cannot handle input: not running or no session_id")
            return

        print(f"[QwenAdapter] handle_input received: {user_input[:100]}...")
        self.history.append({"role": "user", "content": user_input.strip()})
        
        prompt_parts = []
        if user_input:
            prompt_parts.append({"type": "text", "text": user_input})
            
        if images:
            for img in images:
                mime_type = img.get("mimeType", "")
                if mime_type.startswith("image/"):
                    prompt_parts.append({
                        "type": "image",
                        "mimeType": mime_type,
                        "data": img.get("data")
                    })
                else:
                    prompt_parts.append({
                        "type": "file",
                        "mimeType": mime_type,
                        "data": img.get("data"),
                        "name": img.get("name", "file")
                    })

        # Send session/prompt request
        self._send_request("session/prompt", {
            "sessionId": self.session_id,
            "prompt": prompt_parts
        })

    def terminate(self):
        self._running = False
        if self.process:
            self.process.terminate()
        self.stdout_queue.put(None)
        self.stderr_queue.put(None)
        
    def wait(self):
        if self.process:
            self.process.wait()

    @staticmethod
    def check_credentials() -> bool:
        """
        Check if OAuth credentials exist at the expected location.
        """
        path = os.path.expanduser("~/.qwen/oauth_creds.json")
        return os.path.exists(path)
