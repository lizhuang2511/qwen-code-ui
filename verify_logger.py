
import sys
import os
import json
import time
from pathlib import Path
from datetime import datetime

# Add crates to path
sys.path.append(os.path.join(os.getcwd(), "crates"))

import session
import search
import events

# Mock events
def mock_emit(event, data):
    pass
events.emit = mock_emit

def verify_logger():
    session_id = f"test_log_{int(time.time())}"
    print(f"Starting session {session_id}...")
    
    # Start session (creates logger)
    session.start_session(session_id, ".", "test-model")
    
    # Send user message (should log session/prompt)
    print("Sending user message...")
    session.send_message(session_id, "Hello from logger!")
    
    # Simulate backend response (should log agent_message_chunk)
    # We can't easily simulate the full backend loop without mocking subprocess,
    # but we can verify that send_message logged something.
    
    log_path = Path(f"data/projects/default/rpc-log-{session_id}.log")
    if not log_path.exists():
        print(f"FAIL: Log file {log_path} not created")
        return

    print(f"PASS: Log file created at {log_path}")
    
    # Read log content
    with open(log_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        if not lines:
            print("FAIL: Log file is empty")
            return
        
        first_line = json.loads(lines[0])
        if first_line.get("method") != "session/prompt":
            print(f"FAIL: First log entry is not session/prompt. Got {first_line.get('method')}")
            return
        
        prompt_text = first_line["params"]["prompt"][0]["text"]
        if prompt_text != "Hello from logger!":
            print(f"FAIL: Prompt text mismatch. Got '{prompt_text}'")
            return
        
    print("PASS: User message logged correctly")

    # Now verify search.py can read it
    print("Verifying search...")
    chats = search.get_recent_chats()
    found = next((c for c in chats if c["id"] == session_id), None)
    
    if not found:
        print("FAIL: Session not found in get_recent_chats")
        # Debug: print chats
        print("Chats found:", chats)
        return
        
    if found["title"] != "Hello from logger!":
        print(f"FAIL: Title mismatch in search. Got '{found['title']}'")
        return
        
    print("PASS: Session found in search list")
    
    # Verify detailed conversation
    print("Verifying detailed conversation...")
    conv = search.get_detailed_conversation(session_id)
    if not conv["messages"]:
        print("FAIL: No messages in detailed conversation")
        return
        
    msg = conv["messages"][0]
    if msg["content"] != "Hello from logger!":
        print("FAIL: Message content mismatch in detail view")
        return
        
    print("PASS: Detailed conversation reconstructed correctly")
    print("ALL TESTS PASSED")

if __name__ == "__main__":
    verify_logger()
