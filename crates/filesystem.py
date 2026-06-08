import os
import base64
import shutil
from pathlib import Path
from typing import List, Dict, Optional
from datetime import datetime
import backend.git_utils as git_utils

def _normalize_path(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return _normalize_path(value[0]) if len(value) > 0 else ""
    return str(value)

def get_home_directory() -> str:
    return str(Path.home())

def is_home_directory(path: str) -> bool:
    return os.path.abspath(path) == os.path.abspath(str(Path.home()))

def get_parent_directory(path: str) -> Optional[str]:
    p = Path(path).resolve()
    parent = p.parent
    return str(parent) if parent != p else None

def validate_directory(path: str) -> bool:
    return os.path.isdir(path)

def list_directory_contents(path: str) -> List[Dict]:
    entries: List[Dict] = []
    p = Path(path)
    
    # Get excluded paths
    # The config is per-project, so we need to find the project root.
    # For simplicity, we check if the current path or its parents have .history.
    # But git_utils.get_excluded_paths expects the project root.
    # If path is inside a project, we should try to find the root.
    # However, list_directory_contents might be called on any path.
    # We will try to load config from the current directory if it has .history,
    # or rely on the frontend passing the project root?
    # Actually, `git_utils.get_excluded_paths` takes `path` and looks for `.history` inside it.
    # If `path` is a subdirectory of the project, `_get_history_dir` will look for `.history` inside `path`, which is wrong.
    # But typically `list_directory_contents` is called for the project root or subdirs.
    # If we are in a subdir, we should ideally traverse up.
    # But for now, let's assume we filter based on the config in the *current* path if it exists,
    # OR we need a way to pass the exclusion list.
    #
    # Wait, the user requirement says "Change detailed information settings area to, settings item excluded file directories."
    # This implies global or project setting.
    # Let's try to find the project root by looking for .history up the tree.
    
    project_root = path
    curr = p
    # Traverse up to find .history
    # Limit traversal to avoid performance hit
    found_root = False
    for _ in range(5):
        if (curr / ".history").exists():
            project_root = str(curr)
            found_root = True
            break
        if curr.parent == curr:
            break
        curr = curr.parent
        
    excluded = []
    if found_root:
        excluded = git_utils.get_excluded_paths(project_root)
        
    # Also we need to filter based on relative path from project root if found
    
    try:
        for item in p.iterdir():
            # Check exclusions
            if item.name in excluded:
                continue
            
            if found_root:
                try:
                    rel_path = item.relative_to(project_root)
                    if str(rel_path) in excluded:
                        continue
                except:
                    pass
            
            stat = item.stat()
            formatted_time = datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            
            entries.append(
                {
                    "name": item.name,
                    "is_directory": item.is_dir(),
                    "full_path": str(item.resolve()),
                    "size": int(stat.st_size),
                    "modified": int(stat.st_mtime),
                    "modified_str": formatted_time, # Added formatted time
                }
            )
    except Exception as e:
        print(f"Error listing directory {path}: {e}")
        
    return entries

def read_file_content(path: str) -> Dict:
    path = _normalize_path(path)
    # 修复大模型生成的路径中可能包含的异常空格（例如中英文交界处的空格）
    import re
    if path:
        # 将 "中文字符 空格 字母/数字/下划线" 的空格去掉，反之亦然
        # 这里使用比较安全的方式，只去掉路径中那些看起来像是不小心多出来的空格
        # 但因为 Windows 路径本身可能合法包含空格（比如 "C:\\Program Files"）
        # 所以我们需要谨慎。如果去除空格后的文件存在，而原文件不存在，我们才替换。
        p = Path(path)
        if not p.exists():
            # 尝试移除中英文之间的空格
            # 匹配: 中文后面跟着空格，然后是字母/数字，或者字母/数字后面跟着空格，然后是中文
            clean_path = re.sub(r'([\u4e00-\u9fa5])\s+([a-zA-Z0-9_])', r'\1\2', path)
            clean_path = re.sub(r'([a-zA-Z0-9_])\s+([\u4e00-\u9fa5])', r'\1\2', clean_path)
            if Path(clean_path).exists():
                path = clean_path
                p = Path(path)

    p = Path(path)
    encoding = "utf-8"
    error = None
    if not (p.exists() and p.is_file()):
        error = "File not found"
    data = p.read_bytes() if error is None else b""
    decoded = data.decode(encoding, errors="ignore") if data else ""
    is_text = True if (decoded or len(data) == 0) else False
    is_binary = not is_text
    content: Optional[str] = decoded if is_text else None
    stat = p.stat() if p.exists() else None
    return {
        "path": str(p),
        "content": content,
        "size": int(stat.st_size) if stat else 0,
        "modified": int(stat.st_mtime) if stat else None,
        "encoding": encoding,
        "is_text": is_text,
        "is_binary": is_binary,
        "error": error,
    }

def read_binary_file_as_base64(path: str) -> str:
    path = _normalize_path(path)
    import re
    p = Path(path)
    if not p.exists():
        clean_path = re.sub(r'([\u4e00-\u9fa5])\s+([a-zA-Z0-9_])', r'\1\2', path)
        clean_path = re.sub(r'([a-zA-Z0-9_])\s+([\u4e00-\u9fa5])', r'\1\2', clean_path)
        if Path(clean_path).exists():
            path = clean_path
    data = Path(path).read_bytes()
    return base64.b64encode(data).decode("ascii")

def write_file_content(path: str, content: str) -> Dict:
    path = _normalize_path(path)
    import re
    p = Path(path)
    if not p.exists() and not p.parent.exists():
        clean_path = re.sub(r'([\u4e00-\u9fa5])\s+([a-zA-Z0-9_])', r'\1\2', path)
        clean_path = re.sub(r'([a-zA-Z0-9_])\s+([\u4e00-\u9fa5])', r'\1\2', clean_path)
        if Path(clean_path).parent.exists():
            path = clean_path
            p = Path(path)
    
    if p.exists() and p.is_dir():
        return {
            "path": str(p),
            "content": None,
            "size": 0,
            "modified": 0,
            "encoding": "utf-8",
            "is_text": False,
            "is_binary": False,
            "error": "Target path is a directory",
        }
    p.write_text(content, encoding="utf-8")
    return read_file_content(str(p))

def write_binary_file_content(path: str, base64_content: str) -> Dict:
    path = _normalize_path(path)
    base64_content = _normalize_path(base64_content)
    import re
    p = Path(path)
    if not p.exists() and not p.parent.exists():
        clean_path = re.sub(r'([\u4e00-\u9fa5])\s+([a-zA-Z0-9_])', r'\1\2', path)
        clean_path = re.sub(r'([a-zA-Z0-9_])\s+([\u4e00-\u9fa5])', r'\1\2', clean_path)
        if Path(clean_path).parent.exists():
            path = clean_path
            p = Path(path)
            
    if p.exists() and p.is_dir():
        return {
            "path": str(p),
            "content": None,
            "size": 0,
            "modified": 0,
            "encoding": "utf-8",
            "is_text": False,
            "is_binary": False,
            "error": "Target path is a directory",
        }
    
    # Remove data URI prefix if present
    if "," in base64_content:
        base64_content = base64_content.split(",", 1)[1]
        
    p.write_bytes(base64.b64decode(base64_content))
    return read_file_content(str(p))

def copy_files(source_paths: List[str], target_directory: str) -> List[str]:
    copied_files = []
    target_path = Path(target_directory)
    
    if not target_path.exists():
        try:
            target_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print(f"Failed to create target directory: {e}")
            return copied_files

    for source in source_paths:
        try:
            src_path = Path(source)
            if src_path.exists():
                dst_path = target_path / src_path.name
                
                # Auto rename if file exists
                if dst_path.exists():
                    stem = src_path.stem
                    suffix = src_path.suffix
                    counter = 1
                    while dst_path.exists():
                        dst_path = target_path / f"{stem} ({counter}){suffix}"
                        counter += 1
                
                if src_path.is_dir():
                    shutil.copytree(source, dst_path)
                else:
                    shutil.copy2(source, dst_path)
                copied_files.append(str(dst_path))
        except Exception as e:
            print(f"Error copying {source}: {e}")
            # Continue with other files
            
    return copied_files

def create_directory(path: str) -> bool:
    p = Path(path)
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)
        return True
    return False

def delete_path(path: str) -> bool:
    p = Path(path)
    if p.exists():
        if p.is_dir():
            shutil.rmtree(path)
        else:
            p.unlink()
        return True
    return False

def rename_path(old_path: str, new_path: str) -> bool:
    p = Path(old_path)
    if p.exists():
        p.rename(new_path)
        return True
    return False
