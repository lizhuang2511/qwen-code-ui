import sys
import types
import time
from pathlib import Path
import json

ROOT = str(Path(__file__).resolve().parents[1])
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)


class FakeWindow:
    def __init__(self):
        self.calls = []

    def evaluate_js(self, script: str):
        self.calls.append(script)


def extract_event_and_detail(script: str):
    prefix = 'window.dispatchEvent(new CustomEvent('
    assert script.startswith(prefix)
    rest = script[len(prefix) :]
    # Check if it uses JSON.parse("{...}")
    if "JSON.parse" in rest:
        # Extract the event name
        parts = rest.split(', { detail: JSON.parse("')
        event_name = parts[0].strip().strip('"').strip("'")
        # Extract the JSON string
        json_str = parts[1].split('") }))')[0]
        # Unescape the JSON string
        json_str = json_str.replace('\\"', '"').replace('\\\\', '\\')
        payload = json.loads(json_str)
        return event_name, payload
    else:
        parts = rest.split(",{detail:")
        event_name = parts[0].strip().strip('"').strip("'")
        json_part = parts[1]
        assert json_part.endswith("}))")
        json_str = json_part[:-3]
        payload = json.loads(json_str)
        return event_name, payload


def test_qwencode_generate_python_code(monkeypatch):
    fake = FakeWindow()
    fake_webview = types.SimpleNamespace(windows=[fake])
    sys.modules["webview"] = fake_webview

    import importlib
    import os
    crates_dir = os.path.join(ROOT, "crates")
    if crates_dir not in sys.path:
        sys.path.insert(0, crates_dir)
        
    import backend.api as backend_api
    importlib.reload(backend_api)
    from backend.api import Api

    api = Api()
    params = {
        "sessionId": "code-1",
        "message": "请写一个Python函数返回斐波那契前10项",
    }
    print("Sending message to generate Python code")
    api.send_message(params)
    time.sleep(0.1)
    assert len(fake.calls) >= 1
    event, detail = extract_event_and_detail(fake.calls[-1])
    print("Captured event:", event)
    print("Captured detail:", detail)
    assert event == "ai-output-code-1"
    assert isinstance(detail, str)
    assert "def fibonacci" in detail
    assert "print(fibonacci(10))" in detail
    print("All assertions passed for qwencode_generate_python_code")
