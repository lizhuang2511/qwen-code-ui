from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
PENDING_FILE = DATA_DIR / "pending_questionnaires.json"


def _ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not PENDING_FILE.exists():
        PENDING_FILE.write_text(json.dumps({"items": {}}, ensure_ascii=False), encoding="utf-8")


def _read_pending() -> Dict[str, Any]:
    _ensure_data_dir()
    try:
        content = PENDING_FILE.read_text(encoding="utf-8").strip()
        if not content:
            return {"items": {}}
        data = json.loads(content)
        if not isinstance(data, dict):
            return {"items": {}}
        if "items" not in data or not isinstance(data.get("items"), dict):
            return {"items": {}}
        return data
    except Exception:
        return {"items": {}}


def _write_pending(data: Dict[str, Any]) -> None:
    _ensure_data_dir()
    PENDING_FILE.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def list_pending(session_id: str) -> List[Dict[str, Any]]:
    s = (session_id or "").strip()
    if not s:
        return []
    data = _read_pending()
    items = data.get("items", {})
    sess_items = items.get(s, {})
    if not isinstance(sess_items, dict):
        return []
    out: List[Dict[str, Any]] = []
    for _, payload in sess_items.items():
        if isinstance(payload, dict):
            out.append(payload)
    return out


def upsert_pending(session_id: str, tool_call_id: str, payload: Dict[str, Any]) -> None:
    s = (session_id or "").strip()
    t = (tool_call_id or "").strip()
    if not s or not t:
        return
    data = _read_pending()
    items = data.setdefault("items", {})
    sess_items = items.setdefault(s, {})
    if not isinstance(sess_items, dict):
        items[s] = {}
        sess_items = items[s]
    sess_items[t] = payload
    _write_pending(data)


def delete_pending(session_id: str, tool_call_id: str) -> None:
    s = (session_id or "").strip()
    t = (tool_call_id or "").strip()
    if not s or not t:
        return
    data = _read_pending()
    items = data.get("items", {})
    sess_items = items.get(s, {})
    if not isinstance(sess_items, dict):
        return
    if t in sess_items:
        del sess_items[t]
        _write_pending(data)

