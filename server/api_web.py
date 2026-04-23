from fastapi import APIRouter, Request, HTTPException
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
import sys
import os

# Add crates to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "crates"))
from crates.backend.api import Api

router = APIRouter(prefix="/api")
backend_api = Api()

class EmptyRequest(BaseModel):
    pass

class PathRequest(BaseModel):
    path: str

class ContentRequest(BaseModel):
    path: str
    content: str

class CopyFilesRequest(BaseModel):
    paths: List[str]
    target: str

class ConversationIdRequest(BaseModel):
    conversationId: str

class ToolConfirmationRequest(BaseModel):
    sessionId: str
    requestId: int
    toolCallId: str
    outcome: str

class CommandRequest(BaseModel):
    command: str

class GenerateTitleRequest(BaseModel):
    message: str
    model: Optional[str] = None

class VersionCreateRequest(BaseModel):
    path: str
    message: str
    name: Optional[str] = None

class VersionActionRequest(BaseModel):
    path: str
    versionId: str

class SearchChatsRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None

class DeleteProjectRequest(BaseModel):
    projectId: str

class ReadFileOptionsRequest(BaseModel):
    path: str
    forceText: bool

class McpServerConfigRequest(BaseModel):
    config: Dict[str, Any]

class LaunchMcpRequest(BaseModel):
    path: Optional[str] = None

@router.get("/check-cli-installed")
def check_cli_installed():
    return backend_api.check_cli_installed()

@router.get("/qwen-installed")
def qwen_installed():
    return backend_api.is_qwen_installed()

@router.post("/install-qwen")
def install_qwen():
    return backend_api.install_qwen()

@router.get("/python-installed")
def python_installed():
    return backend_api.is_python_installed()

@router.post("/install-python")
def install_python():
    return backend_api.install_python()

@router.post("/kill-process")
def kill_process(req: ConversationIdRequest):
    backend_api.kill_process({"conversationId": req.conversationId})
    return {"ok": True}

@router.post("/tool-confirmation")
def tool_confirmation(req: ToolConfirmationRequest):
    backend_api.send_tool_call_confirmation_response({
        "sessionId": req.sessionId,
        "requestId": req.requestId,
        "toolCallId": req.toolCallId,
        "outcome": req.outcome
    })
    return {"ok": True}

@router.post("/execute-command")
def execute_command(req: CommandRequest):
    return backend_api.execute_confirmed_command({"command": req.command})

@router.post("/generate-title")
def generate_title(req: GenerateTitleRequest):
    return backend_api.generate_conversation_title({"message": req.message, "model": req.model})

@router.post("/validate-directory")
def validate_directory(req: PathRequest):
    return backend_api.validate_directory({"path": req.path})

@router.post("/is-home-directory")
def is_home_directory(req: PathRequest):
    return backend_api.is_home_directory({"path": req.path})

@router.post("/get-parent-directory")
def get_parent_directory(req: PathRequest):
    return backend_api.get_parent_directory({"path": req.path})

@router.get("/get-home-directory")
def get_home_directory():
    return backend_api.get_home_directory()

@router.post("/list-directory")
def list_directory(req: PathRequest):
    return backend_api.list_directory_contents({"path": req.path})

@router.post("/list-files-recursive")
def list_files_recursive(req: PathRequest):
    return backend_api.list_files_recursive({"path": req.path})

@router.get("/list-volumes")
def list_volumes():
    return backend_api.list_volumes()

@router.post("/get-version-info")
def get_version_info(req: PathRequest):
    return backend_api.get_version_info({"path": req.path})

@router.post("/version-list")
async def version_list(request: Request):
    data = await request.json()
    return backend_api.version_list(data)

@router.post("/version-restore")
def version_restore(req: VersionActionRequest):
    return backend_api.version_restore({"path": req.path, "versionId": req.versionId})

@router.post("/version-delete")
def version_delete(req: VersionActionRequest):
    return backend_api.version_delete({"path": req.path, "versionId": req.versionId})

@router.post("/version-init")
def version_init(req: PathRequest):
    return backend_api.version_init({"path": req.path})

