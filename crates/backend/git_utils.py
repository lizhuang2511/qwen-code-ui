import os
import shutil
import zipfile
import json
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import re

HISTORY_DIR_NAME = ".history"
STATUS_FILE_NAME = "status.json"
CONFIG_FILE_NAME = "config.json"
COMMITS_FILE_NAME = "commits.json"

# Removed ChangeHandler and WatchdogManager logic as requested

def _get_history_dir(path: str) -> str:
    return os.path.join(path, HISTORY_DIR_NAME)

def _get_config_path(path: str) -> str:
    # Config file is in the .history directory
    return os.path.join(path, HISTORY_DIR_NAME, CONFIG_FILE_NAME)

def _get_commits_path(path: str) -> str:
    return os.path.join(_get_history_dir(path), COMMITS_FILE_NAME)

def _load_commits(path: str) -> List[Dict]:
    commits_path = _get_commits_path(path)
    if os.path.exists(commits_path):
        with open(commits_path, "r", encoding="utf-8") as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
            
    # Migration: if json not found, list zip files and create entries
    history_dir = _get_history_dir(path)
    if not os.path.exists(history_dir):
        return []
        
    logs = []
    if os.path.exists(history_dir):
        files = os.listdir(history_dir)
        zip_files = [f for f in files if f.endswith('.zip')]
        # Sort by modification time, newest first
        zip_files.sort(key=lambda x: os.path.getmtime(os.path.join(history_dir, x)), reverse=True)
        
        for f in zip_files:
            full_path = os.path.join(history_dir, f)
            stat = os.stat(full_path)
            name = os.path.splitext(f)[0]
            # Use filename as ID and Message for legacy files
            logs.append({
                "id": name,
                "message": name,
                "timestamp": int(stat.st_mtime),
                "zip_name": f,
                "size": stat.st_size
            })
    return logs

def _save_commits(path: str, commits: List[Dict]):
    commits_path = _get_commits_path(path)
    history_dir = _get_history_dir(path)
    if not os.path.exists(history_dir):
        os.makedirs(history_dir, exist_ok=True)
    with open(commits_path, "w", encoding="utf-8") as f:
        json.dump(commits, f, indent=2, ensure_ascii=False)

