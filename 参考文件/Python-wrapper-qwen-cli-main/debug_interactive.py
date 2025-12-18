import subprocess
import json
import sys
import time
from qwen_python_wrapper import QwenPythonWrapper

def test_interactive():
    wrapper = QwenPythonWrapper()
    print(f"Using CLI path: {wrapper.cli_path}")
    
    print("Starting qwen in interactive TEXT mode...")
    cmd = [wrapper.cli_path, "--input-format", "text", "--output-format", "stream-json", "--no-telemetry"]
    
    print(f"Command: {cmd}")
    
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        encoding='utf-8',
        errors='replace'
    )
    
    print("Process started. Waiting a bit...")
    time.sleep(2)
    
    # Send plain text
    msg = "hi\n"
    
    print(f"Sending: {msg.strip()}")
    process.stdin.write(msg)
    process.stdin.flush()
    
    print("Reading output...")
    start = time.time()
    while True:
        line = process.stdout.readline()
        if line:
            print(f"Received ({time.time()-start:.2f}s): {line.strip()}")
        else:
            if process.poll() is not None:
                print(f"Process exited with code {process.returncode}")
                print(f"Stderr: {process.stderr.read()}")
                break
            time.sleep(0.1)
            
        if time.time() - start > 15: # Wait a bit longer for the first response
            print("Timeout waiting for response")
            # Print stderr to see what's happening
            print(f"Stderr content: {process.stderr.read()}")
            break

    process.terminate()

if __name__ == "__main__":
    test_interactive()
