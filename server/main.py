from typing import List, Dict, Any, Optional
import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv, set_key
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.requests import Request
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, Field
import secrets

# Add crates to path

sys.path.append(os.path.join(os.path.dirname(__file__), "..", "crates"))

# Load .env file
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# Auto-create .env file if it doesn't exist
if not ENV_FILE.exists():
    try:
        ENV_FILE.touch()
        logger.info(f"Created missing .env file at {ENV_FILE}")
    except Exception as e:
        logger.error(f"Failed to create .env file: {e}")

load_dotenv(ENV_FILE)

from crates.filesystem import get_home_directory
from crates.session import get_process_statuses, start_session, send_message, kill_process
import crates.events as events
import crates.projects as projects
import crates.backend.version_utils as version_utils
from .api_web import router as api_web_router

app = FastAPI()
logger = logging.getLogger("app")

class BasicAuthMiddleware(BaseHTTPMiddleware):
    def get_web_settings(self):
        try:
            settings_path = BASE_DIR / "ui_settings.json"
            if settings_path.exists():
                with open(settings_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if content.strip():
                        settings = json.loads(content)
                        return {
                            "enabled": settings.get("webEnabled", False),
                            "remoteAccess": settings.get("webRemoteAccess", False),
                            "username": settings.get("webUsername", "lizhuang"),
                            "password": settings.get("webPassword", "lizhuang")
                        }
        except Exception as e:
            logger.error(f"Failed to read web settings: {e}")
        
        return {"enabled": False, "remoteAccess": False, "username": "lizhuang", "password": "lizhuang"}

    async def dispatch(self, request: Request, call_next):
        # 1. 允许 OPTIONS 请求（CORS 预检）
        if request.method == "OPTIONS":
            return await call_next(request)
            
        # 2. 检查是不是本地访问或代理访问
        client_host = request.client.host if request.client else ""
        forwarded_for = request.headers.get("X-Forwarded-For")
        
        # 如果是本地访问且不是代理转发的，直接放行
        if client_host in ("127.0.0.1", "localhost", "::1") and not forwarded_for:
            return await call_next(request)
            
        # 获取 Web 设置
        web_settings = self.get_web_settings()
        
        # 如果 Web 访问被禁用，直接返回 403 Forbidden
        if not web_settings["enabled"]:
            return Response("Web access is disabled", status_code=403)
            
        # 检查远程访问限制
        # 如果未开启远程访问，且访问来源不是本地（或包含代理头），则拒绝访问
        if not web_settings["remoteAccess"]:
            if client_host not in ("127.0.0.1", "localhost", "::1", "0.0.0.0") or forwarded_for:
                return Response("Remote access is disabled", status_code=403)
            
        # 3. 检查 Basic Auth (对所有路由进行拦截，强制在首页就弹出登录框)
        auth = request.headers.get("Authorization")
        path = request.url.path
        
        if not auth or not auth.startswith("Basic "):
            # 如果是 WebSocket 握手，浏览器原生不支持带 Basic Auth Header，
            # 强行拦截会导致前端 WS 连接失败。所以对 WS 路径跳过 Basic Auth 拦截。
            if path == "/api/ws" and request.headers.get("upgrade", "").lower() == "websocket":
                 return await call_next(request)
            
            # 对于图标请求，避免弹窗打断
            if path == "/favicon.ico":
                return await call_next(request)
                
            return Response(
                "Unauthorized", 
                status_code=401, 
                headers={"WWW-Authenticate": "Basic realm=\"Login Required\""}
            )
        
        try:
            decoded = base64.b64decode(auth[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
            
            # 使用 compare_digest 防止计时攻击
            is_valid_user = secrets.compare_digest(username, web_settings["username"])
            is_valid_pass = secrets.compare_digest(password, web_settings["password"])
            
            if not (is_valid_user and is_valid_pass):
                raise ValueError()
        except Exception:
            return Response(
                "Unauthorized", 
                status_code=401, 
                headers={"WWW-Authenticate": "Basic realm=\"Login Required\""}
            )
            
        return await call_next(request)

app.add_middleware(BasicAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_web_router)


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        write_debug_log(f"[manager] client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            write_debug_log(f"[manager] client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]):
        event_name = message.get("event")
        connection_count = len(self.active_connections)
        log_msg = f"[broadcast] event={event_name} targets={connection_count}"
        logger.debug(log_msg)
        write_debug_log(log_msg)
        
        # Use a copy of the list to avoid modification during iteration
        for i, connection in enumerate(list(self.active_connections)):
            try:
                write_debug_log(f"[broadcast] sending to connection {i}")
                await connection.send_json(message)
                write_debug_log(f"[broadcast] successfully sent to connection {i}")
            except Exception as e:
                write_debug_log(f"[broadcast] error sending to connection {i}: {e}")
                # If sending fails, we might assume the connection is dead,
                # but we'll let the receive loop handle the disconnect cleanup.
                pass

manager = ConnectionManager()

import json
from datetime import datetime

def write_debug_log(msg: str):
    """Write debug logs to a file in the root directory for troubleshooting."""
    try:
        log_path = BASE_DIR / "debug_websocket.log"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass

def event_bridge(event: str, payload: Any):
    """
    Callback triggered by crates.events.emit (running in a thread).
    Schedules the broadcast on the main asyncio loop.
    """
    # Log a compact payload summary to avoid noisy output
    if isinstance(payload, dict):
        keys = list(payload.keys())
        summary = {"keys": keys[:8], "size": len(keys)}
    else:
        summary = {"type": type(payload).__name__}
        
    log_msg = f"[bridge] event={event} payload_summary={summary}"
    logger.debug(log_msg)
    write_debug_log(log_msg)
    
    if manager.loop and not manager.loop.is_closed():
        write_debug_log(f"[bridge] scheduling broadcast for {event}")
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"event": event, "payload": payload}), 
            manager.loop
        )
    else:
        write_debug_log(f"[bridge] manager.loop is not available or closed! event={event}")

