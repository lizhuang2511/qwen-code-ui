import sys, os
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "crates"))
from parsers.qwen import parse_line
import json

samples = [
    {"desc": "content.text", "s": '{"content": {"text": "abc"}}'},
    {
        "desc": "session/update content.text",
        "s": '{"method":"session/update","params":{"update":{"sessionUpdate":"agent_message_chunk","content":{"text":"xyz"}}}}',
    },
    {
        "desc": "streamAssistantMessageChunk chunk.text",
        "s": '{"method":"streamAssistantMessageChunk","params":{"chunk":{"text":"delta"}}}',
    },
    {
        "desc": "content.parts",
        "s": '{"content": {"parts": [{"text": "A"},{"text": "B"},{"text": "C"}]}}',
    },
    {"desc": "message", "s": '{"message":"plain"}'},
]

for item in samples:
    r = parse_line(item["s"])
    print(item["desc"], json.dumps(r))
