import os
from sre_parse import FLAGS
import sys
import threading
import json
import webview
import subprocess
import time
from typing import Optional

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


def get_icon_path() -> Optional[str]:
    paths = [
        os.path.join(BASE_DIR, "frontend", "dist", "favicon.ico"),
        os.path.join(BASE_DIR, "frontend", "public", "favicon.ico"),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    return None


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


def set_window_icon(hwnd, icon_path):
    import ctypes
    
    print(f"[Icon] Setting icon for HWND: {hwnd}, Path: {icon_path}")
    
    WM_SETICON = 0x80
    ICON_SMALL = 0
    ICON_BIG = 1
    LR_LOADFROMFILE = 0x10
    
    user32 = ctypes.windll.user32
    
    if not os.path.exists(icon_path):
        print(f"[Icon] Error: Icon file not found at {icon_path}")
        return

    h_icon_small = user32.LoadImageW(
        None, 
        icon_path, 
        1, # IMAGE_ICON 
        0, 0, 
        LR_LOADFROMFILE
    )
    
    h_icon_big = user32.LoadImageW(
        None, 
        icon_path, 
        1, # IMAGE_ICON 
        0, 0, 
        LR_LOADFROMFILE
    )
    
    if h_icon_small:
        res = user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_icon_small)
        print(f"[Icon] Set small icon result: {res}")
    else:
        print(f"[Icon] Failed to load small icon. Error: {ctypes.GetLastError()}")

    if h_icon_big:
        res = user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_icon_big)
        print(f"[Icon] Set big icon result: {res}")
    else:
        print(f"[Icon] Failed to load big icon. Error: {ctypes.GetLastError()}")


def start_ticker(icon_path=None):
    def loop():
        import ctypes
        threading.Event().wait(1.0)
        
        # Try setting icon for Windows
        if icon_path and os.name == 'nt':
            print(f"[Icon] Attempting to set icon: {icon_path}")
            hwnd = None
            try:
                # Method 1: Try via pywebview native handle
                if len(webview.windows) > 0:
                    w = webview.windows[0]
                    # Wait for native handle to be available
                    for _ in range(5):
                        if hasattr(w, 'native') and w.native:
                            try:
                                # For pywebview with pythonnet (WinForms)
                                if hasattr(w.native, 'Handle'):
                                    # Handle is a System.IntPtr
                                    # Check if it has ToInt64 method (standard IntPtr)
                                    if hasattr(w.native.Handle, 'ToInt64'):
                                        hwnd = w.native.Handle.ToInt64()
                                    elif hasattr(w.native.Handle, 'ToInt32'):
                                        hwnd = w.native.Handle.ToInt32()
                                    else:
                                        # Fallback to int() if possible, though previous error suggests not
                                        hwnd = int(w.native.Handle)
                                    
                                    print(f"[Icon] Found HWND via webview.native: {hwnd}")
                                    break
                            except Exception as e:
                                print(f"[Icon] Error accessing native handle: {e}")
                        time.sleep(0.2)
                
                # Method 2: FindWindow by title if Method 1 failed
                if not hwnd:
                    print("[Icon] Trying FindWindowW by title 'QWENCODE'...")
                    user32 = ctypes.windll.user32
                    # Retry a few times as window might be creating
                    for _ in range(10):
                        hwnd = user32.FindWindowW(None, "QWENCODE")
                        if hwnd:
                            print(f"[Icon] Found HWND via FindWindowW: {hwnd}")
                            break
                        time.sleep(0.5)

                if hwnd:
                    set_window_icon(hwnd, icon_path)
                else:
                    print("[Icon] Failed to find window handle (HWND)")

            except Exception as e:
                print(f"[Icon] Failed to set window icon: {e}")

        threading.Event().wait(1.0)
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
    
    icon_path = get_icon_path()
    window = webview.create_window(
        "QWENCODE DESKTOP", 
        entry, 
        js_api=Api(), 
        text_select=True,
        width=1400,
        height=800
    )
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
        # Pass start_ticker as a lambda or partial to pass arguments if needed, 
        # but pywebview expects a function.
        # We can pass arguments via global or closure, but here we can wrap it.
        def ticker_wrapper():
            start_ticker(icon_path)
            
        webview.start(ticker_wrapper, debug=(dev == "1"), icon=icon_path)
    except KeyboardInterrupt:
        pass
    finally:
        # Cleanup backend process
        print("Stopping backend server...")
        backend_process.terminate()
        backend_process.wait()
