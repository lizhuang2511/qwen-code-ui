import subprocess
import json
import os
import shutil
import time
import threading

def find_executable():
    """Find qwen executable."""
    candidates = ["qwencodecli", "qwen-code", "qwen"]
    for name in candidates:
        path = shutil.which(name)
        if path: return path
    if os.name == "nt":
        common_paths = [
            os.path.expanduser("~\\AppData\\Roaming\\npm\\qwen.cmd"),
            os.path.expanduser("~\\AppData\\Local\\npm\\qwen.cmd"),
            "C:\\Program Files\\nodejs\\qwen.cmd",
            "C:\\Program Files (x86)\\nodejs\\qwen.cmd",
            "C:\\nvm4w\\nodejs\\qwen.cmd",
        ]
        for path in common_paths:
            if os.path.exists(path): return path
    return None

def run_test():
    exe = find_executable()
    if not exe:
        print("Error: qwen executable not found")
        return

    print(f"Executable: {exe}")
    
    # 1. Start Process with ACP flags
    cmd = [exe, "--experimental-acp", "--no-telemetry"]
    print(f"Starting: {cmd}")
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        # Remove text=True to handle bytes manually and avoid GBK errors on Windows
        bufsize=0 
    )

    def send_json(data):
        msg = json.dumps(data)
        print(f"-> SEND: {msg}")
        process.stdin.write((msg + "\n").encode('utf-8'))
        process.stdin.flush()

    # Shared variable to store session ID
    session_info = {"id": None}
    
    # Reader thread
    def reader_loop():
        while True:
            line_bytes = process.stdout.readline()
            if not line_bytes: break
            try:
                # Use replace to handle potential encoding errors gracefully
                line = line_bytes.decode('utf-8', errors='replace')
                data = json.loads(line)
                
                # Capture Session ID
                if "result" in data and isinstance(data["result"], dict):
                     if "sessionId" in data["result"]:
                         session_info["id"] = data["result"]["sessionId"]
                         print(f"*** Session ID Captured: {session_info['id']} ***")

                # Print simplified output for readability
                if "method" in data and data["method"] == "session/update":
                    update = data["params"]["update"]
                    if "content" in update:
                         print(f"<- RECV (Content): {update['content']['text']}")
                    elif "sessionUpdate" in update:
                         print(f"<- RECV (Update): {update['sessionUpdate']}")
                elif "error" in data:
                     print(f"<- RECV (Error): {data['error']}")
                else:
                    # Truncate long lines
                    print(f"<- RECV: {line.strip()[:200]}...")
            except:
                print(f"<- RECV (Raw): {line_bytes}")

    threading.Thread(target=reader_loop, daemon=True).start()

    try:
        # 2. Handshake
        time.sleep(1)
        # Fix Initialize Params: Add required clientCapabilities structure
        send_json({
            "jsonrpc": "2.0",
            "method": "initialize",
            "params": {
                "protocolVersion": 1, 
                "clientCapabilities": {
                    "fs": {"readTextFile": False, "writeTextFile": False} # Minimal requirement
                }
            },
            "id": 1
        })
        
        time.sleep(1)
        send_json({
            "jsonrpc": "2.0",
            "method": "session/new",
            "params": {"cwd": os.getcwd(), "mcpServers": []},
            "id": 2
        })

        # Wait for session to be established and ID captured
        print("Waiting for Session ID...")
        for _ in range(10):
            if session_info["id"]: break
            time.sleep(0.5)
            
        if not session_info["id"]:
            print("Failed to capture Session ID. Exiting.")
            return

        # 3. Send /approval-mode as prompt
        print("\n--- Sending /approval-mode ---")
        send_json({
            "jsonrpc": "2.0",
            "method": "session/prompt",
            "params": {
                "sessionId": session_info["id"],
                "prompt": [{"type": "text", "text": "/approval-mode"}]
            },
            "id": 3
        })
        
        time.sleep(5)

        # 4. Send Query
        print("\n--- Sending Query ---")
        send_json({
            "jsonrpc": "2.0",
            "method": "session/prompt",
            "params": {
                "sessionId": session_info["id"],
                "prompt": [{"type": "text", "text": "你现在什么模式"}]
            },
            "id": 4
        })
        
        time.sleep(10) # Give more time for response

    except KeyboardInterrupt:
        pass
    finally:
        process.terminate()

if __name__ == "__main__":
    run_test()
