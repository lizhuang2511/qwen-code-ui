from typing import List, Dict, Any
from pathlib import Path
import json
import hashlib
import os
import datetime

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PROJECTS_FILE = DATA_DIR / "projects.json"
TAGS_FILE = BASE_DIR / "tags.json"
SKILLS_FILE = BASE_DIR / "skills.json"

def _normalize_skill_name(value: str) -> str:
    return (value or "").strip()

def _unique_keep_order(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for v in values or []:
        s = _normalize_skill_name(v)
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out

def _list_skill_names_from_dir(skills_dir: Path) -> List[str]:
    try:
        if not skills_dir.exists() or not skills_dir.is_dir():
            return []
        names: List[str] = []
        for entry in skills_dir.iterdir():
            try:
                if not entry.is_dir():
                    continue
                skill_md = entry / "SKILL.md"
                skill_md_lower = entry / "skill.md"
                if skill_md.exists() or skill_md_lower.exists():
                    names.append(entry.name)
                else:
                    names.append(entry.name)
            except Exception:
                continue
        return _unique_keep_order(names)
    except Exception:
        return []

def _project_skill_dirs(project_root: Path) -> List[Path]:
    return [
        project_root / "skills",
        project_root / "skill",
        project_root / ".trae" / "skills",
        project_root / ".qwen" / "skills",
    ]

def _global_qwen_skill_dirs() -> List[Path]:
    home = Path.home()
    appdata = os.environ.get("APPDATA")
    localappdata = os.environ.get("LOCALAPPDATA")
    candidates: List[Path] = []
    if appdata:
        candidates.extend([
            Path(appdata) / "qwen" / "skills",
            Path(appdata) / "qwencode" / "skills",
            Path(appdata) / "qwencode5" / "skills",
        ])
    if localappdata:
        candidates.extend([
            Path(localappdata) / "qwen" / "skills",
            Path(localappdata) / "qwencode" / "skills",
            Path(localappdata) / "qwencode5" / "skills",
        ])
    return [
        home / ".qwen" / "skills",
        home / ".qwen" / "skills.d",
        home / ".qwen" / "agents" / "skills",
        home / ".qwencode" / "skills",
        home / ".qwencode5" / "skills",
        home / ".config" / "qwen" / "skills",
        home / ".config" / "qwencode" / "skills",
        home / ".config" / "qwencode5" / "skills",
        home / ".agents" / "skills",
        BASE_DIR / ".trae" / "skills",
        *candidates,
    ]

def get_preferred_global_skills_dir() -> str:
    for d in _global_qwen_skill_dirs():
        try:
            if d.exists() and d.is_dir():
                return str(d)
        except Exception:
            continue
    return str(Path.home() / ".qwen" / "skills")

def _discover_project_skills(project_path: str) -> List[str]:
    p = _normalize_skill_name(project_path)
    if not p:
        return []
    root = Path(p)
    names: List[str] = []
    for d in _project_skill_dirs(root):
        names.extend(_list_skill_names_from_dir(d))
    return _unique_keep_order(names)

def _discover_global_skills() -> List[str]:
    names: List[str] = []
    for d in _global_qwen_skill_dirs():
        names.extend(_list_skill_names_from_dir(d))
    return _unique_keep_order(names)

def _find_skill_doc_in_dir(base_dir: Path, skill_name: str) -> Dict[str, str]:
    try:
        if not base_dir.exists() or not base_dir.is_dir():
            return {"path": "", "content": ""}
        folder = base_dir / skill_name
        if not folder.exists() or not folder.is_dir():
            return {"path": "", "content": ""}

        candidates = [
            folder / "SKILL.md",
            folder / "skill.md",
            folder / "README.md",
            folder / "readme.md",
        ]
        for p in candidates:
            try:
                if p.exists() and p.is_file():
                    return {
                        "path": str(p),
                        "content": p.read_text(encoding="utf-8", errors="ignore"),
                    }
            except Exception:
                continue
        return {"path": "", "content": ""}
    except Exception:
        return {"path": "", "content": ""}

def get_skill_content(skill: str, project_path: str = "") -> Dict[str, str]:
    _ensure_data_dir()
    s = _normalize_skill_name(skill)
    if not s:
        return {"path": "", "content": ""}

    proj_path = _normalize_skill_name(project_path)
    if proj_path:
        root = Path(proj_path)
        for d in _project_skill_dirs(root):
            hit = _find_skill_doc_in_dir(d, s)
            if hit.get("path"):
                return hit

    for d in _global_qwen_skill_dirs():
        hit = _find_skill_doc_in_dir(d, s)
        if hit.get("path"):
            return hit

    projects_raw = _read_projects()
    for it in projects_raw.get("items", []):
        p = _normalize_skill_name(it.get("path", ""))
        if not p:
            continue
        root = Path(p)
        for d in _project_skill_dirs(root):
            hit = _find_skill_doc_in_dir(d, s)
            if hit.get("path"):
                return hit

    return {"path": "", "content": ""}

def get_skill_folder(skill: str, project_path: str = "") -> str:
    _ensure_data_dir()
    s = _normalize_skill_name(skill)
    if not s:
        return ""

    proj_path = _normalize_skill_name(project_path)
    if proj_path:
        root = Path(proj_path)
        for d in _project_skill_dirs(root):
            folder = d / s
            if folder.exists() and folder.is_dir():
                return str(folder)

    for d in _global_qwen_skill_dirs():
        folder = d / s
        if folder.exists() and folder.is_dir():
            return str(folder)

    projects_raw = _read_projects()
    for it in projects_raw.get("items", []):
        p = _normalize_skill_name(it.get("path", ""))
        if not p:
            continue
        root = Path(p)
        for d in _project_skill_dirs(root):
            folder = d / s
            if folder.exists() and folder.is_dir():
                return str(folder)

    return ""

def resolve_skill_folders(skills: List[str], project_path: str = "") -> List[str]:
    out: List[str] = []
    seen = set()
    for s in skills or []:
        name = _normalize_skill_name(s)
        if not name:
            continue
        folder = get_skill_folder(name, project_path)
        if not folder:
            continue
        if folder in seen:
            continue
        seen.add(folder)
        out.append(folder)
    return out

def _make_snippet(content: str, pos: int, q_len: int, window: int = 120) -> str:
    try:
        if pos < 0:
            return ""
        half = max(0, window // 2)
        start = max(0, pos - half)
        end = min(len(content), pos + q_len + half)
        snippet = content[start:end].strip()
        if start > 0:
            snippet = "..." + snippet
        if end < len(content):
            snippet = snippet + "..."
        return snippet
    except Exception:
        return ""

def search_skills(query: str, mode: str = "all", project_path: str = "", limit: int = 200) -> List[Dict[str, Any]]:
    _ensure_data_dir()
    q = _normalize_skill_name(query)
    if not q:
        return []

    m = (mode or "all").strip().lower()
    if m not in ("name", "content", "all"):
        m = "all"

    try:
        limit_n = int(limit)
    except Exception:
        limit_n = 200
    if limit_n <= 0:
        limit_n = 200

    q_fold = q.casefold()
    proj_path = _normalize_skill_name(project_path)

    out: List[Dict[str, Any]] = []
    index: Dict[str, int] = {}

    for s in get_all_skills():
        s_norm = _normalize_skill_name(s)
        if not s_norm:
            continue
        if len(out) >= limit_n:
            break

        name_hit = (m in ("name", "all")) and (q_fold in s_norm.casefold())
        if name_hit:
            out.append({"skill": s_norm, "matchedIn": "name"})
            index[s_norm] = len(out) - 1
            if m == "name":
                continue

        if m in ("content", "all"):
            doc = get_skill_content(s_norm, proj_path)
            content = doc.get("content", "") or ""
            if not content:
                continue
            pos = content.casefold().find(q_fold)
            if pos < 0:
                continue
            snippet = _make_snippet(content, pos, len(q))
            item: Dict[str, Any] = {"skill": s_norm, "matchedIn": "content"}
            if doc.get("path"):
                item["path"] = doc.get("path", "")
            if snippet:
                item["snippet"] = snippet

            if s_norm in index:
                i = index[s_norm]
                merged = {**out[i], **item}
                merged["matchedIn"] = "all"
                out[i] = merged
            else:
                out.append(item)
                index[s_norm] = len(out) - 1

    return out

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

    if not SKILLS_FILE.exists():
        initial_skills = []
        try:
            proj_raw = _read_projects()
            if "skills" in proj_raw:
                for s in proj_raw["skills"]:
                    if s not in initial_skills:
                        initial_skills.append(s)

            for item in proj_raw.get("items", []):
                for s in item.get("skills", []):
                    if s not in initial_skills:
                        initial_skills.append(s)
        except Exception:
            pass
        SKILLS_FILE.write_text(json.dumps({"skills": initial_skills}, ensure_ascii=False), encoding="utf-8")

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

        stored_skills = it.get("skills", [])
        disabled_skills = it.get("disabled_skills", [])
        discovered_skills = _discover_project_skills(metadata.get("path", ""))
        merged_skills = _unique_keep_order(list(stored_skills) + list(discovered_skills))
        disabled_set = set([_normalize_skill_name(s) for s in disabled_skills or [] if _normalize_skill_name(s)])
        merged_skills = [s for s in merged_skills if s not in disabled_set]

        enriched.append({
            "sha256": project_id,
            "root_path": it.get("path", ""),
            "tags": it.get("tags", []),
            "skills": merged_skills,
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

def _read_skills() -> Dict:
    if not SKILLS_FILE.exists():
        return {"skills": []}
    try:
        content = SKILLS_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return {"skills": []}
        return json.loads(content)
    except json.JSONDecodeError:
        return {"skills": []}

def get_all_skills() -> List[str]:
    _ensure_data_dir()
    raw = _read_skills()
    persisted = raw.get("skills", [])
    global_discovered = _discover_global_skills()
    projects_raw = _read_projects()
    project_paths = [it.get("path", "") for it in projects_raw.get("items", [])]
    discovered_from_projects: List[str] = []
    stored_from_projects: List[str] = []
    for it in projects_raw.get("items", []):
        stored_from_projects.extend(it.get("skills", []) or [])
    for p in project_paths:
        discovered_from_projects.extend(_discover_project_skills(p))
    merged = _unique_keep_order(list(persisted) + list(global_discovered) + list(stored_from_projects) + list(discovered_from_projects))
    return merged

def add_skill(skill: str) -> List[str]:
    _ensure_data_dir()
    raw = _read_skills()
    skills = raw.get("skills", [])
    if skill not in skills:
        skills.append(skill)
        raw["skills"] = skills
        SKILLS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return skills

def add_skills(new_skills: List[str]) -> List[str]:
    _ensure_data_dir()
    raw = _read_skills()
    skills = raw.get("skills", [])
    existing = set(skills)
    changed = False
    for s in new_skills:
        s2 = _normalize_skill_name(s)
        if not s2:
            continue
        if s2 not in existing:
            skills.append(s2)
            existing.add(s2)
            changed = True
    if changed:
        raw["skills"] = skills
        SKILLS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    return skills

def delete_skill(skill: str) -> List[str]:
    _ensure_data_dir()
    raw = _read_skills()
    skills = raw.get("skills", [])
    normalized = _normalize_skill_name(skill)
    if normalized in skills:
        skills.remove(normalized)
        raw["skills"] = skills
        SKILLS_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")

    projects_raw = _read_projects()
    changed = False
    for item in projects_raw.get("items", []):
        if "skills" in item and normalized in item["skills"]:
            item["skills"].remove(normalized)
            changed = True
        if "disabled_skills" in item and normalized in item["disabled_skills"]:
            item["disabled_skills"].remove(normalized)
            changed = True
    if changed:
        _write_projects(projects_raw)

    return skills

def toggle_project_skill(project_id: str, skill: str) -> Dict:
    _ensure_data_dir()
    raw = _read_projects()
    items = raw.get("items", [])
    target_item = None
    for item in items:
        if item.get("id") == project_id:
            target_item = item
            break

    if target_item:
        s = _normalize_skill_name(skill)
        current_skills = _unique_keep_order(target_item.get("skills", []))
        disabled_skills = _unique_keep_order(target_item.get("disabled_skills", []))
        disabled_set = set(disabled_skills)

        if s in current_skills and s not in disabled_set:
            disabled_skills.append(s)
        else:
            disabled_skills = [x for x in disabled_skills if x != s]
            current_skills = _unique_keep_order(current_skills + [s])

        target_item["skills"] = current_skills
        target_item["disabled_skills"] = _unique_keep_order(disabled_skills)
        _write_projects(raw)
        merged = _unique_keep_order(current_skills + _discover_project_skills(target_item.get("path", "")))
        merged = [x for x in merged if x not in set(target_item.get("disabled_skills", []))]
        return {"skills": merged}
    return {"skills": []}

def remove_project_skill(project_id: str, skill: str) -> Dict:
    _ensure_data_dir()
    raw = _read_projects()
    items = raw.get("items", [])
    target_item = None
    for item in items:
        if item.get("id") == project_id:
            target_item = item
            break

    if target_item:
        s = _normalize_skill_name(skill)
        current_skills = _unique_keep_order(target_item.get("skills", []))
        current_skills = [x for x in current_skills if x != s]
        disabled_skills = _unique_keep_order(target_item.get("disabled_skills", []))
        if s and s not in disabled_skills:
            disabled_skills.append(s)
        target_item["skills"] = current_skills
        target_item["disabled_skills"] = _unique_keep_order(disabled_skills)
        _write_projects(raw)
        merged = _unique_keep_order(current_skills + _discover_project_skills(target_item.get("path", "")))
        merged = [x for x in merged if x not in set(target_item.get("disabled_skills", []))]
        return {"skills": merged}
    return {"skills": []}

def import_project_skills(project_id: str, skills: List[str]) -> Dict:
    _ensure_data_dir()
    cleaned: List[str] = []
    seen = set()
    for s in skills or []:
        s2 = _normalize_skill_name(s)
        if not s2:
            continue
        if s2 in seen:
            continue
        seen.add(s2)
        cleaned.append(s2)

    if len(cleaned) == 0:
        return {"skills": []}

    add_skills(cleaned)

    raw = _read_projects()
    items = raw.get("items", [])
    target_item = None
    for item in items:
        if item.get("id") == project_id:
            target_item = item
            break

    if not target_item:
        return {"skills": []}

    current = target_item.get("skills", [])
    merged = _unique_keep_order(list(current) + list(cleaned))
    disabled_skills = _unique_keep_order(target_item.get("disabled_skills", []))
    disabled_skills = [x for x in disabled_skills if x not in set(cleaned)]
    target_item["skills"] = merged
    target_item["disabled_skills"] = _unique_keep_order(disabled_skills)
    _write_projects(raw)
    discovered = _discover_project_skills(target_item.get("path", ""))
    merged2 = _unique_keep_order(merged + discovered)
    disabled_set2 = set(target_item.get("disabled_skills", []))
    merged2 = [x for x in merged2 if x not in disabled_set2]
    return {"skills": merged2}

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
        _write_projects(raw)
        return {"tags": current_tags}
    return {"tags": []}

def _write_projects(data: dict) -> None:
    try:
        # Use atomic write to prevent locking issues or partial writes
        temp_file = PROJECTS_FILE.with_suffix('.tmp')
        with temp_file.open('w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        # Rename is atomic on POSIX, but on Windows it might fail if destination exists
        # We handle this by replacing directly if possible
        temp_file.replace(PROJECTS_FILE)
    except Exception as e:
        print(f"[Projects] Failed to write projects: {e}")
        # Fallback to direct write if temp file replacement fails
        try:
            with PROJECTS_FILE.open('w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e2:
            print(f"[Projects] Direct write fallback also failed: {e2}")

def delete_project(project_id: str) -> None:
    _ensure_data_dir()
    raw = _read_projects()
    items = [it for it in raw.get("items", []) if it.get("id") != project_id]
    raw["items"] = items
    _write_projects(raw)

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
    _write_projects(raw)
