import os
import shutil
import json
import time
import sys
import zipfile

# Ensure crates is in path
sys.path.insert(0, os.path.join(os.getcwd(), "crates"))

from backend import version_utils

# Use version_utils for testing as it is the primary one used by API
utils = version_utils

def test_chinese_exclude():
    test_dir = os.path.abspath("test_chinese_workspace")
    if os.path.exists(test_dir):
        # Retry cleanup for Windows file locks
        for _ in range(5):
            try:
                shutil.rmtree(test_dir)
                break
            except:
                time.sleep(0.5)
                
    if not os.path.exists(test_dir):
        os.makedirs(test_dir)
    
    # Create structure
    # root/
    #   文档/
    #     测试.md
    #   other/
    #     file.txt
    #   config.json
    
    doc_dir = os.path.join(test_dir, "文档")
    os.makedirs(doc_dir, exist_ok=True)
    with open(os.path.join(doc_dir, "测试.md"), "w", encoding="utf-8") as f:
        f.write("test content")
        
    other_dir = os.path.join(test_dir, "other")
    os.makedirs(other_dir, exist_ok=True)
    with open(os.path.join(other_dir, "file.txt"), "w") as f:
        f.write("normal content")
        
    # Test cases for exclude patterns
    patterns_to_test = [
        ["文档"], 
        ["./文档"], 
        ["文档/"], 
        [".\\文档"]
    ]
    
    for i, patterns in enumerate(patterns_to_test):
        print(f"\n--- Testing patterns: {patterns} ---")
        
        # Clear history if exists
        history_dir = os.path.join(test_dir, ".history")
        if os.path.exists(history_dir):
            shutil.rmtree(history_dir)
            
        # Init backup (creates .history)
        utils.init_backup(test_dir)
        
        # Write config
        config_path = os.path.join(test_dir, ".history", "config.json")
        # os.makedirs(os.path.dirname(config_path), exist_ok=True) # init_backup does this
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump({"excluded_paths": patterns}, f, ensure_ascii=False)

        # Backup
        utils.create_snapshot(test_dir, f"Commit {i}")
        
        # Verify zip
        history = utils.get_history(test_dir)
        if not history:
            print("ERROR: No history created")
            continue
            
        latest_id = history[0]["id"]
        zip_path = os.path.join(history_dir, f"{latest_id}.zip")
        
        found_doc = False
        with zipfile.ZipFile(zip_path, 'r') as z:
            names = z.namelist()
            # print(f"Zip contents: {names}")
            for n in names:
                # Check if "文档" folder or content is in zip
                # In zip, names usually use /
                # Encoded names might be issue, but Python zipfile handles utf-8 usually
                if "文档" in n:
                    found_doc = True
                    print(f"ERROR: Found excluded item in zip: {n}")
                    
        if not found_doc:
            print("SUCCESS: '文档' correctly excluded from zip")
        else:
            print("FAILED: '文档' was NOT excluded")

if __name__ == "__main__":
    test_chinese_exclude()