def get_excluded_paths(path: str) -> List[str]:
    config_path = _get_config_path(path)
    
    # Ensure history directory exists
    history_dir = os.path.dirname(config_path)
    if not os.path.exists(history_dir):
        os.makedirs(history_dir)
        
    print(f"[调试] 正在尝试读取配置文件: {config_path}")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                excluded = data.get("excluded_paths", [])
                print(f"[调试] 读取到的排除列表: {excluded}")
                return excluded
        except json.JSONDecodeError:
            print(f"[调试] 配置文件 JSON 解析失败: {config_path}")
            pass
    else:
        print(f"[调试] 配置文件不存在，创建默认配置: {config_path}")
        try:
            default_config = {"excluded_paths": []}
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(default_config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[调试] 创建默认配置文件失败: {e}")
            
    return []

def update_excluded_paths(path: str, excluded: List[str]) -> bool:
    config_path = _get_config_path(path)
    
    current_config = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                current_config = json.load(f)
        except json.JSONDecodeError:
            pass
        
    current_config["excluded_paths"] = excluded
    
    config_dir = os.path.dirname(config_path)
    if config_dir and not os.path.exists(config_dir):
        os.makedirs(config_dir, exist_ok=True)
    
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(current_config, f, indent=2, ensure_ascii=False)
    return True

def normalize_path(path: str) -> str:
    """Normalize path to use forward slashes and remove trailing slashes."""
    if not path:
        return ""
    # Strip whitespace, replace backslashes, remove trailing slashes
    norm = path.strip().replace("\\", "/").rstrip("/")
    # Remove leading ./ if present (e.g. ./config -> config)
    if norm.startswith("./"):
        norm = norm[2:]
    return norm

def is_path_excluded(rel_path: str, excluded_paths: List[str]) -> bool:
    """
    Check if a path is excluded.
    Normalizes path separators to '/' for comparison.
    Checks exact matches and directory prefixes.
    """
    if not excluded_paths:
        return False
        
    # Normalize input path
    norm_path = normalize_path(rel_path)
    if not norm_path:
        return False
    
    # Check if any excluded path matches or is a parent
    for ex in excluded_paths:
        ex_norm = normalize_path(ex)
        if not ex_norm:
            continue
            
        # Exact match
        if norm_path == ex_norm:
            return True
            
        # Directory prefix match (e.g. "src" excludes "src/main.py")
        if norm_path.startswith(ex_norm + "/"):
            return True
            
    return False

def _preprocess_excluded_paths(root_path: str, excluded_paths: List[str]) -> List[str]:
    """
    Convert absolute paths in excluded list to relative paths based on root_path.
    Also normalize all paths.
    """
    processed = []
    try:
        root_abs = os.path.abspath(root_path)
    except:
        return excluded_paths

    for path in excluded_paths:
        if not path:
            continue
            
        # Normalize slashes first for consistent checking
        norm_input = path.replace("\\", "/")
        
        # Check if absolute
        if os.path.isabs(path):
            # If it's inside root, make it relative
            try:
                # Use os.path.abspath to ensure we compare absolute paths
                path_abs = os.path.abspath(path)
                
                # Check if path_abs starts with root_abs
                # We use commonpath to handle case sensitivity and separators correctly
                if os.path.commonpath([root_abs, path_abs]) == root_abs:
                    rel = os.path.relpath(path_abs, root_abs)
                    if rel == ".":
                        continue
                    processed.append(normalize_path(rel))
                    print(f"[调试] 转换绝对路径排除项: {path} -> {normalize_path(rel)}")
                else:
                    # Outside root, ignore or keep
                    # If user explicitly excludes an outside path, it won't affect internal zip anyway
                    pass 
            except ValueError:
                pass
            except Exception as e:
                print(f"[调试] 处理绝对路径出错: {path}, {e}")
        else:
            processed.append(normalize_path(path))
            
    return processed

def _zip_workspace(source_dir: str, zip_path: str):
    print(f"[调试] 开始压缩备份，源目录: {source_dir}")
    raw_excluded = get_excluded_paths(source_dir)
    excluded = _preprocess_excluded_paths(source_dir, raw_excluded)
    print(f"[调试] 最终使用的排除列表(处理后): {excluded}")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Filter dirs: only exclude .git and .history
            rel_root = os.path.relpath(root, source_dir)
            if rel_root == ".":
                rel_root = ""
            
            # Filter directories
            # We must filter in-place (dirs[:]) to prevent os.walk from entering excluded dirs
            valid_dirs = []
            for d in dirs:
                if d in ['.git', HISTORY_DIR_NAME]:
                    continue
                    
                d_rel_path = os.path.join(rel_root, d) if rel_root else d
                if is_path_excluded(d_rel_path, excluded):
                    print(f"[调试] 排除文件夹: {d_rel_path}")
                    continue
                valid_dirs.append(d)
            dirs[:] = valid_dirs
            
            if any(p.startswith('.') and p != '.' for p in root.split(os.sep)):
                continue
                
            for file in files:
                if file in ['.git', HISTORY_DIR_NAME]:
                    continue
                
                file_rel_path = os.path.join(rel_root, file) if rel_root else file
                if is_path_excluded(file_rel_path, excluded):
                    print(f"[调试] 排除文件: {file_rel_path}")
                    continue
                    
                file_path = os.path.join(root, file)
                print(f"[调试] 添加文件: {file_rel_path}")
                zipf.write(file_path, file_rel_path.replace(os.sep, "/"))

        # Add config.json from .history if exists
        config_path = _get_config_path(source_dir)
        if os.path.exists(config_path):
            # Ensure we write it as .history/config.json
            rel_path = os.path.relpath(config_path, source_dir)
            print(f"[调试] 添加配置文件到备份: {rel_path}")
            zipf.write(config_path, rel_path.replace(os.sep, "/"))

def init_repo(path: str) -> bool:
    history_dir = _get_history_dir(path)
    if not os.path.exists(history_dir):
        os.makedirs(history_dir)
        
    # Initial zip
    zip_path = os.path.join(history_dir, "初始.zip")
    
    _zip_workspace(path, zip_path)
    
    # Init status file (kept empty as monitoring is disabled)
    status_path = os.path.join(history_dir, STATUS_FILE_NAME)
    with open(status_path, "w", encoding="utf-8") as f:
        json.dump([], f)
        
    return True

def commit(path: str, message: str, name: str = "") -> bool:
    history_dir = _get_history_dir(path)
    if not os.path.exists(history_dir):
        return False
    
    # Use provided name as base for filename if available, otherwise timestamp
    # Sanitize name to be safe for filesystem
    base_name = str(int(time.time()))
    if name:
        # Keep only alphanumeric, chinese, dots, dashes, underscores
        # Replace others with underscore
        safe_name = re.sub(r'[^\w\u4e00-\u9fa5\.\-\_]', '_', name)
        if safe_name:
            base_name = safe_name
            
    commit_id = base_name
    zip_name = f"{commit_id}.zip"
    zip_path = os.path.join(history_dir, zip_name)
    
    # If file exists, append timestamp suffix to ensure uniqueness
    if os.path.exists(zip_path):
        commit_id = f"{base_name}_{int(time.time())}"
        zip_name = f"{commit_id}.zip"
        zip_path = os.path.join(history_dir, zip_name)
    
    # Load existing commits first
    commits = _load_commits(path)
    
    _zip_workspace(path, zip_path)
    
    # Save to JSON
    if os.path.exists(zip_path):
        stat = os.stat(zip_path)
        
        # Use provided name or default to message or "Untitled"
        commit_name = name if name else (message if message else "Untitled")
        
        entry = {
            "id": commit_id, # This is now the filename stem (or derived unique id)
            "name": commit_name,
            "message": message,
            "timestamp": int(stat.st_mtime),
            "zip_name": zip_name,
            "size": stat.st_size
        }
        # Insert at beginning
        commits.insert(0, entry)
        _save_commits(path, commits)
        
        return True
    return False

def get_log(path: str, limit: int = 20) -> List[Dict[str, Any]]:
    commits = _load_commits(path)
    
    logs = []
    for c in commits:
        formatted_time = datetime.fromtimestamp(c["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
        # Ensure 'name' exists for older commits
        commit_name = c.get("name", c.get("message", "Untitled"))
        
        logs.append({
            "hexsha": c["id"],
            "name": commit_name,
            "message": c["message"], # This is the "remark"
            "author_name": "User",
            "author_email": "",
            "date": datetime.fromtimestamp(c["timestamp"]).isoformat(),
            "summary": commit_name, # Use name as summary for list display
            "size": c.get("size", 0),
            "formatted_time": formatted_time
        })
        
    return logs[:limit]

def get_status(path: str) -> Dict[str, Any]:
    # Monitoring disabled, always return clean status
    # But check if .history exists to determine is_repo
    history_dir = _get_history_dir(path)
    is_repo = os.path.exists(history_dir)
    
    return {
        "is_repo": is_repo,
        "current_branch": "master", # Dummy
        "staged": [],
        "unstaged": [],
        "untracked": []
    }

def restore(path: str, commit_hash: Optional[str] = None) -> bool:
    # commit_hash is the zip name (without extension)
    if not commit_hash:
        return False # No implicit restore supported currently, or handle as no-op
        
    history_dir = _get_history_dir(path)
    zip_path = os.path.join(history_dir, f"{commit_hash}.zip")
    
    if not os.path.exists(zip_path):
        return False
        
    print(f"[调试] 开始恢复版本 {commit_hash}，目标目录: {path}")
    raw_excluded = get_excluded_paths(path)
    excluded = _preprocess_excluded_paths(path, raw_excluded)
    print(f"[调试] 恢复操作使用的排除列表: {excluded}")
    
    # 1. Delete existing files unless excluded
    for root, dirs, files in os.walk(path, topdown=True):
        rel_root = os.path.relpath(root, path)
        if rel_root == ".":
            rel_root = ""
            
        if '.git' in dirs:
            dirs.remove('.git')
        if HISTORY_DIR_NAME in dirs:
            dirs.remove(HISTORY_DIR_NAME)
            
        # Prune excluded directories
        for d in list(dirs):
            d_rel = os.path.join(rel_root, d) if rel_root else d
            if is_path_excluded(d_rel, excluded):
                print(f"[调试] 恢复-保留文件夹(排除): {d_rel}")
                dirs.remove(d)
                
        # Delete non-excluded files
        for f in files:
            if f in ['.git', HISTORY_DIR_NAME]:
                continue
            f_rel = os.path.join(rel_root, f) if rel_root else f
            if not is_path_excluded(f_rel, excluded):
                f_path = os.path.join(root, f)
                if os.path.exists(f_path):
                    print(f"[调试] 恢复-删除文件: {f_rel}")
                    os.remove(f_path)
            else:
                print(f"[调试] 恢复-保留文件(排除): {f_rel}")

    # 2. Cleanup empty directories
    for root, dirs, files in os.walk(path, topdown=False):
        rel_root = os.path.relpath(root, path)
        if rel_root == ".":
            rel_root = ""
            
        if rel_root == "":
            continue
            
        if is_path_excluded(rel_root, excluded):
            continue
            
        if os.path.exists(root) and not os.listdir(root):
            print(f"[调试] 恢复-删除空目录: {rel_root}")
            os.rmdir(root)
                
    # 3. Unzip
    with zipfile.ZipFile(zip_path, 'r') as zipf:
        for member in zipf.infolist():
            if is_path_excluded(member.filename, excluded):
                print(f"[调试] 恢复-跳过解压(排除): {member.filename}")
                continue
            print(f"[调试] 恢复-解压文件: {member.filename}")
            zipf.extract(member, path)
            
    return True

def reset(path: str, commit_hash: str, mode: str = "mixed") -> bool:
    # Map reset to restore for "hard" reset equivalent
    return restore(path, commit_hash)

def delete_commit(path: str, commit_hash: str) -> bool:
    if not commit_hash:
        return False
        
    history_dir = _get_history_dir(path)
    zip_path = os.path.join(history_dir, f"{commit_hash}.zip")
    
    if not os.path.exists(zip_path):
        return False
        
    os.remove(zip_path)
    
    # Remove from JSON
    commits = _load_commits(path)
    commits = [c for c in commits if c["id"] != commit_hash]
    _save_commits(path, commits)
    
    return True