# Register the bridge with the events system
import crates.events as crates_events
import sys
# If 'events' is also loaded as a top-level module (e.g. by crates/session.py doing `import events`),
# we need to set the handler there too to ensure it works across the board.
if "events" in sys.modules:
    sys.modules["events"].set_event_handler(event_bridge)
if "crates.events" in sys.modules:
    sys.modules["crates.events"].set_event_handler(event_bridge)
crates_events.set_event_handler(event_bridge)

# Removed duplicate @app.get("/api/get-home-directory") as it's better placed in api_web.py or handled consistently

@app.get("/api/process-statuses")
def api_process_statuses() -> List[Dict[str, Any]]:
    return get_process_statuses()

@app.get("/api/projects-enriched")
def api_list_enriched_projects() -> List[Dict[str, Any]]:
    return projects.list_enriched_projects()

@app.get("/api/projects")
def api_list_projects(limit: int = 25, offset: int = 0) -> Dict[str, Any]:
    return projects.list_projects(limit, offset)

class ProjectRequest(BaseModel):
    sha256: str
    root_path: str = Field(..., alias="rootPath")

@app.post("/api/project")
def api_upsert_project(req: ProjectRequest) -> Dict[str, Any]:
    name = os.path.basename(req.root_path) if req.root_path else "Project"
    pid = projects.ensure_project(req.root_path)
    return {
        "sha256": pid,
        "root_path": req.root_path,
        "metadata": {
            "path": req.root_path,
            "sha256": pid,
            "friendly_name": name,
        },
    }

class DeleteProjectRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")

@app.delete("/api/project")
def api_delete_project(req: DeleteProjectRequest) -> Dict[str, Any]:
    projects.delete_project(req.project_id)
    return {"ok": True}

@app.get("/api/tags")
def api_get_tags() -> List[str]:
    return projects.get_all_tags()

class TagRequest(BaseModel):
    tag: str

@app.post("/api/tags")
def api_add_tag(req: TagRequest) -> List[str]:
    return projects.add_tag(req.tag)

@app.delete("/api/tags")
def api_delete_tag(tag: str) -> List[str]:
    return projects.delete_tag(tag)

