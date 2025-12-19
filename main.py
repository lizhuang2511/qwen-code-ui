import os
import sys
import threading
import json
import webview
import subprocess
import time

# Ensure we can import from crates package
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CRATES_DIR = os.path.join(BASE_DIR, "crates")
if CRATES_DIR not in sys.path:
    sys.path.insert(0, CRATES_DIR)

from backend.api import Api  # type: ignore
import session

def get_entry_html() -> str:
    paths = [
        os.path.join(BASE_DIR, "frontend", "dist", "index.html"),
        os.path.join(BASE_DIR, "frontend", "index.html"),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    raise RuntimeError("index.html not found. Please run: pnpm -C frontend build")


def get_entry() -> str:
    os.environ["FRONTEND_DEV"] = "1"
    url = os.environ.get("FRONTEND_DEV_URL") or "http://localhost:1420"
    build = subprocess.run("pnpm -C frontend build", cwd=BASE_DIR, shell=True)
    if build.returncode != 0:
        raise RuntimeError("frontend build failed")
    ok = subprocess.run(f"curl -sSf {url}", cwd=BASE_DIR, shell=True)
    if ok.returncode != 0:
        subprocess.Popen("pnpm -C frontend run dev", cwd=BASE_DIR, shell=True)
        for _ in range(60):
            p = subprocess.run(f"curl -sSf {url}", cwd=BASE_DIR, shell=True)
            if p.returncode == 0:
                break
            time.sleep(0.5)
    return url


def start_backend():
    print("Starting backend server on port 1858...")
    cmd = [sys.executable, "-m", "uvicorn", "server.main:app", "--port", "1858", "--host", "127.0.0.1"]
    if os.environ.get("FRONTEND_DEV") == "1":
        # Only watch the crates directory to avoid reloading when user files (workspace) change
        cmd.append("--reload")
        cmd.append("--reload-dir")
        cmd.append(os.path.join(BASE_DIR, "crates"))
    
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
            except:
                pass
            threading.Event().wait(1.0)

    t = threading.Thread(target=loop, daemon=True)
    t.start()


if __name__ == "__main__":
    entry = get_entry()
    backend_process = start_backend()
    
    window = webview.create_window("App", entry, js_api=Api())
    dev = os.environ.get("FRONTEND_DEV", "")

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
    
    try:
        webview.start(start_ticker, debug=(dev == "1"))
    except KeyboardInterrupt:
        pass
    finally:
        # Cleanup backend process
        print("Stopping backend server...")
        backend_process.terminate()
        backend_process.wait()
