import os
import base64
import shutil
from pathlib import Path
from typing import List, Dict, Optional

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
    for item in p.iterdir():
        stat = item.stat()
        entries.append(
            {
                "name": item.name,
                "is_directory": item.is_dir(),
                "full_path": str(item.resolve()),
                "size": int(stat.st_size),
                "modified": int(stat.st_mtime),
            }
        )
    return entries

def read_file_content(path: str) -> Dict:
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
    data = Path(path).read_bytes()
    return base64.b64encode(data).decode("ascii")

def write_file_content(path: str, content: str) -> Dict:
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
