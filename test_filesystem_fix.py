
import os
from pathlib import Path

def read_file_content_mock(path: str):
    p = Path(path)
    encoding = "utf-8"
    error = None
    if not (p.exists() and p.is_file()):
        error = "File not found"
    
    # Mocking the implementation from filesystem.py
    data = p.read_bytes() if error is None else b""
    decoded = data.decode(encoding, errors="ignore") if data else ""
    is_text = True if (decoded or len(data) == 0) else False
    is_binary = not is_text
    content = decoded if is_text else None
    
    stat = p.stat() if p.exists() else None
    return {
        "path": str(p),
        "content": content,
        "size": int(stat.st_size) if stat else 0,
        "is_text": is_text,
        "is_binary": is_binary,
        "error": error,
    }

# Create empty file
empty_file = "test_empty.txt"
Path(empty_file).write_bytes(b"")

# Test
result = read_file_content_mock(empty_file)
print(f"Empty file test: {result}")

# Create non-empty text file
text_file = "test_text.txt"
Path(text_file).write_text("hello", encoding="utf-8")
result_text = read_file_content_mock(text_file)
print(f"Text file test: {result_text}")

# Cleanup
os.remove(empty_file)
os.remove(text_file)
