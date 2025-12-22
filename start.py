import os
import sys
import threading
import json
import webview
import subprocess
import time
import atexit

# Configuration
# You can set default environment variables here
# os.environ["QWEN_MODEL"] = "qwen-max"  # Default model
# os.environ["DASHSCOPE_API_KEY"] = "sk-..."  # Your API Key

# Ensure we can import from crates package
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CRATES_DIR = os.path.join(BASE_DIR, "crates")
if CRATES_DIR not in sys.path:
    sys.path.insert(0, CRATES_DIR)

from backend.api import Api  # type: ignore


def get_entry_html() -> str:
    paths = [
        os.path.join(BASE_DIR, "frontend", "dist", "index.html"),
        os.path.join(BASE_DIR, "frontend", "index.html"),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    print("index.html not found. Please run: pnpm -C frontend build")
    raise RuntimeError("index.html not found. Please run: pnpm -C frontend build")


def start_backend():
    print("Starting backend server on port 1858...")
    # Use array for command to avoid shell injection and better handling
    cmd = [sys.executable, "-m", "uvicorn", "server.main:app", "--port", "1858", "--host", "127.0.0.1"]
    # No dev mode flags for start.py
    return subprocess.Popen(cmd, cwd=BASE_DIR)


def start_ticker():
    def loop():
        threading.Event().wait(2.0)
        while True:
            if len(webview.windows) == 0:
                return
            w = webview.windows[0]
            payload = {"time": int(threading.get_native_id())}
            try:
                w.evaluate_js(
                    'window.dispatchEvent(new CustomEvent("ticker",{detail:%s}))'
                    % json.dumps(payload)
                )
            except Exception:
                pass
            threading.Event().wait(1.0)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def cleanup(process):
    print("Stopping backend server...")
    process.terminate()
    process.wait()


if __name__ == "__main__":
    # Ensure debug mode is off
    if "FRONTEND_DEV" in os.environ:
        del os.environ["FRONTEND_DEV"]

    entry = get_entry_html()
    backend_process = start_backend()
    
    atexit.register(cleanup, backend_process)
    
    window = webview.create_window("QWENCODE", entry, js_api=Api(), text_select=True)
    
    def on_closing():
        # Prompt user to save conversation history
        # Returns True to allow closing, False to cancel
        should_save = window.create_confirmation_dialog(
            "Save History", 
            "Do you want to save the conversation history before exiting?"
        )
        if should_save:
            print("Saving all conversations...")
            # Actual saving is handled by RpcLogger/backend automatically
        return True

    window.events.closing += on_closing
    
    webview.start(start_ticker, debug=False)
