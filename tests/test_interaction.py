import sys
import os
import time

# Add crates to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../crates")))

from qwen_adapter import QwenProcess
from cli_runner import resolve_executable

def test_qwen_interaction():
    # Resolve executable
    exe = resolve_executable("qwen")
    print(f"Resolved executable: {exe}")
    
    # Initialize process
    proc = QwenProcess(exe)
    
    # Send message
    question = "你是谁"
    print(f"Sending question: {question}")
    proc.handle_input(question)
    
    # Wait for response
    timeout = 120
    start_time = time.time()
    response_found = False
    
    print(f"Waiting for response (timeout={timeout}s)...")
    while time.time() - start_time < timeout:
        # Check stdout queue for activity
        while not proc.stdout_queue.empty():
            line = proc.stdout_queue.get()
            elapsed = time.time() - start_time
            print(f"[{elapsed:.2f}s] STDOUT_QUEUE: {line.strip()[:100]}...")

        # Check history for assistant response
        if len(proc.history) > 0 and proc.history[-1]["role"] == "assistant":
            print("\nResponse received:")
            print("-" * 20)
            print(proc.history[-1]['content'])
            print("-" * 20)
            response_found = True
            break
            
        # Also check for errors in stderr queue
        while not proc.stderr_queue.empty():
            err = proc.stderr_queue.get()
            print(f"STDERR: {err}")
            
        time.sleep(0.5)
        
    if not response_found:
        print("Timeout waiting for response")
        # Check stdout/stderr one last time
        while not proc.stdout_queue.empty():
            print(f"STDOUT: {proc.stdout_queue.get()}")
        while not proc.stderr_queue.empty():
            print(f"STDERR: {proc.stderr_queue.get()}")

    proc.terminate()

if __name__ == "__main__":
    test_qwen_interaction()
