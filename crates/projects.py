from typing import List, Dict
from pathlib import Path
import json
import hashlib
import os
import datetime

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_FILE = DATA_DIR / "projects.json"
TAGS_FILE = BASE_DIR / "tags.json"

def hash_path(path: str) -> str:
    abs_path = os.path.abspath(path)
    norm_path = os.path.normpath(abs_path)
    if os.name == 'nt':
        norm_path = norm_path.lower()
    return hashlib.sha256(norm_path.encode("utf-8")).hexdigest()

def _read_projects() -> Dict:
    if not PROJECTS_FILE.exists():
        return {"items": []}
    try:
        content = PROJECTS_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return {"items": []}
        return json.loads(content)
    except json.JSONDecodeError:
        return {"items": []}

def _ensure_data_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_FILE.exists():
        PROJECTS_FILE.write_text(json.dumps({"items": []}, ensure_ascii=False), encoding="utf-8")
    
    if not TAGS_FILE.exists():
        # Try to migrate from projects.json if tags exist there
        initial_tags = []
        try:
            proj_raw = _read_projects()
            
            # Get from top level tags if exist
            if "tags" in proj_raw:
                for t in proj_raw["tags"]:
                    if t not in initial_tags:
                        initial_tags.append(t)
            
            # Extract all unique tags used in items
            for item in proj_raw.get("items", []):
                for t in item.get("tags", []):
                    if t not in initial_tags:
                        initial_tags.append(t)
        except Exception:
            pass
        TAGS_FILE.write_text(json.dumps({"tags": initial_tags}, ensure_ascii=False), encoding="utf-8")

    # Ensure project IDs match their paths (Migration for legacy frontend-generated hashes)
    try:
        proj_raw = _read_projects()
        items = proj_raw.get("items", [])
        
        migrated = False
        new_items = []
        seen_ids = set()
        
        for item in items:
            path = item.get("path", "")
            if not path:
                continue
            
            correct_id = hash_path(path)
            current_id = item.get("id", "")
            
            if current_id != correct_id:
                migrated = True
                item["id"] = correct_id
                
            # Merge logic if the correct_id is already in new_items
            if correct_id in seen_ids:
                # Find the existing item and merge tags
                for existing in new_items:
                    if existing.get("id") == correct_id:
                        existing_tags = set(existing.get("tags", []))
                        existing_tags.update(item.get("tags", []))
                        existing["tags"] = list(existing_tags)
                        break
                migrated = True
            else:
                new_items.append(item)
                seen_ids.add(correct_id)
        
        if migrated:
            proj_raw["items"] = new_items
            PROJECTS_FILE.write_text(json.dumps(proj_raw, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass

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
    raw = _read_projects()
    items = raw.get("items", [])
    total = len(items)
    sliced = items[offset:offset+limit]
    return {"items": sliced, "total": total, "limit": limit, "offset": offset}

def list_enriched_projects() -> List[Dict]:
    _ensure_data_dir()
    raw = _read_projects()
    enriched: List[Dict] = []
    for it in raw.get("items", []):
        project_id = it.get("id", "")
        project_dir = DATA_DIR / "projects" / project_id
        
        first_used = None
        updated_at = None
        sort_time = 0
        
        if project_dir.exists():
            log_files = list(project_dir.glob("rpc-log-*.log"))
            if log_files:
                timestamps = []
                for f in log_files:
                    try:
                        ts = int(f.stem.split("-")[-1])
                        timestamps.append(ts)
                    except ValueError:
                        pass
                
                if timestamps:
                    first_ts = min(timestamps)
                    last_ts = max(timestamps)
                    first_used = datetime.datetime.fromtimestamp(first_ts / 1000.0, tz=datetime.timezone.utc).isoformat()
                    updated_at = datetime.datetime.fromtimestamp(last_ts / 1000.0, tz=datetime.timezone.utc).isoformat()
                    sort_time = last_ts

        metadata = {
            "path": it.get("path", ""),
            "sha256": project_id,
            "friendly_name": it.get("title", "") or "Project",
        }
        if first_used:
            metadata["first_used"] = first_used
        if updated_at:
            metadata["updated_at"] = updated_at

        enriched.append({
            "sha256": project_id,
            "root_path": it.get("path", ""),
            "tags": it.get("tags", []),
            "metadata": metadata,
            "_sort_time": sort_time
        })
        
    # Sort by sort_time descending
    enriched.sort(key=lambda x: x["_sort_time"], reverse=True)
    
    # Remove _sort_time before returning
    for item in enriched:
        del item["_sort_time"]
        
    return enriched

def _read_tags() -> Dict:
    if not TAGS_FILE.exists():
        return {"tags": []}
    try:
        content = TAGS_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return {"tags": []}
        return json.loads(content)
    except json.JSONDecodeError:
        return {"tags": []}

def get_all_tags() -> List[str]:
    _ensure_data_dir()
    raw = _read_tags()
    return raw.get("tags", [])

def add_tag(tag: str) -> List[str]:
    _ensure_data_dir()
    raw = _read_tags()
    tags = raw.get("tags", [])
    if tag not in tags:
        tags.append(tag)
        raw["tags"] = tags
        TAGS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return tags

def delete_tag(tag: str) -> List[str]:
    _ensure_data_dir()
    raw = _read_tags()
    tags = raw.get("tags", [])
    if tag in tags:
        tags.remove(tag)
        raw["tags"] = tags
        TAGS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
        
        # Also remove this tag from all projects
        projects_raw = _read_projects()
        for item in projects_raw.get("items", []):
            if "tags" in item and tag in item["tags"]:
                item["tags"].remove(tag)
        PROJECTS_FILE.write_text(json.dumps(projects_raw, ensure_ascii=False), encoding="utf-8")
    return tags

def toggle_project_tag(project_id: str, tag: str) -> Dict:
    _ensure_data_dir()
    raw = _read_projects()
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
    raw = _read_projects()
    items = [it for it in raw.get("items", []) if it.get("id") != project_id]
    raw["items"] = items
    PROJECTS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")

def upsert_project(project_id: str, path: str, title: str) -> None:
    _ensure_data_dir()
    raw = _read_projects()
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
    raw["items"] = items
    PROJECTS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
