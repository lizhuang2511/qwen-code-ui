import sys
import os

# Mock the parser import
# Since I cannot easily import from crates/parsers/qwen.py because of directory structure and no __init__ maybe
# I will just append path

sys.path.append(os.path.join(os.getcwd(), "crates"))
from parsers.qwen import parse_line

def test():
    # Test case 1: Normal text
    res = parse_line("Hello world")
    print(f"Test 1: {res}")
    assert len(res) == 1
    assert res[0]["content"] == "Hello world"

    # Test case 2: JSON only
    res = parse_line('{"content": "Hello json"}')
    print(f"Test 2: {res}")
    assert len(res) == 1
    assert res[0]["content"] == "Hello json"

    # Test case 3: Mixed content (The fix)
    # Note: parse_line strips whitespace, so " 2 " becomes "2"
    mixed = '这样就得到结果 2 了。 {"jsonrpc":"2.0","method":"session/update"}'
    res = parse_line(mixed)
    print(f"Test 3: {res}")
    assert len(res) == 2
    assert res[0]["content"] == "这样就得到结果 2 了。"
    # The JSON part:
    # _parse_single parses {"jsonrpc"...}
    # It checks "content", "message", "result".
    # This JSON has "method": "session/update" but no "params" with "update".
    # So it should fall back to regex or text.
    # Since it is valid JSON but _extract_text_from_dict might return "" if structure matches nothing known?
    # No, if it falls through structure checks, it goes to regex.
    # If regex fails, it returns {"status": "text", "content": text}
    # So second part should be the JSON string itself (as text content) OR parsed if it matches known patterns.
    # Wait, if it returns the JSON string as content, then ai-output will emit it, and frontend will display it.
    # THIS IS BAD.

    # Wait, I missed a crucial point.
    # If `_parse_single` returns the raw JSON string as content, then `ai-output` emits it.
    # My fix split the line, but if the JSON part is still returned as "content", it will still be displayed!

    # Let's check `_parse_single` logic again.
    # If it is valid JSON:
    # It checks known fields.
    # If known fields NOT found (like just {"jsonrpc":...}), what does it do?
    # It falls through to regex checks.
    # Regex checks: "content": ... "message": ...
    # If not found, it returns `{"status": "text", "content": text, ...}`.
    
    # So `_parse_single` returns the RAW JSON TEXT if it doesn't understand the JSON.
    # And `session.py` emits it to `ai-output`.
    # And frontend displays it.
    
    # So simply splitting is NOT enough if `_parse_single` doesn't hide "internal" JSONs.
    # The JSON in the screenshot has "method": "session/update".
    # My `_parse_single` handles "session/update":
    # if method == "session/update":
    #    upd = ...
    #    content_obj = ...
    #    chunk_val = ...
    #    returns extracted content.
    
    # If extracted content is EMPTY (e.g. text=""), then `_parse_single` returns what?
    # Wait, `_parse_single` only returns if it finds something.
    # If `extracted` is found (and truthy?), it returns.
    # If `extracted` is empty string? `if extracted:` checks truthiness. Empty string is false.
    # So if text is empty, it falls through!
    
    # And eventually returns `{"status": "text", "content": text}`.
    # So it returns the raw JSON!

    # I need to fix `_parse_single` to NOT return raw text if it was successfully parsed as JSON but had no content.
    # OR, if it looks like JSON but has no content, return status="empty" or something?

    pass

if __name__ == "__main__":
    test()
