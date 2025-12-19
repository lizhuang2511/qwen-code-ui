from typing import List, Dict, Optional, Any
from pathlib import Path
import json
import os
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"
DEFAULT_PROJECT_ID = "default"

def _get_project_dir(project_id: str = DEFAULT_PROJECT_ID) -> Path:
    return PROJECTS_DIR / project_id

def _parse_timestamp_from_filename(filename: str) -> Optional[int]:
    """Parse timestamp from filename format rpc-log-<timestamp>.log"""
    if filename.startswith("rpc-log-") and filename.endswith(".log"):
        try:
            ts_str = filename[8:-4]
            # Handle both numeric timestamp and session ID (if not numeric)
            # The Rust code expects u64 timestamp.
            # If our session_id is not a timestamp, we might need file creation time.
            if ts_str.isdigit():
                return int(ts_str)
            return 0 # Fallback
        except ValueError:
            return None
    return None

def _read_log_file(log_path: Path) -> List[Dict[str, Any]]:
    lines = []
    if not log_path.exists():
        return lines
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line: continue
                try:
                    data = json.loads(line)
                    lines.append(data)
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        print(f"Error reading log file {log_path}: {e}")
    return lines

def get_recent_chats() -> List[Dict]:
    project_dir = _get_project_dir()
    print(f"[Search] Scanning project dir for chats: {project_dir}")
    if not project_dir.exists():
        print(f"[Search] Project dir does not exist: {project_dir}")
        return []
    
    chats = []
    for entry in project_dir.iterdir():
        if entry.is_file() and entry.name.startswith("rpc-log-") and entry.name.endswith(".log"):
            print(f"[Search] Found log file: {entry.name}")
            log_content = _read_log_file(entry)
            if not log_content:
                print(f"[Search] Log file empty or invalid: {entry.name}")
                continue
                
            # Extract info from logs
            title = "Chat Session"
            started_at_iso = ""
            message_count = 0
            
            # Try to find first user message for title
            for item in log_content:
                method = item.get("method")
                timestamp = item.get("timestamp")
                
                if not started_at_iso and timestamp:
                    started_at_iso = timestamp
                
                if method == "session/prompt":
                    message_count += 1
                    params = item.get("params", {})
                    prompt = params.get("prompt", [])
                    if prompt and isinstance(prompt, list):
                        for part in prompt:
                            if part.get("type") == "text":
                                text = part.get("text", "")
                                if text:
                                    if title == "Chat Session":
                                        title = text[:50] + "..." if len(text) > 50 else text
                                    break
                
                # Count assistant turns (approximate by agent_message_chunk groups or turn_finished)
                # Rust counts session/prompt + result with stopReason
                if "result" in item and "stopReason" in item["result"]:
                    message_count += 1

            if not started_at_iso:
                # Fallback to file creation time
                try:
                    started_at_iso = datetime.fromtimestamp(entry.stat().st_ctime).isoformat() + "Z"
                except Exception as e:
                    print(f"[Search] Error getting file time for {entry.name}: {e}")

            chats.append({
                "id": entry.name.replace("rpc-log-", "").replace(".log", ""),
                "title": title,
                "started_at_iso": started_at_iso,
                "message_count": message_count,
            })
    
    print(f"[Search] Found {len(chats)} chats")
    # Sort by started_at desc
    chats.sort(key=lambda x: x["started_at_iso"], reverse=True)
    return chats

def search_chats(query: str, filters: Optional[Dict]) -> List[Dict]:
    project_dir = _get_project_dir()
    if not project_dir.exists():
        return []
        
    results = []
    q = query.lower() if query else ""
    
    for entry in project_dir.iterdir():
        if entry.is_file() and entry.name.startswith("rpc-log-") and entry.name.endswith(".log"):
            log_content = _read_log_file(entry)
            matches = []
            
            # Reconstruct simplified history for searching
            # This is a basic search implementation
            line_no = 1
            for item in log_content:
                content = ""
                role = "unknown"
                timestamp = item.get("timestamp", "")
                
                method = item.get("method")
                if method == "session/prompt":
                    role = "user"
                    params = item.get("params", {})
                    prompt = params.get("prompt", [])
                    for part in prompt:
                        if part.get("type") == "text":
                            content += part.get("text", "")
                elif method == "session/update":
                    update = item.get("params", {}).get("update", {})
                    if update.get("sessionUpdate") == "agent_message_chunk":
                        role = "assistant"
                        content = update.get("content", {}).get("text", "")
                
                if q and content and (q in content.lower()):
                    matches.append({
                        "content_snippet": content[:200],
                        "line_number": line_no,
                        "role": role,
                        "timestamp_iso": timestamp,
                    })
                line_no += 1
            
            if matches:
                # Need basic chat info
                chat_id = entry.name.replace("rpc-log-", "").replace(".log", "")
                results.append({
                    "chat": {
                        "id": chat_id,
                        "title": "Search Result", # Simplified
                        "started_at_iso": "",
                        "message_count": 0
                    },
                    "matches": matches,
                    "relevance_score": float(len(matches))
                })
                
    return results

