from dataclasses import dataclass
import json

@dataclass
class JsonRpcRequest:
    jsonrpc: str
    id: int
    method: str
    params: dict

def to_json(req: JsonRpcRequest) -> str:
    return json.dumps(
        {
            "jsonrpc": req.jsonrpc,
            "id": req.id,
            "method": req.method,
            "params": req.params,
        }
    )

