import os
import sys

def check():
    home = os.path.expanduser("~")
    print(f"Home: {home}")
    
    path = os.path.join(home, ".qwen", "settings.json")
    print(f"Target Path: {path}")
    
    exists = os.path.exists(path)
    print(f"Exists: {exists}")
    
    if exists:
        with open(path, "r", encoding="utf-8") as f:
            print("Content Preview:")
            print(f.read()[:100])

if __name__ == "__main__":
    check()
