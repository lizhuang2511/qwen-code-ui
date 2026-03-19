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
    def get_model_providers(self) -> Dict[str, Any]:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_providers_file = os.path.join(base_dir, "model_providers.json")
        if not os.path.exists(model_providers_file):
            return {"providers": []}
        try:
            with open(model_providers_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read model providers: {e}")
            return {"providers": [], "error": str(e)}

    def get_env_config(self, params: Dict[str, Any]) -> Dict[str, Any]:
        key = params.get("key", "")
        if not key:
            return {"value": ""}
            
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        env_file = os.path.join(base_dir, ".env")
        
        if not os.path.exists(env_file):
            try:
                with open(env_file, "w", encoding="utf-8") as f:
                    pass
                print(f"Created missing .env file at {env_file}")
            except Exception as e:
                print(f"Failed to create .env file: {e}")
        
        try:
            import dotenv
            env_dict = dotenv.dotenv_values(env_file)
            value = env_dict.get(key)
            if value is None:
                value = os.environ.get(key, "")
            return {"value": value}
        except Exception as e:
            print(f"Failed to get env config: {e}")
            return {"value": ""}

    def save_env_config(self, params: Dict[str, Any]) -> Dict[str, Any]:
        key = params.get("key", "")
        value = params.get("value", "")
        
        if not key:
            return {"ok": False, "error": "No key provided"}
            
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        env_file = os.path.join(base_dir, ".env")
        
        try:
            import dotenv
            if not os.path.exists(env_file):
                with open(env_file, "w", encoding="utf-8") as f:
                    pass
                    
            success, k, v = dotenv.set_key(str(env_file), key, value)
            if not success:
                with open(env_file, "a", encoding="utf-8") as f:
                    f.write(f"\n{key}='{value}'\n")
                success = True
                
            dotenv.load_dotenv(env_file, override=True)
            return {"ok": success}
        except Exception as e:
            print(f"Failed to save env config: {e}")
            return {"ok": False, "error": str(e)}

    def test_connection(self, params: Dict[str, Any]) -> Dict[str, Any]:
        base_url = params.get("base_url", "")
        api_key = params.get("api_key", "")
        model = params.get("model", "")
        
        if not base_url or not api_key:
            return {"ok": False, "error": "Missing base_url or api_key"}
            
        import urllib.request
        import urllib.error
        
        # Ensure base_url doesn't end with slash
        base_url = base_url.rstrip("/")
        url = f"{base_url}/chat/completions"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        # Some providers strictly require stream parameter
        data = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 5,
            "stream": False
        }).encode("utf-8")
        
        print(f"Testing connection to {url} with model {model}")
        
        try:
            request = urllib.request.Request(url, data=data, headers=headers, method="POST")
            with urllib.request.urlopen(request, timeout=15) as response:
                response_body = response.read().decode("utf-8")
                print(f"Connection test success: {response.status}")
                response_data = json.loads(response_body)
                return {"ok": True, "data": response_data}
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            print(f"Test connection HTTPError: {e.code} - {error_body}")
            # Try to parse error body as JSON to get more details
            try:
                error_json = json.loads(error_body)
                if "error" in error_json:
                    error_msg = error_json["error"].get("message", str(error_json["error"]))
                    return {"ok": False, "error": f"HTTP {e.code}: {error_msg}"}
            except:
                pass
            return {"ok": False, "error": f"HTTP {e.code}: {error_body[:200]}"}
        except Exception as e:
            print(f"Test connection error: {e}")
            return {"ok": False, "error": str(e)}

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
        root = params.get("externalRootPath", "")
        pid = projects.ensure_project(root)
        name = os.path.basename(root) if root else "Project"
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

    def get_qwen_settings(self) -> Dict[str, Any]:
        """
        Reads the qwen cli settings file from ~/.qwen/settings.json
        """
        path = os.path.expanduser("~/.qwen/settings.json")
        if not os.path.exists(path):
            return {}
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read qwen settings: {e}")
            return {}
            
    def get_ui_settings(self) -> Dict[str, Any]:
        """
        Reads the UI settings file from ui_settings.json in the project root directory
        """
        # Get the root directory of the project (2 levels up from crates/backend/api.py)
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        path = os.path.join(base_dir, "ui_settings.json")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read ui settings: {e}")
            return {}

    def save_ui_settings(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Saves UI settings to ui_settings.json in the project root directory
        """
        # Get the root directory of the project
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        path = os.path.join(base_dir, "ui_settings.json")
        
        try:
            current_settings = {}
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content.strip():
                        current_settings = json.loads(content)
                        
            current_settings.update(params)
            
            with open(path, "w", encoding="utf-8") as f:
                json.dump(current_settings, f, indent=2, ensure_ascii=False)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def open_qwen_settings_in_editor(self) -> Dict[str, Any]:
        """
        Opens ~/.qwen/settings.json in the default text editor (notepad on Windows).
        """
        path = os.path.expanduser("~/.qwen/settings.json")
        try:
            if not os.path.exists(path):
                # Create default empty file if it doesn't exist so notepad can open it
                directory = os.path.dirname(path)
                if not os.path.exists(directory):
                    os.makedirs(directory)
                with open(path, "w", encoding="utf-8") as f:
                    f.write("{}")
            
            if sys.platform == 'win32':
                subprocess.Popen(['notepad.exe', path])
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', '-e', path])
            else:
                subprocess.Popen(['xdg-open', path])
            return {"ok": True}
        except Exception as e:
            print(f"Failed to open settings file: {e}")
            return {"ok": False, "error": str(e)}

    def open_qwen_folder(self) -> Dict[str, Any]:
        """
        Opens the ~/.qwen directory in the system's file manager.
        """
        path = os.path.expanduser("~/.qwen")
        try:
            if not os.path.exists(path):
                os.makedirs(path)
                
            if sys.platform == 'win32':
                os.startfile(path)
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', path])
            else:
                subprocess.Popen(['xdg-open', path])
            return {"ok": True}
        except Exception as e:
            print(f"Failed to open qwen folder: {e}")
            return {"ok": False, "error": str(e)}

    def open_model_providers_json(self) -> Dict[str, Any]:
        """
        Opens the model_providers.json file in the default text editor.
        """
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        path = os.path.join(base_dir, "model_providers.json")
        try:
            if not os.path.exists(path):
                return {"ok": False, "error": "model_providers.json not found"}
                
            if sys.platform == 'win32':
                subprocess.Popen(['notepad.exe', path])
            elif sys.platform == 'darwin':
                subprocess.Popen(['open', '-e', path])
            else:
                subprocess.Popen(['xdg-open', path])
            return {"ok": True}
        except Exception as e:
            print(f"Failed to open model_providers.json: {e}")
            return {"ok": False, "error": str(e)}

    def update_qwen_settings(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Updates the ~/.qwen/settings.json file with new configuration.
        Expected params:
        - provider_id: string (e.g., "qwen-max", "Qwen/Qwen2.5-7B-Instruct")
        - provider_name: string (optional)
        - base_url: string
        - api_key: string
        - env_key: string (optional, defaults to "DASHSCOPE_API_KEY" or similar)
        """
        path = os.path.expanduser("~/.qwen/settings.json")
        directory = os.path.dirname(path)
        
        if not os.path.exists(directory):
            try:
                os.makedirs(directory)
            except Exception as e:
                return {"ok": False, "error": f"Failed to create config directory: {e}"}
        
        # Read existing or create default
        settings = {}
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content.strip():
                        settings = json.loads(content)
            except Exception as e:
                print(f"Warning: Failed to read existing settings, overwriting. Error: {e}")
        
        # Ensure structure
        if "env" not in settings:
            settings["env"] = {}
        if "modelProviders" not in settings:
            settings["modelProviders"] = {}
        if "openai" not in settings["modelProviders"]:
            settings["modelProviders"]["openai"] = []
        if "model" not in settings:
            settings["model"] = {}
            
        provider_id = params.get("provider_id", "")
        base_url = params.get("base_url", "")
        api_key = params.get("api_key", "")
        # env_key is the key NAME used in "env" section, not the value
        # If not provided, we can generate one or reuse existing if found
        env_key = params.get("env_key", "")
        use_oauth = params.get("use_oauth", False)
        enable_thinking = params.get("enable_thinking", False)
        
        if not use_oauth and (not provider_id or not base_url or not api_key):
            return {"ok": False, "error": "Missing required fields (provider_id, base_url, api_key)"}

        # Handle OAuth mode
        if use_oauth:
            if "security" not in settings:
                settings["security"] = {}
            if "auth" not in settings["security"]:
                settings["security"]["auth"] = {}
            settings["security"]["auth"]["selectedType"] = "qwen-oauth"
            
            if "model" not in settings:
                settings["model"] = {}
            settings["model"]["name"] = "coder-model"
            
            # Ensure version
            settings["$version"] = 3
            
            # Write back
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(settings, f, indent=2, ensure_ascii=False)
                return {"ok": True}
            except Exception as e:
                return {"ok": False, "error": str(e)}

        # Generate unique env_key if not provided or default
        if not env_key or env_key == "CUSTOM_API_KEY":
             import re
             # Create a safe key based on provider_id to avoid collisions
             safe_id = re.sub(r'[^a-zA-Z0-9_]', '_', provider_id).upper()
             env_key = f"API_KEY_{safe_id}"

        # 1. Update env section
        settings["env"][env_key] = api_key
        
        # 2. Update modelProviders
        openai_providers = settings["modelProviders"]["openai"]
        
        def norm_url(u):
            return u.rstrip("/") if u else ""
            
        target_url = norm_url(base_url)
        
        # Clean up duplicates with the same id OR same base_url (to ensure one config per provider endpoint)
        new_providers = []
        for p in openai_providers:
            p_id = p.get("id")
            p_url = norm_url(p.get("baseUrl", ""))
            
            # Keep if it's not the same ID AND not the same URL
            # This ensures we don't have multiple entries for the same provider URL (cleaning up previous configs for that provider)
            if p_id != provider_id and p_url != target_url:
                new_providers.append(p)
        
        new_provider_config = {
            "id": provider_id,
            "name": params.get("provider_name", provider_id),
            "baseUrl": base_url,
            "envKey": env_key,
            "generationConfig": {
                "maxRetries": 3,
                "timeout": 60000,
                "samplingParams": {
                    "temperature": 0.5,
                    "max_tokens": 4096,
                    "top_p": 0.95
                }
            }
        }

        if enable_thinking:
            new_provider_config["generationConfig"]["extra_body"] = {
                "enable_thinking": True
            }
            # Increase timeout for thinking models as they take longer
            new_provider_config["generationConfig"]["timeout"] = 300000
        
        new_providers.append(new_provider_config)
        settings["modelProviders"]["openai"] = new_providers
            
        # 3. Set current model
        settings["model"]["name"] = provider_id
        
        # 4. Set security auth type and version
        if "security" not in settings:
            settings["security"] = {}
        if "auth" not in settings["security"]:
            settings["security"]["auth"] = {}
            
        # Always use openai for custom providers (as per docs for OpenAI-compatible)
        settings["security"]["auth"]["selectedType"] = "openai"
        
        # Ensure $version exists based on standard qwen settings format
        settings["$version"] = 3

        # Write back
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(settings, f, indent=2, ensure_ascii=False)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

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
