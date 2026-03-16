from typing import List, Dict
from pathlib import Path
import json
import hashlib
import os

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_FILE = DATA_DIR / "projects.json"

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_FILE.exists():
        PROJECTS_FILE.write_text(json.dumps({"items": []}, ensure_ascii=False), encoding="utf-8")

def hash_path(path: str) -> str:
    abs_path = os.path.abspath(path)
    norm_path = os.path.normpath(abs_path)
    if os.name == 'nt':
        norm_path = norm_path.lower()
    return hashlib.sha256(norm_path.encode("utf-8")).hexdigest()

def ensure_project(path: str) -> str:
    pid = hash_path(path)
    title = os.path.basename(path) or path
    upsert_project(pid, path, title)
    
    # Ensure directory exists (like Rust)
    project_dir = DATA_DIR / "projects" / pid
    if not project_dir.exists():
        project_dir.mkdir(parents=True, exist_ok=True)
        
    return pid

def list_projects(limit: int, offset: int) -> Dict:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    items = raw.get("items", [])
    total = len(items)
    sliced = items[offset:offset+limit]
    return {"items": sliced, "total": total, "limit": limit, "offset": offset}

def list_enriched_projects() -> List[Dict]:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    enriched: List[Dict] = []
    for it in raw.get("items", []):
        enriched.append({
            "sha256": it.get("id",""),
            "root_path": it.get("path",""),
            "tags": it.get("tags", []),
            "metadata": {
                "path": it.get("path",""),
                "sha256": it.get("id",""),
                "friendly_name": it.get("title","") or "Project",
            },
        })
    return enriched

def get_all_tags() -> List[str]:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    return raw.get("tags", [])

def add_tag(tag: str) -> List[str]:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    tags = raw.get("tags", [])
    if tag not in tags:
        tags.append(tag)
        raw["tags"] = tags
        PROJECTS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return tags

def delete_tag(tag: str) -> List[str]:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    tags = raw.get("tags", [])
    if tag in tags:
        tags.remove(tag)
        raw["tags"] = tags
        # Also remove this tag from all projects
        for item in raw.get("items", []):
            if "tags" in item and tag in item["tags"]:
                item["tags"].remove(tag)
        PROJECTS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return tags

def toggle_project_tag(project_id: str, tag: str) -> Dict:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    items = raw.get("items", [])
    target_item = None
    for item in items:
        if item.get("id") == project_id:
            target_item = item
            break
    
    if target_item:
        current_tags = target_item.get("tags", [])
        if tag in current_tags:
            current_tags.remove(tag)
        else:
            current_tags.append(tag)
        target_item["tags"] = current_tags
        PROJECTS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        return {"tags": current_tags}
    return {"tags": []}

def delete_project(project_id: str) -> None:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    items = [it for it in raw.get("items", []) if it.get("id") != project_id]
    PROJECTS_FILE.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")

def upsert_project(project_id: str, path: str, title: str) -> None:
    _ensure_data_dir()
    raw = json.loads(PROJECTS_FILE.read_text(encoding="utf-8"))
    items = raw.get("items", [])
    exists = False
    for it in items:
        if it.get("id") == project_id:
            it["path"] = path
            it["title"] = title
            exists = True
            break
    if not exists:
        items.append({"id": project_id, "path": path, "title": title})
    PROJECTS_FILE.write_text(json.dumps({"items": items}, ensure_ascii=False), encoding="utf-8")
