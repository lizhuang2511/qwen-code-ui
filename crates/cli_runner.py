from dataclasses import dataclass, field
from typing import List, Dict, Optional
import os
import shutil
import subprocess


@dataclass
class CliClient:
    name: str
    executable: List[str]
    working_dir: Optional[str] = None
    internal_args: List[str] = field(default_factory=list)
    config_args: List[str] = field(default_factory=list)
    role_args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    timeout_seconds: int = 1800
    parser: str = "text"


STREAM_LIMIT_BYTES = 10 * 1024 * 1024
LINE_LIMIT_BYTES = 10 * 1024 * 1024


def _which(candidate: str) -> Optional[str]:
    resolved = shutil.which(candidate)
    if resolved:
        return resolved
    return None


def resolve_qwen_executable() -> str:
    # 1. Check specific binary names in PATH
    paths: List[str] = []
    for name in ["qwencodecli", "qwen-code", "qwen"]:
        p = _which(name)
        if p:
            paths.append(p)
    
    if len(paths) > 0:
        return paths[0]

    # 2. Check PowerShell (Windows nvm support) - without try-except
    # Only run if powershell is available to avoid FileNotFoundError
    if _which("powershell"):
        # We use subprocess.run without timeout to avoid TimeoutExpired exception
        # Assuming this command returns quickly
        
        kwargs = {}
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000

        res = subprocess.run(
            ['powershell', '-Command', 'Get-Command qwen | Select-Object -ExpandProperty Source'],
            capture_output=True,
            text=True,
            **kwargs
        )
        if res.returncode == 0:
            ps_path = res.stdout.strip()
            if ps_path and os.path.exists(ps_path):
                return ps_path

    # 3. Check common installation paths
    common_paths = [
        # Windows
        os.path.expanduser("~\\AppData\\Roaming\\npm\\qwen.cmd"),
        os.path.expanduser("~\\AppData\\Local\\npm\\qwen.cmd"),
        "C:\\Program Files\\nodejs\\qwen.cmd",
        "C:\\Program Files (x86)\\nodejs\\qwen.cmd",
        "C:\\nvm4w\\nodejs\\qwen.ps1",
        # Unix-like
        "/usr/local/bin/qwen",
        "/usr/bin/qwen",
        os.path.expanduser("~/.npm-global/bin/qwen"),
        os.path.expanduser("~/node_modules/.bin/qwen"),
    ]
    
    for path in common_paths:
        if os.path.exists(path) and os.path.isfile(path):
            return path

    return "qwencodecli"


def resolve_gemini_executable() -> str:
    p = _which("gemini")
    if p:
        return p
    return "gemini"


def resolve_llxprt_executable() -> str:
    p = _which("llxprt-code")
    if p:
        return p
    return "llxprt-code"


def resolve_executable(backend: str) -> str:
    b = (backend or "").lower()
    if b == "qwen":
        return resolve_qwen_executable()
    if b == "llxprt":
        return resolve_llxprt_executable()
    return resolve_gemini_executable()


def build_client(backend: str, model: Optional[str], working_dir: Optional[str], yolo: bool = False) -> CliClient:
    exe = resolve_executable(backend)
    args: List[str] = []
    if model:
        args.extend(["--model", model])
    if yolo:
        args.append("--yolo")
    name = backend or "gemini"
    parser = "text"
    if (backend or "").lower() == "gemini":
        parser = "gemini_json"
    if (backend or "").lower() == "qwen":
        parser = "qwen_text"
    client = CliClient(
        name=name,
        executable=[exe],
        working_dir=working_dir or None,
        internal_args=[],
        config_args=args,
        role_args=[],
        env=os.environ.copy(),
        timeout_seconds=1800,
        parser=parser,
    )
    return client


def build_command(client: CliClient) -> List[str]:
    cmd: List[str] = []
    for part in client.executable:
        cmd.append(part)
    for part in client.internal_args:
        cmd.append(part)
    for part in client.config_args:
        cmd.append(part)
    for part in client.role_args:
        cmd.append(part)
    return cmd


def is_valid_env(env: Dict[str, str]) -> bool:
    for k, v in env.items():
        if not isinstance(k, str):
            return False
        if not isinstance(v, str):
            return False
        if k == "":
            return False
    return True


def merge_env(base: Dict[str, str], extra: Dict[str, str]) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for k, v in base.items():
        if isinstance(k, str) and isinstance(v, str) and k != "":
            result[k] = v
    if is_valid_env(extra):
        for k, v in extra.items():
            result[k] = v
    return result
