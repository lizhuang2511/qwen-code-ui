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
    return paths[0]


def start_backend():
    print("Starting backend server on port 1858...")
    cmd = [sys.executable, "-m", "uvicorn", "server.main:app", "--port", "1858", "--host", "127.0.0.1"]
    return subprocess.Popen(cmd, cwd=BASE_DIR)


def start_ticker():
    def loop():
        threading.Event().wait(2.0)
        while True:
            if len(webview.windows) == 0:
                return
            w = webview.windows[0]
            payload = {"time": int(threading.get_native_id())}
            w.evaluate_js(
                'window.dispatchEvent(new CustomEvent("ticker",{detail:%s}))'
                % json.dumps(payload)
            )
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
    
    window = webview.create_window("App", entry, js_api=Api())
    
    webview.start(start_ticker, debug=False)
