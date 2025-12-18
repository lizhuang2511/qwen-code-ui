import os
import base64
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
    is_text = True if decoded else False
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
    p.write_text(content, encoding="utf-8")
    return read_file_content(str(p))
