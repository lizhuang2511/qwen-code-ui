import os
import shutil
import json
import time
import sys

# Ensure crates is in path
sys.path.insert(0, os.path.join(os.getcwd(), "crates"))

from backend import version_utils

# Use version_utils for testing as it is the primary one used by API
utils = version_utils

def test_fix():
    test_dir = os.path.abspath("test_workspace")
    if os.path.exists(test_dir):
        # Retry cleanup for Windows file locks
        for _ in range(5):
            try:
                shutil.rmtree(test_dir)
                break
            except:
                time.sleep(0.5)
                
    os.makedirs(test_dir)
    
    # Create files
    os.makedirs(os.path.join(test_dir, "dir1"))
    os.makedirs(os.path.join(test_dir, "excluded_dir"))
    
    with open(os.path.join(test_dir, "file1.txt"), "w") as f: f.write("content1")
    with open(os.path.join(test_dir, "dir1", "file2.txt"), "w") as f: f.write("content2")
    with open(os.path.join(test_dir, "excluded.txt"), "w") as f: f.write("excluded content")
    with open(os.path.join(test_dir, "excluded_dir", "file3.txt"), "w") as f: f.write("excluded dir content")
    
    # Create config
    config_path = os.path.join(test_dir, "config.json")
    with open(config_path, "w") as f:
        json.dump({"excluded_paths": ["excluded.txt", "excluded_dir"]}, f)
        
    print(f"Config created at {config_path}")
    
    # Init
    print("Initializing backup...")
    utils.init_backup(test_dir)
    
    # Create snapshot
    print("Creating snapshot...")
    success = utils.create_snapshot(test_dir, "Initial commit", "Init")
    if not success:
        print("Failed to create snapshot")
        return
        
    # Verify Zip content
    history = utils.get_history(test_dir)
    latest_id = history[0]["id"]
    zip_path = os.path.join(test_dir, ".history", f"{latest_id}.zip")
    
    import zipfile
    print(f"Checking zip: {zip_path}")
    with zipfile.ZipFile(zip_path, 'r') as z:
        names = z.namelist()
        print("Zip contents:", names)
        if "excluded.txt" in names:
            print("ERROR: excluded.txt found in zip")
        if "excluded_dir/file3.txt" in names:
            print("ERROR: excluded_dir/file3.txt found in zip")
        if "file1.txt" not in names:
            print("ERROR: file1.txt not found in zip")
            
    # Modify workspace
    print("Modifying workspace...")
    with open(os.path.join(test_dir, "file1.txt"), "w") as f: f.write("modified content")
    os.remove(os.path.join(test_dir, "dir1", "file2.txt"))
    # Modify excluded file to see if it persists
    with open(os.path.join(test_dir, "excluded.txt"), "w") as f: f.write("modified excluded content")
    
    # Restore
    print("Restoring...")
    utils.restore_version(test_dir, latest_id)
    
    # Verify Restore
    print("Verifying restore...")
    with open(os.path.join(test_dir, "file1.txt"), "r") as f:
        if f.read() != "content1":
            print("ERROR: file1.txt not restored")
        else:
            print("file1.txt restored correctly")
            
    if not os.path.exists(os.path.join(test_dir, "dir1", "file2.txt")):
        print("ERROR: file2.txt not restored")
    else:
        print("file2.txt restored correctly")
        
    with open(os.path.join(test_dir, "excluded.txt"), "r") as f:
        content = f.read()
        if content == "modified excluded content":
            print("excluded.txt preserved correctly")
        else:
            print(f"ERROR: excluded.txt was overwritten/deleted. Content: {content}")

    if os.path.exists(os.path.join(test_dir, "excluded_dir", "file3.txt")):
         print("excluded_dir/file3.txt preserved correctly")
    else:
         print("ERROR: excluded_dir/file3.txt was deleted")

if __name__ == "__main__":
    # Ensure crates is in path
    sys.path.insert(0, os.path.join(os.getcwd(), "crates"))
    test_fix()
