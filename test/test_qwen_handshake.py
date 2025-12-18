import time
import sys, os

def test_qwen_handshake_invoked(monkeypatch):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    proj_dir = os.path.dirname(base_dir)
    crates_dir = os.path.join(proj_dir, "crates")
    if crates_dir not in sys.path:
        sys.path.insert(0, crates_dir)
    called = {"args": None}
    def fake_handshake(base_url: str, api_key: str, model: str) -> int:
        called["args"] = (base_url, api_key, model)
        return 200

    import session as session
    monkeypatch.setattr(session, "qwen_handshake", fake_handshake, raising=True)

    captured = []
    def fake_emit(event: str, payload):
        captured.append((event, payload))
    import events as events
    monkeypatch.setattr(events, "emit", fake_emit, raising=True)

    from backend.api import Api
    class _DummyProc:
        def __init__(self):
            self.stdout = iter(())
            self.stderr = iter(())
            self.stdin = None
            self.pid = 12345
    monkeypatch.setattr(session.subprocess, "Popen", lambda *a, **k: _DummyProc(), raising=True)
    api = Api()
    api.start_session({
        "sessionId": "t-2",
        "workingDirectory": ".",
        "model": "qwen-2.5-coder",
        "backend": "qwen",
        "backendConfig": {"api_key": "sk-xxx", "base_url": "https://openrouter.ai/api/v1", "model": "qwen-2.5-coder"},
    })

    time.sleep(0.2)
    assert called["args"] == ("https://openrouter.ai/api/v1", "sk-xxx", "qwen-2.5-coder")
    progress_events = [p for e, p in captured if e.startswith("session-progress-")]
    stages = [p.get("stage") for p in progress_events]
    assert "authenticating" in stages
    assert "creating_session" in stages or "ready" in stages
    assert any(p.get("progress_percent") == 100 for p in progress_events)