@router.post("/version-create")
def version_create(req: VersionCreateRequest):
    return backend_api.version_create({"path": req.path, "message": req.message, "name": req.name})

@router.get("/recent-chats")
def recent_chats():
    return backend_api.get_recent_chats()

@router.post("/search-chats")
def search_chats(req: SearchChatsRequest):
    return backend_api.search_chats({"query": req.query, "filters": req.filters})

@router.get("/projects/{project_id}/discussions")
def project_discussions(project_id: str):
    return backend_api.get_project_discussions({"projectId": project_id})

@router.post("/delete-project")
def delete_project(req: DeleteProjectRequest):
    backend_api.delete_project({"projectId": req.projectId})
    return {"ok": True}

@router.post("/read-file-content")
def read_file_content(req: PathRequest):
    return backend_api.read_file_content({"path": req.path})

@router.post("/read-binary-file-as-base64")
def read_binary_file_as_base64(req: PathRequest):
    return backend_api.read_binary_file_as_base64({"path": req.path})

@router.get("/conversations/{chat_id}")
def get_detailed_conversation(chat_id: str):
    return backend_api.get_detailed_conversation({"chatId": chat_id})

@router.delete("/conversations/{chat_id}")
def delete_conversation(chat_id: str):
    backend_api.delete_conversation({"chatId": chat_id})
    return {"ok": True}

@router.post("/get-canonical-path")
def get_canonical_path(req: PathRequest):
    return backend_api.get_canonical_path({"path": req.path})

@router.post("/read-file-content-with-options")
def read_file_content_with_options(req: ReadFileOptionsRequest):
    return backend_api.read_file_content_with_options({"path": req.path, "forceText": req.forceText})

@router.post("/write-file-content")
def write_file_content(req: ContentRequest):
    return backend_api.write_file_content({"path": req.path, "content": req.content})

@router.post("/write-binary-file-content")
def write_binary_file_content(req: ContentRequest):
    return backend_api.write_binary_file_content({"path": req.path, "content": req.content})

@router.post("/copy-files")
def copy_files(req: CopyFilesRequest):
    return backend_api.copy_files({"paths": req.paths, "target": req.target})

@router.get("/get-mcp-config")
def get_mcp_config():
    return backend_api.get_mcp_config()

@router.post("/save-mcp-config")
async def save_mcp_config(request: Request):
    data = await request.json()
    return backend_api.save_mcp_config(data)

@router.post("/check-mcp-server")
def check_mcp_server(req: McpServerConfigRequest):
    return backend_api.check_mcp_server({"config": req.config})

@router.post("/mcp/launch")
def mcp_launch(req: LaunchMcpRequest):
    return backend_api.launch_qwen_mcp({"path": req.path} if req.path else None)

# --- New endpoints to replace pywebview calls ---

@router.post("/open-with-default-app")
def open_with_default_app(req: PathRequest):
    backend_api.open_with_default_app({"path": req.path})
    return {"ok": True}

@router.post("/open-with-thonny")
def open_with_thonny(req: PathRequest):
    backend_api.open_with_thonny({"path": req.path})
    return {"ok": True}

@router.get("/qwen-settings")
def get_qwen_settings():
    return backend_api.get_qwen_settings()

@router.post("/update-qwen-settings")
async def update_qwen_settings(request: Request):
    data = await request.json()
    return backend_api.update_qwen_settings(data)

@router.get("/ui-settings")
def get_ui_settings():
    return backend_api.get_ui_settings()

@router.get("/local-ip")
def get_local_ip():
    return backend_api.get_local_ip()

@router.post("/save-ui-settings")
async def save_ui_settings(request: Request):
    data = await request.json()
    return backend_api.save_ui_settings(data)

@router.post("/open-qwen-settings-in-editor")
def open_qwen_settings_in_editor():
    return backend_api.open_qwen_settings_in_editor()

@router.post("/open-qwen-folder")
def open_qwen_folder():
    return backend_api.open_qwen_folder()

@router.post("/open-model-providers-json")
def open_model_providers_json():
    return backend_api.open_model_providers_json()
