from typing import List, Dict, Any, Optional
import os
import sys
import json
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add crates to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "crates"))

from crates.filesystem import get_home_directory
from crates.session import get_process_statuses, start_session, send_message, kill_process
import crates.events as events
import crates.projects as projects

app = FastAPI()
logger = logging.getLogger("app")

origins = ["http://localhost:1420", "http://127.0.0.1:1420"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        event_name = message.get("event")
        connection_count = len(self.active_connections)
        logger.debug(f"[broadcast] event={event_name} targets={connection_count}")
        # Use a copy of the list to avoid modification during iteration
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                # If sending fails, we might assume the connection is dead,
                # but we'll let the receive loop handle the disconnect cleanup.
                pass

manager = ConnectionManager()

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
    logger.debug(f"[bridge] event={event} payload_summary={summary}")
    if manager.loop and not manager.loop.is_closed():
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"event": event, "payload": payload}), 
            manager.loop
        )

# Register the bridge with the events system
events.set_event_handler(event_bridge)

@app.get("/api/get-home-directory")
def api_get_home_directory() -> str:
    return get_home_directory()

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
    projects.upsert_project(req.sha256, req.root_path, name)
    return {
        "sha256": req.sha256,
        "root_path": req.root_path,
        "metadata": {
            "path": req.root_path,
            "sha256": req.sha256,
            "friendly_name": name,
        },
    }

class DeleteProjectRequest(BaseModel):
    project_id: str = Field(..., alias="projectId")

@app.delete("/api/project")
def api_delete_project(req: DeleteProjectRequest) -> Dict[str, Any]:
    projects.delete_project(req.project_id)
    return {"ok": True}

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
            command = data.get("command")
            session_id = data.get("session_id")
            logger.info(f"[ws] command={command} session_id={session_id}")
            if command == "start-session":
                start_session(
                    session_id=session_id,
                    working_directory=data.get("working_directory"),
                    model=data.get("model"),
                    backend=data.get("backend"),
                    backend_config=data.get("backend_config")
                )
                
            elif command == "send-message":
                message = data.get("message")
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
    if not req.session_id or not req.message:
        return {"ok": False, "error": "missing sessionId or message"}
    send_message(req.session_id, req.message)
    return {"ok": True}
