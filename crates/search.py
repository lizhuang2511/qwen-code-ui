from typing import List, Dict, Optional, Any
from pathlib import Path
import json
import os
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_DIR = DATA_DIR / "projects"

def _parse_timestamp_from_filename(filename: str) -> Optional[int]:
    """Parse timestamp from filename format rpc-log-<timestamp>.log"""
    if filename.startswith("rpc-log-") and filename.endswith(".log"):
        try:
            ts_str = filename[8:-4]
            # Handle both numeric timestamp and session ID (if not numeric)
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

def _scan_log_header(log_path: Path) -> tuple[str, int]:
    """
    Lightweight scan of log file to get title and message count without full parsing.
    """
    title = "Chat Session"
    count = 0
    
    try:
        # 1. Quick title scan (first 4KB or 50 lines)
        with open(log_path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                if i > 50: break
                if "session/prompt" in line:
                    try:
                        data = json.loads(line)
                        if data.get("method") == "session/prompt":
                            prompt = data.get("params", {}).get("prompt", [])
                            for part in prompt:
                                if part.get("type") == "text":
                                    text = part.get("text", "")
                                    if text:
                                        title = text[:50] + "..." if len(text) > 50 else text
                                        break
                            if title != "Chat Session": break
                    except: pass
    except: pass

    # 2. Fast line counting (approximate message count)
    try:
        # Only count for files < 5MB to avoid IO blocking
        if log_path.stat().st_size < 5 * 1024 * 1024:
            with open(log_path, "rb") as f:
                count = sum(1 for _ in f)
    except: pass
    
    return title, count

def get_recent_chats() -> List[Dict]:
    # print(f"[Search] Scanning projects dir for chats: {PROJECTS_DIR}")
    if not PROJECTS_DIR.exists():
        return []
    
    chats = []
    
    # Iterate over all project directories
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
            
        # Scan logs in this project dir
        for entry in project_dir.iterdir():
            if entry.is_file() and entry.name.startswith("rpc-log-") and entry.name.endswith(".log"):
                # Optimize: Get timestamp from filename first
                started_at_iso = ""
                ts = _parse_timestamp_from_filename(entry.name)
                if ts:
                    try:
                        # Convert to ISO format
                        started_at_iso = datetime.utcfromtimestamp(ts / 1000.0 if ts > 1e11 else ts).isoformat() + "Z"
                    except: pass
                
                if not started_at_iso:
                    try:
                        started_at_iso = datetime.fromtimestamp(entry.stat().st_ctime).isoformat() + "Z"
                    except: pass

                # Lightweight scan instead of full read
                title, message_count = _scan_log_header(entry)
                
                chats.append({
                    "id": entry.name.replace("rpc-log-", "").replace(".log", ""),
                    "title": title,
                    "started_at_iso": started_at_iso,
                    "message_count": message_count,
                    "project_id": project_dir.name
                })
    
    # print(f"[Search] Found {len(chats)} chats across all projects")
    # Sort by started_at desc
    chats.sort(key=lambda x: x["started_at_iso"], reverse=True)
    return chats

def search_chats(query: str, filters: Optional[Dict]) -> List[Dict]:
    if not PROJECTS_DIR.exists():
        return []
        
    results = []
    q = query.lower() if query else ""
    
    # Iterate over all project directories
    for project_dir in PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
            
        for entry in project_dir.iterdir():
            if entry.is_file() and entry.name.startswith("rpc-log-") and entry.name.endswith(".log"):
                log_content = _read_log_file(entry)
                matches = []
                
                # Reconstruct simplified history for searching
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
                    chat_id = entry.name.replace("rpc-log-", "").replace(".log", "")
                    results.append({
                        "chat": {
                            "id": chat_id,
                            "title": "Search Result",
                            "started_at_iso": "",
                            "message_count": 0,
                            "project_id": project_dir.name
                        },
                        "matches": matches,
                        "relevance_score": float(len(matches))
                    })
                
    return results

def get_detailed_conversation(chat_id: str) -> Dict:
    # Find the log file in any project directory
    log_path = None
    project_id_found = None
    
    if PROJECTS_DIR.exists():
        for project_dir in PROJECTS_DIR.iterdir():
            if not project_dir.is_dir():
                continue
            potential_path = project_dir / f"rpc-log-{chat_id}.log"
            if potential_path.exists():
                log_path = potential_path
                project_id_found = project_dir.name
                break
    
    if not log_path or not log_path.exists():
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
    
    for item in log_content:
        method = item.get("method")
        timestamp = item.get("timestamp", "")
        
        if method == "session/prompt":
            # User message
            params = item.get("params", {})
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
                    "parts": [{"type": "text", "text": text_content}]
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
                messages.append({
                    "id": f"msg_{len(messages)}",
                    "role": "assistant",
                    "content": f"Called tool: {tool_name}",
                    "timestamp_iso": timestamp,
                    "message_type": "tool_call",
                    "parts": [{"type": "text", "text": f"Called tool: {tool_name}"}]
                })
    
    title = "Conversation"
    if messages and messages[0]["role"] == "user":
        title = messages[0]["content"][:50]
        
    return {
        "chat": {
            "id": chat_id,
            "title": title,
            "started_at_iso": messages[0]["timestamp_iso"] if messages else "",
            "message_count": len(messages),
            "project_id": project_id_found
        },
        "messages": messages,
        "file_references": list(file_references),
        "tool_calls_count": tool_calls_count
    }

def get_project_discussions(project_id: str) -> List[Dict]:
    if not project_id:
        return get_recent_chats()
        
    # Scan specific project dir
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        return []
        
    chats = []
    # Similar logic to get_recent_chats but for single dir
    # To reuse code, we could refactor, but for now just implementing simply
    for entry in project_dir.iterdir():
        if entry.is_file() and entry.name.startswith("rpc-log-") and entry.name.endswith(".log"):
            log_content = _read_log_file(entry)
            if not log_content: continue
            
            title = "Chat Session"
            started_at_iso = ""
            message_count = 0
            
            for item in log_content:
                method = item.get("method")
                timestamp = item.get("timestamp")
                if not started_at_iso and timestamp: started_at_iso = timestamp
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
                if "result" in item and "stopReason" in item["result"]:
                    message_count += 1
            
            if not started_at_iso:
                try:
                    started_at_iso = datetime.fromtimestamp(entry.stat().st_ctime).isoformat() + "Z"
                except: pass

            chats.append({
                "id": entry.name.replace("rpc-log-", "").replace(".log", ""),
                "title": title,
                "started_at_iso": started_at_iso,
                "message_count": message_count,
                "project_id": project_id
            })
            
    chats.sort(key=lambda x: x["started_at_iso"], reverse=True)
    return chats
