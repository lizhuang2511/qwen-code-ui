from typing import Optional, Dict, Any, List
import os
import subprocess
import shutil
import shlex
import events
import filesystem
import search
import projects
import session
import webview

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

    def get_git_info(self, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return None

    def read_file_content(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return filesystem.read_file_content(params.get("path", ""))

    def read_binary_file_as_base64(self, params: Dict[str, Any]) -> str:
        return filesystem.read_binary_file_as_base64(params.get("path", ""))

    def get_detailed_conversation(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return search.get_detailed_conversation(params.get("chatId", ""))

    def delete_conversation(self, params: Dict[str, Any]) -> None:
        return None

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