class ToggleTagRequest(BaseModel):
    projectId: str
    tag: str

@app.post("/api/project/toggle-tag")
def api_toggle_tag(req: ToggleTagRequest) -> Dict[str, Any]:
    return projects.toggle_project_tag(req.projectId, req.tag)

@app.get("/api/skills")
def api_get_skills() -> List[str]:
    return projects.get_all_skills()

class SkillRequest(BaseModel):
    skill: str

@app.post("/api/skills")
def api_add_skill(req: SkillRequest) -> List[str]:
    return projects.add_skill(req.skill)

@app.delete("/api/skills")
def api_delete_skill(skill: str) -> List[str]:
    return projects.delete_skill(skill)

class ToggleSkillRequest(BaseModel):
    projectId: str
    skill: str

@app.post("/api/project/toggle-skill")
def api_toggle_skill(req: ToggleSkillRequest) -> Dict[str, Any]:
    return projects.toggle_project_skill(req.projectId, req.skill)

class RemoveSkillRequest(BaseModel):
    projectId: str
    skill: str

@app.post("/api/project/remove-skill")
def api_remove_skill(req: RemoveSkillRequest) -> Dict[str, Any]:
    return projects.remove_project_skill(req.projectId, req.skill)

class ImportSkillsRequest(BaseModel):
    projectId: str
    skills: List[str]

@app.post("/api/project/import-skills")
def api_import_skills(req: ImportSkillsRequest) -> Dict[str, Any]:
    return projects.import_project_skills(req.projectId, req.skills)

@app.get("/api/skill-content")
def api_skill_content(skill: str, projectPath: str = "") -> Dict[str, Any]:
    return projects.get_skill_content(skill, projectPath)

@app.websocket("/api/ws")
async def websocket_endpoint(ws: WebSocket):
    # Ensure we have a reference to the running loop for the bridge
    if manager.loop is None:
        manager.loop = asyncio.get_running_loop()
        
    await manager.connect(ws)
    logger.info("[ws] connection accepted")
    
    try:
        # Send initial status on connect
        payload = get_process_statuses()
        await ws.send_json({"event": "process-status-changed", "payload": payload, "sequence": 1})
        
        while True:
            # Receive and process messages
            data = await ws.receive_json()
            logger.debug(f"[ws] received command payload={data}")
            
            # Allow passing array of commands or single command
            if isinstance(data, list):
                commands = data
            else:
                commands = [data]
                
            for cmd_data in commands:
                command = cmd_data.get("command")
                session_id = cmd_data.get("session_id")
                logger.info(f"[ws] command={command} session_id={session_id}")
                
                if command == "start-session":
                    start_session(
                        session_id=session_id,
                        working_directory=cmd_data.get("working_directory"),
                        model=cmd_data.get("model"),
                        backend=cmd_data.get("backend"),
                        backend_config=cmd_data.get("backend_config")
                    )
                    
                elif command == "send-message":
                    message = cmd_data.get("message")
                    if session_id and message:
                        send_message(session_id, message)
                
                elif command == "kill-process":
                    if session_id:
                        kill_process(session_id)
                    
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        # Catch other runtime errors to avoid crashing the server loop
        manager.disconnect(ws)
        logger.error("[ws] unexpected error; disconnecting")

