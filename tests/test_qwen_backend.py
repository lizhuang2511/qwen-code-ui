import sys
import os
import time
import threading

# Add crates to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
crates_dir = os.path.join(project_root, "crates")
sys.path.append(crates_dir)

from qwen_adapter import QwenProcess
from cli_runner import resolve_qwen_executable

def test_backend_communication():
    print("🚀 Starting Backend Communication Test...")
    
    # Check credentials
    if not QwenProcess.check_credentials():
        print("❌ Credentials not found at ~/.qwen/oauth_creds.json")
        return

    # Resolve executable
    exe = resolve_qwen_executable()
    print(f"ℹ️  Resolved executable: {exe}")
    
    # Initialize Process
    print("⏳ Initializing QwenProcess...")
    proc = QwenProcess(exe)
    
    if not proc.session_id:
        print("❌ Failed to establish session (Handshake failed)")
        proc.terminate()
        return
        
    print("✅ Session established!")

    # Send Query
    query = "Please calculate 1+1 and return ONLY the number."
    print(f"📤 Sending query: {query}")
    proc.handle_input(query)

    # Read Output
    print("📥 Reading output...")
    start_time = time.time()
    response_content = ""
    
    while time.time() - start_time < 30: # 30s timeout
        try:
            # We read from the queue iterator
            line = next(proc.stdout) 
            print(f"RAW: {line.strip()}")
            
            # Simple check for content in JSON-RPC
            # We don't have full parsing here, just checking if we get response
            if "content" in line and "text" in line:
                import json
                try:
                    data = json.loads(line)
                    # Try to extract text based on ACP protocol structure
                    # session/update -> update -> content -> text
                    if "method" in data and data["method"] == "session/update":
                        update = data.get("params", {}).get("update", {})
                        content = update.get("content", {})
                        if content.get("type") == "text":
                             text = content.get("text", "")
                             response_content += text
                             print(f"🔹 Extracted: {text}")
                except:
                    pass
            
            # Check if we got "2"
            if "2" in response_content:
                print("\n✅ Test Passed: Received '2' in response")
                break
                
            # Check for end of turn
            if "stopReason" in line and "end_turn" in line:
                print("\nℹ️  Turn finished")
                break
                
        except StopIteration:
            break
        except Exception as e:
            # Queue empty is not raised by QueueIterator, it blocks.
            # But we should be careful about blocking forever.
            # QwenProcess.stdout is a blocking iterator.
            # In a real test we might want non-blocking or timeout.
            pass

    if "2" in response_content:
        pass
    else:
        print(f"\n⚠️  Test finished. Full response: {response_content}")
        if not response_content:
             print("❌ No content received.")

    print("🛑 Terminating process...")
    proc.terminate()
    print("✅ Done.")

if __name__ == "__main__":
    test_backend_communication()
