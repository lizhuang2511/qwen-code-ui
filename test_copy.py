import sys
import os
import shutil
from pathlib import Path

# Setup path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CRATES_DIR = os.path.join(BASE_DIR, "crates")
sys.path.insert(0, CRATES_DIR)

from backend.api import Api

def test_copy():
    api = Api()
    
    # Create test files
    os.makedirs("test_source", exist_ok=True)
    os.makedirs("test_target", exist_ok=True)
    
    with open("test_source/file1.txt", "w") as f:
        f.write("content1")
        
    os.makedirs("test_source/subdir", exist_ok=True)
    with open("test_source/subdir/file2.txt", "w") as f:
        f.write("content2")

    # Test copy file
    source_paths = [
        os.path.abspath("test_source/file1.txt"),
        os.path.abspath("test_source/subdir")
    ]
    target_dir = os.path.abspath("test_target")
    
    print(f"Copying {source_paths} to {target_dir}")
    
    copied = api.copy_files({"paths": source_paths, "target": target_dir})
    print(f"Copied files: {copied}")
    
    # Verify
    assert os.path.exists("test_target/file1.txt")
    assert os.path.exists("test_target/subdir")
    assert os.path.exists("test_target/subdir/file2.txt")
    
    # Test rename on collision
    copied2 = api.copy_files({"paths": [os.path.abspath("test_source/file1.txt")], "target": target_dir})
    print(f"Copied collision: {copied2}")
    assert os.path.exists("test_target/file1 (1).txt")
    
    print("Test passed!")
    
    # Cleanup
    shutil.rmtree("test_source")
    shutil.rmtree("test_target")

if __name__ == "__main__":
    test_copy()