class StartSessionRequest(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    working_directory: Optional[str] = Field(default=None)
    model: Optional[str] = Field(default=None)
    backend: Optional[str] = Field(default=None)
    backend_config: Optional[Dict[str, Any]] = Field(default=None)

class SendMessageRequest(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    message: str
    images: Optional[List[Dict[str, str]]] = None # Can contain both image and non-image files now

@app.post("/api/start-session")
def api_start_session(req: StartSessionRequest) -> Dict[str, Any]:
    logger.info(
        "[rest] start-session",
        extra={"session_id": req.session_id, "backend": req.backend, "model": req.model},
    )
    # Basic validation via conditions (no try/except)
    if not req.session_id:
        return {"ok": False, "error": "missing sessionId"}
    start_session(
        session_id=req.session_id,
        working_directory=req.working_directory,
        model=req.model,
        backend=req.backend,
        backend_config=req.backend_config,
    )
    return {"ok": True}

@app.post("/api/send-message")
def api_send_message(req: SendMessageRequest) -> Dict[str, Any]:
    size = len(req.message or "")
    logger.info(
        "[rest] send-message",
        extra={"session_id": req.session_id, "size": size},
    )
    if not req.session_id or (not req.message and not req.images):
        return {"ok": False, "error": "missing sessionId or message"}
    send_message(req.session_id, req.message, req.images)
    return {"ok": True}

class ExcludedPathsRequest(BaseModel):
    path: str
    excluded: Optional[List[str]] = None

@app.post("/api/get-excluded-paths")
def api_get_excluded_paths(req: ExcludedPathsRequest) -> List[str]:
    return version_utils.get_excluded_paths(req.path)

@app.post("/api/save-excluded-paths")
def api_save_excluded_paths(req: ExcludedPathsRequest) -> bool:
    if req.excluded is None:
        return False
    return version_utils.update_excluded_paths(req.path, req.excluded)

@app.get("/api/model-providers")
def api_get_model_providers():
    model_providers_file = BASE_DIR / "model_providers.json"
    if not model_providers_file.exists():
        return {"providers": []}
    try:
        with open(model_providers_file, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read model providers: {e}")
        return {"providers": [], "error": str(e)}

class EnvConfig(BaseModel):
    key: str
    value: str

@app.post("/api/save-env-config")
def api_save_env_config(config: EnvConfig):
    try:
        # If file doesn't exist, create it
        if not ENV_FILE.exists():
            ENV_FILE.touch()
            
        logger.info(f"Saving to env file: {ENV_FILE}")
        
        # Use set_key to update .env file
        success, key, value = set_key(str(ENV_FILE), config.key, config.value)
        
        # If set_key fails or returns False/None, we can try to append it manually
        if not success:
            with open(ENV_FILE, "a", encoding="utf-8") as f:
                f.write(f"\n{config.key}='{config.value}'\n")
            success = True
            
        # Reload env to update os.environ for current process
        load_dotenv(ENV_FILE, override=True)
        
        return {"ok": success}
    except Exception as e:
        logger.error(f"Failed to save env config: {e}")
        return {"ok": False, "error": str(e)}

@app.get("/api/get-env-config")
def api_get_env_config(key: str):
    try:
        # Load from .env file directly if it exists
        import dotenv
        env_dict = dotenv.dotenv_values(ENV_FILE)
        value = env_dict.get(key)
        
        if value is None:
            # Fallback to os.environ
            value = os.environ.get(key, "")
            
        return {"value": value}
    except Exception as e:
        logger.error(f"Failed to get env config: {e}")
        return {"value": ""}

class TestConnectionRequest(BaseModel):
    base_url: str
    api_key: str
    model: str

@app.post("/api/test-connection")
def api_test_connection(req: TestConnectionRequest):
    import urllib.request
    import urllib.error
    
    # Ensure base_url doesn't end with slash
    base_url = req.base_url.rstrip("/")
    url = f"{base_url}/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {req.api_key}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    # Some providers strictly require stream parameter
    data = json.dumps({
        "model": req.model,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 5,
        "stream": False
    }).encode("utf-8")
    
    logger.info(f"Testing connection to {url} with model {req.model}")
    
    try:
        request = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(request, timeout=15) as response:
            response_body = response.read().decode("utf-8")
            logger.info(f"Connection test success: {response.status}")
            response_data = json.loads(response_body)
            return {"ok": True, "data": response_data}
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        logger.error(f"Test connection HTTPError: {e.code} - {error_body}")
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
        logger.error(f"Test connection error: {e}")
        return {"ok": False, "error": str(e)}

# Mount frontend build as static files
frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")

@app.exception_handler(404)
async def custom_404_handler(request: Request, exc: Exception):
    # For SPA, return index.html for unknown routes if not an /api route
    if not request.url.path.startswith("/api/") and frontend_dist.exists():
        index_file = frontend_dist / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))
    return JSONResponse(status_code=404, content={"message": "Not Found"})


