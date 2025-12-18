import sys
import os
import json
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

# Setup path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
crates_path = os.path.join(project_root, "crates")
if crates_path not in sys.path:
    sys.path.insert(0, crates_path)

# Cligent module has been removed
print("[Info] Cligent module has been removed from the codebase.")
print("[Info] This test is no longer valid and will exit.")
sys.exit(0)

def test_cligent_workflow():
    print("=== Starting Cligent Workflow Test ===")
    
    # Create a temporary directory to act as HOME
    with tempfile.TemporaryDirectory() as temp_home:
        temp_home_path = Path(temp_home)
        
        # Patch Path.home to return our temp dir
        # We also need to patch os.path.expanduser because some code might use it
        with patch("pathlib.Path.home", return_value=temp_home_path), \
             patch("os.path.expanduser", side_effect=lambda p: str(temp_home_path / p.replace("~/", "").replace("~", "")) if p.startswith("~") else p):
            
            print(f"[Setup] Mocked HOME: {temp_home_path}")
            
            # Setup Qwen logs directory
            qwen_dir = temp_home_path / ".qwen"
            qwen_dir.mkdir(parents=True, exist_ok=True)
            
            # Create a sample session log (JSONL format)
            session_id = "session-test-001"
            log_file = qwen_dir / f"{session_id}.jsonl"
            
            messages = [
                {"role": "user", "content": "Hello Qwen", "timestamp": "2024-01-01T10:00:00Z"},
                {"role": "assistant", "content": "Hello! How can I help you?", "timestamp": "2024-01-01T10:00:01Z"},
                {"role": "user", "content": "Write some python", "timestamp": "2024-01-01T10:00:05Z"},
                {"role": "assistant", "content": "Sure, here is code...", "timestamp": "2024-01-01T10:00:10Z"}
            ]
            
            with open(log_file, "w", encoding="utf-8") as f:
                for msg in messages:
                    f.write(json.dumps(msg) + "\n")
            
            print(f"[Setup] Created log file: {log_file}")
            
            # --- User's Test Logic ---
            
            # Create an agent (using qwen as it matches our context)
            print("\n[Action] Creating Qwen agent...")
            try:
                agent = create("qwen")
            except Exception as e:
                print(f"[Error] Failed to create agent: {e}")
                import traceback
                traceback.print_exc()
                return

            # List available logs
            print("\n[Action] Listing logs...")
            logs = agent.list_logs()
            print(f"Found {len(logs)} conversation logs")
            for uri, meta in logs:
                print(f"  - URI: {uri}, Time: {meta.get('last_modified')}")

            if not logs:
                print("[Error] No logs found! Please check log store implementation.")
                # Fallback: try to parse the file directly if list fails
                target_log_uri = str(log_file)
            else:
                target_log_uri = logs[0][0] 

            # Parse the most recent conversation
            print(f"\n[Action] Parsing log: {target_log_uri}")
            chat = agent.parse(target_log_uri)
            
            if chat:
                print(f"Latest chat has {len(chat.messages)} messages")
                for i, msg in enumerate(chat.messages):
                    print(f"  [{i}] {msg.role}: {msg.content[:20]}...")
            else:
                print("[Error] Failed to parse chat")
                return
            
            # Select specific messages and export to YAML
            # Selecting 1st (Hello Qwen) and 3rd (Write some python) -> indices 0 and 2
            print("\n[Action] Selecting messages [0, 2]...")
            agent.select(target_log_uri, [0, 2])
            
            print("\n[Action] Composing YAML...")
            yaml_output = agent.compose()
            print("--- YAML Output ---")
            print(yaml_output)
            print("-------------------")
            
            # Save YAML to file (simulating user action)
            yaml_file = temp_home_path / "conversation.yaml"
            with open(yaml_file, "w", encoding="utf-8") as f:
                f.write(yaml_output)
            
            # Load messages from YAML file
            print("\n[Action] Decomposing YAML from file...")
            with open(yaml_file, "r", encoding="utf-8") as f:
                yaml_content = f.read()
            
            loaded_chat = agent.decompose(yaml_content)
            print(f"Loaded {len(loaded_chat.messages)} messages from YAML")
            
            # Verify loaded content
            if len(loaded_chat.messages) == 2:
                print("[Success] Loaded correct number of messages.")
                # Note: Role might be enum, compare str
                if str(loaded_chat.messages[0].content) == "Hello Qwen" and str(loaded_chat.messages[1].content) == "Write some python":
                     print("[Success] Message content verified.")
                else:
                     print(f"[Fail] Message content mismatch: {[m.content for m in loaded_chat.messages]}")
            else:
                print(f"[Fail] Expected 2 messages, got {len(loaded_chat.messages)}")

if __name__ == "__main__":
    test_cligent_workflow()
