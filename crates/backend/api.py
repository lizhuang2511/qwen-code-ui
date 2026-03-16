from typing import Optional, Dict, Any, List
import os
import json
import subprocess
import shutil
import shlex
import time
import events
import filesystem
import search
import projects
import session
import webview
import struct
import sys
import backend.version_utils as version_utils
try:
    import win32clipboard
    import win32con
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

class Api:
    def check_cli_installed(self) -> bool:
        paths = [
            shutil.which("qwencodecli"),
            shutil.which("qwen-code"),
            shutil.which("qwen"),
            shutil.which("gemini"),
            shutil.which("llxprt-code"),
        ]
        has_any = False
        for p in paths:
            if p is not None:
                has_any = True
        return has_any

    def start_session(self, params: Dict[str, Any]) -> None:
        session_id = params.get("sessionId", "")
        working_directory = params.get("workingDirectory")
        model = params.get("model")
        backend = params.get("backend")
        backend_config = params.get("backendConfig")
        session.start_session(session_id, working_directory, model, backend, backend_config)
        # Emit real-time process status change for frontend
        events.emit("process-status-changed", session.get_process_statuses())

    def send_message(self, params: Dict[str, Any]) -> None:
        session_id = params.get("sessionId", "")
        message = params.get("message", "")
        session.send_message(session_id, message)

    def get_process_statuses(self) -> List[Dict[str, Any]]:
        return session.get_process_statuses()

    def kill_process(self, params: Dict[str, Any]) -> None:
        conversation_id = params.get("conversationId", "")
        session.kill_process(conversation_id)
        events.emit("process-status-changed", session.get_process_statuses())

    def send_tool_call_confirmation_response(self, params: Dict[str, Any]) -> None:
        session_id = params.get("sessionId", "")
        tool_call_id = params.get("toolCallId", "")
        outcome = params.get("outcome", "")
        
        # Determine status based on outcome
        # Covers "proceed_once", "proceed_always", etc.
        is_approved = outcome.startswith("proceed") or outcome.startswith("allow")
        
        status = "completed" if is_approved else "failed"
        result = "Permission granted" if is_approved else "Permission denied"
        
        # Emit update event to frontend
        events.emit(f"acp-session-update-{session_id}", {
            "sessionUpdate": "tool_call",
            "toolCallId": tool_call_id,
            "status": status,
            "result": result
        })

        # Forward confirmation to the session process
        session.handle_permission_response(session_id, tool_call_id, outcome)

    def execute_confirmed_command(self, params: Dict[str, Any]) -> str:
        command = params.get("command", "")
        args = shlex.split(command) if isinstance(command, str) else []
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
        output = result.stdout.decode("utf-8", errors="ignore")
        error = result.stderr.decode("utf-8", errors="ignore")
        if result.returncode == 0:
            return f"Exit code: {result.returncode}\nOutput:\n{output}"
        return f"Command execution failed - Exit code: {result.returncode}\nError:\n{error}\nOutput:\n{output}"

    def generate_conversation_title(self, params: Dict[str, Any]) -> str:
        message = params.get("message", "")
        m = message.strip()
        return m[:30] if m else "New Conversation"

    def validate_directory(self, params: Dict[str, Any]) -> bool:
        return filesystem.validate_directory(params.get("path", ""))

    def is_home_directory(self, params: Dict[str, Any]) -> bool:
        return filesystem.is_home_directory(params.get("path", ""))

    def get_home_directory(self) -> str:
        return filesystem.get_home_directory()

    def get_parent_directory(self, params: Dict[str, Any]) -> Optional[str]:
        return filesystem.get_parent_directory(params.get("path", ""))

    def list_directory_contents(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        return filesystem.list_directory_contents(params.get("path", ""))

    def list_files_recursive(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        return filesystem.list_directory_contents(params.get("path", ""))

    def list_volumes(self) -> List[Dict[str, Any]]:
        # Minimal: return home as single volume
        return [{
            "name": "Home",
            "is_directory": True,
            "full_path": filesystem.get_home_directory(),
        }]

    def get_recent_chats(self) -> List[Dict[str, Any]]:
        return search.get_recent_chats()

    def search_chats(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        return search.search_chats(params.get("query", ""), params.get("filters"))

    def list_projects(self, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        limit = 25 if params is None else int(params.get("limit", 25))
        offset = 0 if params is None else int(params.get("offset", 0))
        return projects.list_projects(limit, offset)

    def get_project_discussions(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        return search.get_project_discussions(params.get("projectId", ""))

    def list_enriched_projects(self) -> List[Dict[str, Any]]:
        return projects.list_enriched_projects()

    def get_project(self, params: Dict[str, Any]) -> Dict[str, Any]:
        pid = params.get("sha256", "")
        root = params.get("externalRootPath", "")
        name = os.path.basename(root) if root else "Project"
        projects.upsert_project(pid, root, name)
        return {
            "sha256": pid,
            "root_path": root,
            "metadata": {
                "path": root,
                "sha256": pid,
                "friendly_name": name,
            },
        }

    def delete_project(self, params: Dict[str, Any]) -> None:
        projects.delete_project(params.get("projectId", ""))

    def get_version_info(self, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        path = params.get("path", "")
        if not path:
            return None
        return version_utils.get_version_info(path)

    def version_init(self, params: Dict[str, Any]) -> bool:
        return version_utils.init_backup(params.get("path", ""))

    def version_create(self, params: Dict[str, Any]) -> bool:
        return version_utils.create_snapshot(params.get("path", ""), params.get("message", ""), params.get("name", ""))

    def version_list(self, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        return version_utils.get_history(params.get("path", ""), params.get("limit", 20))

    def version_restore(self, params: Dict[str, Any]) -> bool:
        return version_utils.restore_version(params.get("path", ""), params.get("versionId"))

    def version_delete(self, params: Dict[str, Any]) -> bool:
        return version_utils.delete_version(params.get("path", ""), params.get("versionId", ""))
    
    def get_excluded_paths(self, params: Dict[str, Any]) -> List[str]:
        return version_utils.get_excluded_paths(params.get("path", ""))

    def save_excluded_paths(self, params: Dict[str, Any]) -> bool:
        path = params.get("path", "")
        # Expecting comma separated string as per requirement "Change detailed information settings area to, settings item excluded files, folders input comma separated directories."
        # Or list? The UI might send a string or list. Let's support both or assume list if frontend parses it.
        # But if the requirement says "input comma separated", the frontend might send a string "dir1,dir2".
        excluded_input = params.get("excluded", [])
        
        excluded_list = []
        if isinstance(excluded_input, str):
            excluded_list = [x.strip() for x in excluded_input.split(",") if x.strip()]
        elif isinstance(excluded_input, list):
            excluded_list = [str(x).strip() for x in excluded_input if str(x).strip()]
            
        return version_utils.update_excluded_paths(path, excluded_list)

    def read_file_content(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return filesystem.read_file_content(params.get("path", ""))

    def read_binary_file_as_base64(self, params: Dict[str, Any]) -> str:
        return filesystem.read_binary_file_as_base64(params.get("path", ""))

    def get_detailed_conversation(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return search.get_detailed_conversation(params.get("chatId", ""))

    def delete_conversation(self, params: Dict[str, Any]) -> None:
        chat_id = params.get("chatId", "")
        session.kill_process(chat_id)
        search.delete_conversation(chat_id)

    def get_canonical_path(self, params: Dict[str, Any]) -> str:
        return os.path.abspath(params.get("path", ""))

    def read_file_content_with_options(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return filesystem.read_file_content(params.get("path", ""))

    def write_file_content(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return filesystem.write_file_content(params.get("path", ""), params.get("content", ""))

    def select_directory(self) -> Optional[str]:
        wins = getattr(webview, "windows", [])
        result = None
        if wins and len(wins) > 0:
            result = wins[0].create_file_dialog(webview.FOLDER_DIALOG, allow_multiple=False)
        else:
            result = webview.create_file_dialog(webview.FOLDER_DIALOG, allow_multiple=False)
        if result is None:
            return None
        if isinstance(result, (list, tuple)):
            return result[0] if len(result) > 0 else None
        return str(result) if result else None

    def set_title(self, params: Dict[str, Any]) -> None:
        title = params.get("title", "")
        wins = getattr(webview, "windows", [])
        if wins and len(wins) > 0:
            wins[0].set_title(title)

    def minimize_window(self) -> None:
        wins = getattr(webview, "windows", [])
        if wins and len(wins) > 0:
            wins[0].minimize()

    def restore_window(self) -> None:
        wins = getattr(webview, "windows", [])
        if wins and len(wins) > 0:
            wins[0].restore()

    def toggle_fullscreen(self) -> None:
        wins = getattr(webview, "windows", [])
        if wins and len(wins) > 0:
            wins[0].toggle_fullscreen()

    def quit_app(self) -> None:
        wins = getattr(webview, "windows", [])
        if wins:
            for w in wins:
                w.destroy()

    def open_with_default_app(self, params: Dict[str, Any]) -> None:
        path = params.get("path", "")
        if os.path.exists(path):
            if sys.platform == 'win32':
                os.startfile(path)
            elif sys.platform == 'darwin':
                subprocess.call(('open', path))
            else:
                subprocess.call(('xdg-open', path))

    def copy_files(self, params: Dict[str, Any]) -> List[str]:
        return filesystem.copy_files(params.get("paths", []), params.get("target", ""))

    def get_clipboard_content(self) -> Dict[str, Any]:
        result = {"type": "empty", "content": None}
        
        if not HAS_WIN32:
            return result

        try:
            win32clipboard.OpenClipboard()
            
            # Check for file drop list (CF_HDROP)
            if win32clipboard.IsClipboardFormatAvailable(win32con.CF_HDROP):
                data = win32clipboard.GetClipboardData(win32con.CF_HDROP)
                if data:
                    result = {"type": "files", "content": list(data)}
            
            # Check for text (CF_UNICODETEXT)
            elif win32clipboard.IsClipboardFormatAvailable(win32con.CF_UNICODETEXT):
                text = win32clipboard.GetClipboardData(win32con.CF_UNICODETEXT)
                if text:
                    text = text.strip()
                    # Remove surrounding quotes if present (common when copying paths)
                    clean_text = text
                    if len(text) >= 2 and text.startswith('"') and text.endswith('"'):
                        clean_text = text[1:-1]
                    elif len(text) >= 2 and text.startswith("'") and text.endswith("'"):
                        clean_text = text[1:-1]
                        
                    # Check if text is a valid path
                    if os.path.exists(clean_text):
                        # Treat as file/folder path
                        result = {"type": "files", "content": [clean_text]}
                    else:
                        result = {"type": "text", "content": text}
        except Exception as e:
            print(f"Clipboard error: {e}")
            return {"type": "error", "content": str(e)}
        finally:
            try:
                win32clipboard.CloseClipboard()
            except Exception:
                pass
        
        return result

    def create_directory(self, params: Dict[str, Any]) -> bool:
        return filesystem.create_directory(params.get("path", ""))

    def delete_path(self, params: Dict[str, Any]) -> bool:
        return filesystem.delete_path(params.get("path", ""))

    def move_path(self, params: Dict[str, Any]) -> bool:
        return filesystem.rename_path(params.get("oldPath", ""), params.get("newPath", ""))

    def set_clipboard_content(self, params: Dict[str, Any]) -> bool:
        content_type = params.get("type", "text")
        content = params.get("content")

        if not HAS_WIN32:
            return False

        try:
            win32clipboard.OpenClipboard()
            win32clipboard.EmptyClipboard()

            if content_type == "text" and isinstance(content, str):
                win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, content)
            
            elif content_type == "files" and isinstance(content, list):
                # 构建 DROPFILES 结构的二进制数据
                # struct DROPFILES { DWORD pFiles; POINT pt; BOOL fNC; BOOL fWide; }
                # pFiles = 20 (offset)
                # pt = {0, 0}
                # fNC = 0
                # fWide = 1
                
                # 20 bytes header
                # I = unsigned int (4), l = long (4), but POINT is 2 longs (x, y)
                # pFiles(4), pt.x(4), pt.y(4), fNC(4), fWide(4)
                offset = 20
                header = struct.pack("IiiII", offset, 0, 0, 0, 1)
                
                # Paths
                paths_bytes = b""
                for p in content:
                    # 必须是绝对路径，且用反斜杠
                    abs_path = os.path.abspath(p).replace("/", "\\")
                    # encode utf-16le, append null char (2 bytes)
                    paths_bytes += abs_path.encode("utf-16le") + b"\x00\x00"
                paths_bytes += b"\x00\x00" # Double null terminator
                
                data = header + paths_bytes
                win32clipboard.SetClipboardData(win32con.CF_HDROP, data)

            win32clipboard.CloseClipboard()
            return True
        except Exception as e:
            print(f"Set clipboard error: {e}")
            try:
                win32clipboard.CloseClipboard()
            except:
                pass
            return False

    def get_mcp_config(self) -> Dict[str, Any]:
        path = os.path.expanduser("~/.qwen/settings.json")
        if os.path.exists(path):
            # Validate JSON using subprocess to avoid try-except in Python
            # python -m json.tool < path > /dev/null
            is_valid = False
            if os.path.getsize(path) > 0:
                # Use sys.executable to ensure we use the same python interpreter
                run_args = [sys.executable, "-m", "json.tool", path]
                result = subprocess.run(run_args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    is_valid = True
            
            if is_valid:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    data = json.loads(content)
                    if isinstance(data, dict):
                        # Combine mcpServers and disabledMcpServers for frontend
                        mcp_servers = data.get("mcpServers", {})
                        disabled_servers = data.get("disabledMcpServers", {})
                        
                        combined = {}
                        if isinstance(mcp_servers, dict):
                            for k, v in mcp_servers.items():
                                if isinstance(v, dict):
                                    v["enabled"] = True
                                    combined[k] = v
                                    
                        if isinstance(disabled_servers, dict):
                            for k, v in disabled_servers.items():
                                if isinstance(v, dict):
                                    v["enabled"] = False
                                    combined[k] = v
                                    
                        return {"mcpServers": combined}
        return {"mcpServers": {}}

    def save_mcp_config(self, params: Dict[str, Any]) -> bool:
        path = os.path.expanduser("~/.qwen/settings.json")
        directory = os.path.dirname(path)
        
        if not os.path.exists(directory):
            os.makedirs(directory)
            
        current_config = {}
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                if content.strip():
                    current_config = json.loads(content)
        
        if not isinstance(current_config, dict):
            current_config = {}
            
        # Split input into enabled (mcpServers) and disabled (disabledMcpServers)
        input_servers = params.get("mcpServers", {})
        enabled_servers = {}
        disabled_servers = {}
        
        for name, config in input_servers.items():
            if not isinstance(config, dict):
                continue
                
            # Check enabled status
            is_enabled = config.get("enabled", True)
            
            # Remove enabled flag for storage to keep config clean
            clean_config = config.copy()
            if "enabled" in clean_config:
                del clean_config["enabled"]
                
            if is_enabled:
                enabled_servers[name] = clean_config
            else:
                disabled_servers[name] = clean_config
        
        current_config["mcpServers"] = enabled_servers
        current_config["disabledMcpServers"] = disabled_servers
        
        with open(path, "w", encoding="utf-8") as f:
            json.dump(current_config, f, indent=2, ensure_ascii=False)
            
        return True

    def check_mcp_server(self, params: Dict[str, Any]) -> Dict[str, Any]:
        config = params.get("config", {})
        if not config:
            return {"success": False, "message": "No configuration provided"}
            
        try:
            # Check based on type
            if "command" in config:
                # Stdio
                cmd = config.get("command", "")
                if not cmd:
                    return {"success": False, "message": "Command is empty"}
                
                # Check if executable exists
                exe = shutil.which(cmd)
                if not exe:
                    # It might be a full path
                    if os.path.isfile(cmd) and os.access(cmd, os.X_OK):
                        exe = cmd
                    elif os.path.isfile(cmd):
                         # Exists but maybe not executable (e.g. script file), checking extension
                         exe = cmd
                    else:
                         # On Windows, shutil.which handles PATHEXT.
                         # If cmd has no extension, it might be found.
                         # If not found, return error.
                        return {"success": False, "message": f"Command not found: {cmd}"}
                
                return {"success": True, "message": f"Executable found at {exe}"}
                
            elif "url" in config or "httpUrl" in config:
                # SSE or HTTP
                url = config.get("url") or config.get("httpUrl")
                if not url:
                    return {"success": False, "message": "URL is empty"}
                
                try:
                    from urllib.request import Request, urlopen
                    from urllib.error import URLError, HTTPError
                    
                    # Try a simple GET request
                    req = Request(url, method="GET")
                    # Set a timeout
                    with urlopen(req, timeout=5) as response:
                        return {"success": True, "message": f"Connected to {url} (Status: {response.status})"}
                             
                except HTTPError as e:
                     # 405 Method Not Allowed is also a sign of life
                     if e.code == 405:
                         return {"success": True, "message": f"Connected to {url} (Status: {e.code})"}
                     return {"success": False, "message": f"HTTP Error: {e.code} {e.reason}"}
                except URLError as e:
                    return {"success": False, "message": f"Connection failed: {e.reason}"}
                except Exception as e:
                     return {"success": False, "message": f"Error checking URL: {str(e)}"}
            
            else:
                return {"success": False, "message": "Unknown server type"}
                
        except Exception as e:
            return {"success": False, "message": f"Validation error: {str(e)}"}

    def launch_qwen_mcp(self, params: Optional[Dict[str, Any]] = None) -> bool:
        try:
            cwd = None
            if params and isinstance(params, dict):
                cwd = params.get("path")
                
            if sys.platform == 'win32':
                cmd = 'start cmd /k "qwen"'
                if cwd and os.path.exists(cwd):
                    # /d 参数用于切换驱动器（如果需要）
                    cmd = f'start cmd /k "cd /d {cwd} && qwen"'
                subprocess.Popen(cmd, shell=True)
            elif sys.platform == 'darwin':
                # Try to open in Terminal on macOS
                script = 'tell application "Terminal" to do script "qwen"'
                if cwd and os.path.exists(cwd):
                    script = f'tell application "Terminal" to do script "cd {cwd} && qwen"'
                subprocess.Popen(['osascript', '-e', script])
            else:
                # Try common terminals on Linux
                terminals = ['gnome-terminal', 'x-terminal-emulator', 'xterm']
                for term in terminals:
                    if shutil.which(term):
                        bash_cmd = 'bash -c "qwen; exec bash"'
                        if cwd and os.path.exists(cwd):
                            bash_cmd = f'bash -c "cd {cwd} && qwen; exec bash"'
                        subprocess.Popen([term, '-e', bash_cmd])
                        break
            return True
        except Exception as e:
            print(f"Failed to launch qwen: {e}")
            return False

    def get_tags(self) -> List[str]:
        return projects.get_all_tags()

    def add_tag(self, params: Dict[str, Any]) -> List[str]:
        return projects.add_tag(params.get("tag", ""))

    def delete_tag(self, params: Dict[str, Any]) -> List[str]:
        return projects.delete_tag(params.get("tag", ""))

    def toggle_project_tag(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return projects.toggle_project_tag(params.get("projectId", ""), params.get("tag", ""))
