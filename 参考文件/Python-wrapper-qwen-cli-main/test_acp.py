import subprocess
import json
import sys
import time
import os

def read_json_response(process):
    while True:
        line = process.stdout.readline()
        if not line:
            return None
        line = line.strip()
        print(f"RAW < {line}")
        if line.startswith('{'):
            try:
                return json.loads(line)
            except:
                pass

def send_request(process, method, params, req_id):
    req = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": req_id
    }
    json_req = json.dumps(req)
    print(f"RAW > {json_req}")
    process.stdin.write(json_req + "\n")
    process.stdin.flush()

def test_acp():
    # Attempt to locate qwen
    import shutil
    qwen_path = shutil.which("qwen")
    if not qwen_path:
        # Fallback to known path if available or fail
        qwen_path = r"C:\nvm4w\nodejs\qwen.cmd" 
    
    print(f"Using qwen at: {qwen_path}")
    
    # Start qwen with ACP flags
    # Based on Rust: cmd.exe /C qwen --experimental-acp
    cmd = [qwen_path, "--experimental-acp", "--no-telemetry"]
    
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
        encoding='utf-8',
        errors='replace'
    )
    
    print("Process started. Initializing...")
    
    # 1. Initialize
    # Must use camelCase and provide fs capabilities
    init_params = {
        "protocolVersion": 1, 
        "clientCapabilities": {
            "fs": {
                "readTextFile": False,
                "writeTextFile": False
            }
        }
    }
    send_request(process, "initialize", init_params, 1)
    res = read_json_response(process)
    print(f"Init Response: {res}")
    
    # 2. Create Session
    # Must use camelCase: mcpServers
    send_request(process, "session/new", {"cwd": os.getcwd(), "mcpServers": []}, 2)
    res = read_json_response(process)
    print(f"Session New Response: {res}")
    
    if not res or 'result' not in res:
        print("Failed to create session")
        return

    session_id = res['result']['sessionId']
    print(f"Got Session ID: {session_id}")
    
    # 3. Send Prompt
    # prompt must be camelCase? Rust uses SessionPromptParams which has session_id and prompt.
    # Let's try both or check Rust struct.
    # Rust: pub struct SessionPromptParams { pub session_id: String, pub prompt: Vec<ContentBlock> }
    # Likely serializes to camelCase: sessionId
    
    prompt_msg = [{"type": "text", "text": "1+1=?"}] 
    
    send_request(process, "session/prompt", {
        "sessionId": session_id,
        "prompt": prompt_msg
    }, 3)
    
    # Read stream until end
    while True:
        line = process.stdout.readline()
        if not line:
            break
        print(f"STREAM < {line.strip()}")
        try:
            data = json.loads(line)
            if data.get('method') == 'streamAssistantMessageChunk':
                chunk = data['params']['chunk']
                if 'text' in chunk:
                    print(f"Content: {chunk['text']}", end="", flush=True)
            elif 'result' in data and data.get('id') == 3:
                print("\nRequest 3 Done.")
                break
        except:
            pass
            
    process.terminate()

if __name__ == "__main__":
    test_acp()
