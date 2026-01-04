import os
import shutil
import sys
import zipfile
import json

# Add crates to path
sys.path.insert(0, os.path.join(os.getcwd(), "crates"))

from backend import version_utils

TEST_DIR = os.path.abspath("test_env_config")

def setup():
    if os.path.exists(TEST_DIR):
        try:
            shutil.rmtree(TEST_DIR)
        except:
            pass
    if not os.path.exists(TEST_DIR):
        os.makedirs(TEST_DIR)

def test_config_creation():
    print("\nTesting config creation...")
    # Should create .history/config.json
    ex = version_utils.get_excluded_paths(TEST_DIR)
    config_path = os.path.join(TEST_DIR, ".history", "config.json")
    if os.path.exists(config_path):
        print("PASS: Config created at .history/config.json")
        with open(config_path, 'r') as f:
            print("Content:", f.read())
    else:
        print("FAIL: Config not created")

def test_backup_restore():
    print("\nTesting backup/restore...")
    # Add some data to config
    config_path = os.path.join(TEST_DIR, ".history", "config.json")
    with open(config_path, "w", encoding="utf-8") as f:
        f.write('{"excluded_paths": ["ignore_me"]}')
    
    # Create a dummy file to zip
    with open(os.path.join(TEST_DIR, "file.txt"), "w") as f:
        f.write("content")
        
    # Backup
    # Need to ensure .history exists (it does)
    zip_path = os.path.join(TEST_DIR, ".history", "backup.zip")
    version_utils._zip_workspace(TEST_DIR, zip_path)
    
    # Check zip content
    with zipfile.ZipFile(zip_path, 'r') as z:
        names = z.namelist()
        print(f"Zip contents: {names}")
        # normalize slashes for check
        norm_names = [n.replace("\\", "/") for n in names]
        if ".history/config.json" in norm_names:
             print("PASS: config.json in zip")
        else:
             print("FAIL: config.json not in zip")
             
    # Restore
    # Delete local config to verify restore
    os.remove(config_path)
    if os.path.exists(config_path):
        print("Error: failed to delete config for test")
        
    # restore_version expects version_id, looks for {version_id}.zip in .history
    # Our zip is named backup.zip, so version_id is "backup"
    
    res = version_utils.restore_version(TEST_DIR, "backup")
    print(f"Restore result: {res}")
    
    if os.path.exists(config_path):
        print("PASS: Config restored")
        with open(config_path, 'r') as f:
            print("Restored content:", f.read())
    else:
        print("FAIL: Config not restored")

if __name__ == "__main__":
    setup()
    test_config_creation()
    test_backup_restore()
