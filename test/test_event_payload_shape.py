import time
import sys, os

def test_session_progress_payload_shape(monkeypatch):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    proj_dir = os.path.dirname(base_dir)
    crates_dir = os.path.join(proj_dir, "crates")
    if crates_dir not in sys.path:
        sys.path.insert(0, crates_dir)
    captured = []
    def fake_emit(event: str, payload):
        captured.append((event, payload))
    import events as events
    monkeypatch.setattr(events, "emit", fake_emit, raising=True)

    from backend.api import Api
    api = Api()
    api.start_session({
        "sessionId": "t-1",
        "workingDirectory": "Z:\\nonexistent_path_for_test",
        "model": "qwen-2.5-coder",
        "backend": "qwen",
        "backendConfig": {"api_key": "sk-test", "base_url": "https://openrouter.ai/api/v1", "model": "qwen-2.5-coder"},
    })

    time.sleep(0.2)
    progress_events = [(e, p) for e, p in captured if e.startswith("session-progress-")]
    assert len(progress_events) >= 2
    for e, p in progress_events:
        assert isinstance(p, dict)
        assert "stage" in p and isinstance(p["stage"], str)
        assert "message" in p and isinstance(p["message"], str)
        assert "progress_percent" in p and isinstance(p["progress_percent"], int)
        if "details" in p:
            assert p["details"] is None or isinstance(p["details"], str)
    percents = [p["progress_percent"] for _, p in progress_events]
    assert max(percents) == 100
