from typing import List, Dict, Optional
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
CONV_DIR = DATA_DIR / "conversations"
INDEX_FILE = DATA_DIR / "conversations" / "index.json"

def _ensure_dirs():
    CONV_DIR.mkdir(parents=True, exist_ok=True)
    if not INDEX_FILE.exists():
        INDEX_FILE.write_text(json.dumps({"items": []}, ensure_ascii=False), encoding="utf-8")

def get_recent_chats() -> List[Dict]:
    _ensure_dirs()
    raw = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    items = raw.get("items", [])
    return [
        {
            "id": it.get("id",""),
            "title": it.get("title","Conversation"),
            "started_at_iso": it.get("started_at_iso",""),
            "message_count": int(it.get("message_count",0)),
        }
        for it in items
    ]

def search_chats(query: str, filters: Optional[Dict]) -> List[Dict]:
    _ensure_dirs()
    raw = json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    items = raw.get("items", [])
    results: List[Dict] = []
    q = query or ""
    for it in items:
        chat_id = it.get("id","")
        conv_path = CONV_DIR / f"{chat_id}.json"
        if not conv_path.exists():
            continue
        conv = json.loads(conv_path.read_text(encoding="utf-8"))
        messages = conv.get("messages", [])
        matches = []
        line_no = 1
        for m in messages:
            content = ""
            for part in m.get("parts", []):
                if part.get("type") == "text":
                    content += part.get("text","")
            if q and (q in content):
                matches.append({
                    "content_snippet": content[:200],
                    "line_number": line_no,
                    "role": m.get("sender","unknown"),
                    "timestamp_iso": it.get("started_at_iso",""),
                })
            line_no += 1
        if matches:
            results.append({
                "chat": {
                    "id": chat_id,
                    "title": it.get("title","Conversation"),
                    "started_at_iso": it.get("started_at_iso",""),
                    "message_count": int(it.get("message_count",0)),
                },
                "matches": matches,
                "relevance_score": float(len(matches)),
            })
    return results

def get_detailed_conversation(chat_id: str) -> Dict:
    _ensure_dirs()
    conv_path = CONV_DIR / f"{chat_id}.json"
    if not conv_path.exists():
        return {
            "chat": {"id": chat_id, "title": "Conversation", "started_at_iso": "", "message_count": 0},
            "messages": [],
            "file_references": [],
            "tool_calls_count": 0,
        }
    return json.loads(conv_path.read_text(encoding="utf-8"))

def get_project_discussions(project_id: str) -> List[Dict]:
    return []