def get_detailed_conversation(chat_id: str) -> Dict:
    # Check if chat_id contains project info (not yet supported in python version, assumes default)
    # File path: rpc-log-{chat_id}.log
    log_path = _get_project_dir() / f"rpc-log-{chat_id}.log"
    
    if not log_path.exists():
        # Try legacy path just in case? No, strict cutover.
        return {
            "chat": {"id": chat_id, "title": "Conversation not found", "started_at_iso": "", "message_count": 0},
            "messages": [],
            "file_references": [],
            "tool_calls_count": 0,
        }

    log_content = _read_log_file(log_path)
    
    messages = []
    file_references = set()
    tool_calls_count = 0
    
    # State machine for reconstruction
    current_assistant_message = None
    
    for item in log_content:
        method = item.get("method")
        timestamp = item.get("timestamp", "")
        
        if method == "session/prompt":
            # User message
            params = item.get("params", {})
            prompt = params.get("params", {}).get("prompt", []) # Wait, structure is params -> prompt list
            # Rust: params: { prompt: [ { text: ... } ] }
            # My logger: params: { prompt: [ { type: text, text: ... } ] }
            prompt = params.get("prompt", [])
            
            text_content = ""
            for part in prompt:
                if part.get("type") == "text":
                    text_content += part.get("text", "")
            
            if text_content:
                messages.append({
                    "id": f"msg_{len(messages)}",
                    "role": "user",
                    "content": text_content,
                    "timestamp_iso": timestamp,
                    "message_type": "text",
                    "parts": [{"type": "text", "text": text_content}] # Keep parts for frontend compatibility
                })
                
        elif method == "session/update":
            update = item.get("params", {}).get("update", {})
            update_type = update.get("sessionUpdate")
            
            if update_type == "agent_message_chunk":
                content = update.get("content", {})
                text = content.get("text", "")
                if text:
                    # Aggregate
                    if messages and messages[-1]["role"] == "assistant" and messages[-1]["message_type"] == "text":
                        messages[-1]["content"] += text
                        # Update parts too
                        if messages[-1]["parts"] and messages[-1]["parts"][0]["type"] == "text":
                            messages[-1]["parts"][0]["text"] += text
                    else:
                        messages.append({
                            "id": f"msg_{len(messages)}",
                            "role": "assistant",
                            "content": text,
                            "timestamp_iso": timestamp,
                            "message_type": "text",
                            "parts": [{"type": "text", "text": text}]
                        })
            
            elif update_type == "tool_call":
                tool_calls_count += 1
                tool_name = update.get("toolName", "unknown")
                # Add tool call message
                messages.append({
                    "id": f"msg_{len(messages)}",
                    "role": "assistant",
                    "content": f"Called tool: {tool_name}",
                    "timestamp_iso": timestamp,
                    "message_type": "tool_call",
                    "parts": [{"type": "text", "text": f"Called tool: {tool_name}"}]
                })
                
        # Handle other types like tool results if logged
    
    # Metadata
    title = "Conversation"
    if messages and messages[0]["role"] == "user":
        title = messages[0]["content"][:50]
        
    return {
        "chat": {
            "id": chat_id,
            "title": title,
            "started_at_iso": messages[0]["timestamp_iso"] if messages else "",
            "message_count": len(messages)
        },
        "messages": messages,
        "file_references": list(file_references),
        "tool_calls_count": tool_calls_count
    }

def get_project_discussions(project_id: str) -> List[Dict]:
    # Reuse get_recent_chats but for specific project
    # Currently we only support default project in this python implementation
    if project_id == "default":
        return get_recent_chats()
    return []
