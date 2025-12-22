import os
import sys
import json
import shutil

# Add crates directory to sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CRATES_DIR = os.path.join(BASE_DIR, "crates")
if CRATES_DIR not in sys.path:
    sys.path.insert(0, CRATES_DIR)

from backend.api import Api

def test_mcp_config():
    api = Api()
    
    # Backup existing config if any
    config_path = os.path.expanduser("~/.qwen/settings.json")
    backup_path = config_path + ".bak"
    if os.path.exists(config_path):
        shutil.copy(config_path, backup_path)
        print(f"Backed up existing config to {backup_path}")
    
    try:
        # Test 1: Save config
        print("Testing save_mcp_config...")
        test_config = {
            "mcpServers": {
                "test-server": {
                    "command": "echo",
                    "args": ["hello"]
                }
            }
        }
        api.save_mcp_config(test_config)
        
        # Test 2: Get config
        print("Testing get_mcp_config...")
        loaded_config = api.get_mcp_config()
        print(f"Loaded config: {json.dumps(loaded_config, indent=2)}")
        
        if loaded_config.get("mcpServers", {}).get("test-server", {}).get("command") == "echo":
            print("SUCCESS: Config saved and loaded correctly.")
        else:
            print("FAILURE: Config mismatch.")
            
    finally:
        # Restore backup
        if os.path.exists(backup_path):
            shutil.move(backup_path, config_path)
            print(f"Restored config from {backup_path}")
        elif os.path.exists(config_path):
            # If no backup existed (file didn't exist), remove the created file
            os.remove(config_path)
            print("Removed created config file.")

if __name__ == "__main__":
    test_mcp_config()
