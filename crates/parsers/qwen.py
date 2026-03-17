import re
import json
from typing import Dict, Any, List


def _extract_text_from_dict(d: Dict[str, Any]) -> str:
    if not isinstance(d, dict):
        return ""
    if isinstance(d.get("text"), str):
        return d.get("text") or ""
    if isinstance(d.get("message"), str):
        return d.get("message") or ""
    if isinstance(d.get("chunk"), str):
        return d.get("chunk") or ""
    parts = d.get("parts")
    if isinstance(parts, list):
        buf: List[str] = []
        for p in parts:
            if isinstance(p, dict) and isinstance(p.get("text"), str):
                t = p.get("text") or ""
                if t:
                    buf.append(t)
        return "".join(buf)
    return ""


def _parse_single(text: str) -> Dict:
    text = text.strip() if isinstance(text, str) else ""
    if text == "":
        return {"status": "empty", "content": "", "metadata": {}, "raw": ""}

    # Parse as JSON only when it looks like JSON to avoid exceptions
    is_json_like = text.startswith("{") and text.endswith("}")
    if is_json_like:
        data = json.loads(text)
        if isinstance(data, dict):
            # Common fields
            if "result" in data:
                val = data.get("result")
                if isinstance(val, dict) and "stopReason" in val:
                    return {"status": "turn_finished", "content": val, "metadata": {"source": "jsonl"}, "raw": text}
                if isinstance(val, str):
                    return {"status": "parsed", "content": val, "metadata": {"source": "jsonl"}, "raw": text}
                if isinstance(val, dict):
                    extracted = _extract_text_from_dict(val)
                    return {"status": "parsed", "content": extracted, "metadata": {"source": "jsonl"}, "raw": text}

            if "content" in data:
                val = data.get("content")
                if isinstance(val, str):
                    return {"status": "parsed", "content": val, "metadata": {"source": "jsonl"}, "raw": text}
                if isinstance(val, dict):
                    extracted = _extract_text_from_dict(val)
                    return {"status": "parsed", "content": extracted, "metadata": {"source": "jsonl"}, "raw": text}
                if isinstance(val, list):
                    # Handle list of content parts (e.g. [{"type": "text", "text": "..."}])
                    buf = []
                    for item in val:
                        if isinstance(item, dict):
                            buf.append(_extract_text_from_dict(item))
                        elif isinstance(item, str):
                            buf.append(item)
                    return {"status": "parsed", "content": "".join(buf), "metadata": {"source": "jsonl"}, "raw": text}

            if "message" in data:
                msg = data.get("message")
                if isinstance(msg, str):
                    return {"status": "parsed", "content": msg or "", "metadata": {"source": "jsonl"}, "raw": text}
                if isinstance(msg, dict):
                    # Handle message object which might contain content
                    if "content" in msg:
                        content_val = msg.get("content")
                        if isinstance(content_val, str):
                             return {"status": "parsed", "content": content_val, "metadata": {"source": "jsonl"}, "raw": text}
                        if isinstance(content_val, list):
                            buf = []
                            for item in content_val:
                                if isinstance(item, dict):
                                    buf.append(_extract_text_from_dict(item))
                                elif isinstance(item, str):
                                    buf.append(item)
                            return {"status": "parsed", "content": "".join(buf), "metadata": {"source": "jsonl"}, "raw": text}
                    # Try extracting directly from message dict if no content field
                    extracted = _extract_text_from_dict(msg)
                    if extracted:
                        return {"status": "parsed", "content": extracted, "metadata": {"source": "jsonl"}, "raw": text}

            # Newer RPC-like structures
            method = data.get("method")
            if method == "session/update":
                upd = (data.get("params") or {}).get("update") or {}
                update_type = upd.get("sessionUpdate")
                
                # Expose specific update types to session.py
                if update_type == "tool_call_update":
                    # Return the full data structure so session.py can extract toolCallId from params.update
                    return {"status": "tool_call_update", "content": data, "metadata": {"source": "jsonl"}, "raw": text}
                
                if update_type == "agent_message_chunk":
                    # For message chunks, we still want to extract text for the UI stream
                    content_obj = upd.get("content")
                    extracted = ""
                    if isinstance(content_obj, dict):
                        extracted = _extract_text_from_dict(content_obj)
                    elif isinstance(upd.get("chunk"), str):
                        extracted = upd.get("chunk")
                    return {"status": "agent_message_chunk", "content": extracted, "metadata": {"source": "jsonl"}, "raw": text}

                # agent_message_chunk may carry content.text or chunk
                content_obj = upd.get("content")
                extracted = ""
                if isinstance(content_obj, dict):
                    extracted = _extract_text_from_dict(content_obj)
                elif isinstance(upd.get("chunk"), str):
                    extracted = upd.get("chunk")
                
                # Always return parsed status for session/update to prevent raw JSON display
                return {"status": "parsed", "content": extracted, "metadata": {"source": "jsonl"}, "raw": text}

            elif method == "streamAssistantMessageChunk":
                params = data.get("params") or {}
                chunk = (params.get("chunk") or {}).get("text")
                return {"status": "parsed", "content": chunk or "", "metadata": {"source": "jsonl"}, "raw": text}

            elif method == "session/request_permission":
                return {"status": "permission_request", "content": data, "metadata": {"source": "jsonl"}, "raw": text}
            
            # Handle generic responses (result with stopReason)
            elif "result" in data and isinstance(data["result"], dict):
                res = data["result"]
                if "stopReason" in res:
                    return {"status": "turn_finished", "content": res, "metadata": {"source": "jsonl"}, "raw": text}

            # Handle JSON-RPC errors
            if "error" in data:
                return {"status": "error", "content": data, "metadata": {"source": "jsonl"}, "raw": text}



    # Fallback to regex for partial/malformed lines or other formats
    m1 = re.search(r'"content"\s*:\s*"([^"]*)"', text)
    m2 = re.search(r'"message"\s*:\s*"([^"]*)"', text)
    if m1:
        c = m1.group(1)
        return {"status": "parsed", "content": c, "metadata": {"source": "jsonl"}, "raw": text}
    if m2:
        c = m2.group(1)
        return {"status": "parsed", "content": c, "metadata": {"source": "jsonl"}, "raw": text}
    return {"status": "text", "content": text, "metadata": {"source": "text"}, "raw": text}


def parse_line(line: str) -> List[Dict]:
    text = line.strip() if isinstance(line, str) else ""
    if text == "":
        return [{"status": "empty", "content": "", "metadata": {}, "raw": ""}]

    # Check for mixed content: Text followed by JSON-RPC
    # We look for the specific pattern {"jsonrpc"
    idx = text.find('{"jsonrpc"')
    if idx > 0:
        # Split
        pre_text = text[:idx].strip()
        json_text = text[idx:].strip()
        
        results = []
        if pre_text:
            results.append({"status": "text", "content": pre_text, "metadata": {"source": "text"}, "raw": pre_text})
        
        # Now process the json_text
        results.append(_parse_single(json_text))
        return results

    return [_parse_single(text)]
