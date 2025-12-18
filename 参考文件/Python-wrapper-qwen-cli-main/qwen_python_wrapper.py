#!/usr/bin/env python3
"""
Python wrapper for the qwen CLI to handle input and output through codes.

This module provides both a Python API and command-line functionality to interact
with the qwen CLI, allowing programmatic access to qwen's capabilities.

The wrapper handles:
- Direct execution of qwen CLI commands
- Input/output processing
- Credential management
- JSON and stream formats for structured interaction
"""

import json
import os
import subprocess
import sys
import shutil
from typing import Optional, Dict, Any, Union, List


class QwenCLIError(Exception):
    """Exception raised when the Qwen CLI encounters an error."""
    pass


class QwenPythonWrapper:
    """
    Python wrapper for the Qwen CLI to handle input and output programmatically.
    """

    def __init__(self, cli_path: str = "qwen", credentials_path: str = "~/.qwen/oauth_creds.json"):
        """
        Initialize the Qwen Python wrapper.

        Args:
            cli_path: Path to the qwen CLI executable
            credentials_path: Path to the OAuth credentials file
        """
        self.cli_path = self._find_cli_path(cli_path)
        self.credentials_path = os.path.expanduser(credentials_path)

    def _run_command(
        self,
        args: List[str],
        input_text: Optional[str] = None,
        timeout: int = 300
    ) -> subprocess.CompletedProcess:
        """
        Run a qwen CLI command with the specified arguments.

        Args:
            args: List of command-line arguments to pass to qwen
            input_text: Optional input text to pass via stdin
            timeout: Command timeout in seconds

        Returns:
            CompletedProcess instance with command results

        Raises:
            QwenCLIError: If the command fails
        """
        try:
            # Prepare the command
            cmd = [self.cli_path] + args

            # Execute the command
            result = subprocess.run(
                cmd,
                input=input_text,
                text=True,
                capture_output=True,
                timeout=timeout,
                check=False,  # We'll handle errors manually
                encoding='utf-8',
                errors='replace'
            )

            # Check for errors
            if result.returncode != 0:
                error_msg = result.stderr if result.stderr else result.stdout
                raise QwenCLIError(f"Qwen CLI error (exit code {result.returncode}): {error_msg}")

            return result
        except subprocess.TimeoutExpired:
            raise QwenCLIError(f"Qwen CLI command timed out after {timeout} seconds")
        except FileNotFoundError:
            error_msg = f"Qwen CLI not found at path: {self.cli_path}\n\n"
            error_msg += "Possible solutions:\n"
            error_msg += "1. Install Qwen CLI: npm install -g @qwen/cli\n"
            error_msg += "2. If already installed, ensure it's in your system PATH\n"
            error_msg += "3. Specify the full path to the qwen executable when creating the wrapper\n"
            error_msg += "4. Check if qwen command works in your terminal: qwen --version\n"
            raise QwenCLIError(error_msg)

    def _find_cli_path(self, cli_path: str) -> str:
        """
        Find the Qwen CLI executable path.
        
        Args:
            cli_path: Default or user-specified CLI path
            
        Returns:
            Path to the Qwen CLI executable
            
        Raises:
            QwenCLIError: If CLI is not found
        """
        # If the provided path exists, use it
        if os.path.exists(cli_path) and os.path.isfile(cli_path):
            return cli_path
            
        # Try to find in system PATH
        cli_in_path = shutil.which(cli_path)
        if cli_in_path:
            return cli_in_path
            
        # Try PowerShell script (for Windows with nvm)
        try:
            result = subprocess.run(
                ['powershell', '-Command', 'Get-Command qwen | Select-Object -ExpandProperty Source'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                ps_path = result.stdout.strip()
                if ps_path and os.path.exists(ps_path):
                    return ps_path
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            pass
            
        # Try common installation locations
        common_paths = [
            # Windows common locations
            os.path.expanduser("~\AppData\Roaming\npm\qwen.cmd"),
            os.path.expanduser("~\AppData\Local\npm\qwen.cmd"),
            "C:\\Program Files\\nodejs\\qwen.cmd",
            "C:\\Program Files (x86)\\nodejs\\qwen.cmd",
            # PowerShell script locations
            "C:\\nvm4w\\nodejs\\qwen.ps1",
            os.path.expanduser("~\AppData\Roaming\npm\qwen.ps1"),
            # Unix-like common locations
            "/usr/local/bin/qwen",
            "/usr/bin/qwen",
            os.path.expanduser("~/.npm-global/bin/qwen"),
            os.path.expanduser("~/node_modules/.bin/qwen"),
        ]
        
        for path in common_paths:
            if os.path.exists(path) and os.path.isfile(path):
                return path
                
        # If not found anywhere, return the original path
        # The error will be caught later with a helpful message
        return cli_path

    def check_credentials(self) -> bool:
        """
        Check if OAuth credentials exist at the expected location.

        Returns:
            True if credentials exist, False otherwise
        """
        if not os.path.exists(self.credentials_path):
            return False
            
        # Also check if the credentials file is valid JSON
        try:
            with open(self.credentials_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    return False
                json.loads(content)
            return True
        except (json.JSONDecodeError, IOError):
            return False

    def simple_query(self, prompt: str, model: Optional[str] = None) -> str:
        """
        Send a simple query to qwen and return the response.

        Args:
            prompt: The input prompt to send to qwen
            model: Optional model name to use

        Returns:
            The response from qwen as a string
        """
        args = ["--prompt", prompt]
        if model:
            args.extend(["--model", model])

        result = self._run_command(args)
        return result.stdout

    def stream_json_query(self, prompt: str, include_partial: bool = False) -> Dict[str, Any]:
        """
        Send a query to qwen using stream-json format and return structured response.

        Note: This requires the CLI to support stream-json format, which might not be available
        in all versions. This method may raise an error if the format is not supported.

        Args:
            prompt: The input prompt to send to qwen
            include_partial: Whether to include partial messages in the response

        Returns:
            Parsed JSON response from qwen
        """
        args = [
            "--prompt", prompt,
            "--output-format", "stream-json"
        ]
        if include_partial:
            args.extend(["--include-partial", "true"])

        try:
            result = self._run_command(args)

            # Parse the JSON response
            # Stream JSON format might have multiple JSON lines, so we'll parse the last complete one
            lines = result.stdout.strip().split('\n')
            json_objects = []

            for line in lines:
                line = line.strip()
                if line:
                    try:
                        json_obj = json.loads(line)
                        json_objects.append(json_obj)
                    except json.JSONDecodeError:
                        continue

            # Return the last JSON object which should contain the final response
            if json_objects:
                return json_objects[-1]

            raise QwenCLIError("No valid JSON response found in output")
        except QwenCLIError as e:
            # If stream-json is not supported, try regular json format instead
            if "stream-json" in str(e) or "Choices" in str(e):
                print("Warning: stream-json format not supported, using json format instead.")
                return self.json_query(prompt)
            else:
                raise e

    def 流式查询(self, prompt: str, 模型: Optional[str] = None) -> str:
        """
        流式输出查询 - 实时显示响应内容
        
        Args:
            prompt: 输入提示词
            模型: 可选的模型名称
            
        Returns:
            完整的响应文本
        """
        print("🔄 开始流式输出...")
        
        # 使用 stream-json 格式启用流式输出
        args = [
            "--prompt", prompt,
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--no-telemetry",  # 禁用遥测以提升速度
            "--allowed-mcp-server-names", "dummy_server_to_disable_mcp" # 禁用 MCP 以提升启动速度
        ]
        if 模型:
            args.extend(["--model", 模型])
        
        # 执行命令并实时处理输出
        cmd = [self.cli_path] + args
        print(f"DEBUG: Executing command: {cmd}")
        
        import subprocess
        
        # 设置环境变量
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        # env["FORCE_COLOR"] = "1" # 暂时注释掉，排查是否导致延迟
        
        import time
        start_process_time = time.time()
        print(f"DEBUG: 启动子进程时间: {start_process_time}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,      # 使用文本模式按行读取 JSON
            bufsize=1,      # 行缓冲
            env=env,
            encoding='utf-8',
            errors='replace'
        )
        
        print(f"DEBUG: 子进程启动完成，PID: {process.pid}")
        
        完整响应 = []
        last_chunk_time = time.time()
        chunk_count = 0
        
        # 实时按行读取输出并解析 JSON
        while True:
            line = process.stdout.readline()
            current_time = time.time()
            
            if not line and process.poll() is not None:
                break
            
            if not line:
                continue
            
            # 记录首个数据包时间
            if chunk_count == 0:
                 print(f"DEBUG: 收到首个数据包延迟: {current_time - start_process_time:.4f}s")
            
            # 每10个包打印一次间隔时间，避免刷屏
            if chunk_count % 10 == 0 and chunk_count > 0:
                 # print(f"DEBUG: 块间隔: {current_time - last_chunk_time:.4f}s")
                 pass
            
            last_chunk_time = current_time
            chunk_count += 1
                
            try:
                data = json.loads(line)
                # 解析 stream-json 格式
                # {"type":"stream_event", ... "event":{"type":"content_block_delta", ... "delta":{"type":"text_delta","text":"..."}}}
                if data.get("type") == "stream_event":
                    event = data.get("event", {})
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            print(text, end="", flush=True)
                            完整响应.append(text)
            except json.JSONDecodeError:
                # 忽略非 JSON 行
                pass
        
        process.wait()
        
        if process.returncode != 0:
            错误信息 = process.stderr.read()
            # 由于禁止使用 try-except，这里直接打印错误信息并返回部分结果
            print(f"\n❌ 流式查询出错: {错误信息}")
        
        return "".join(完整响应).strip()

    def json_query(self, prompt: str) -> Dict[str, Any]:
        """
        Send a query to qwen using JSON format and return structured response.

        Args:
            prompt: The input prompt to send to qwen

        Returns:
            Parsed JSON response from qwen
        """
        args = ["--prompt", prompt, "--output-format", "json"]
        result = self._run_command(args)

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as e:
            raise QwenCLIError(f"Failed to parse JSON response: {e}\nOutput: {result.stdout}")

    def chat_session(self, messages: List[Dict[str, str]]) -> str:
        """
        Start a chat session with a series of messages.
        This is more limited than the interactive UI but allows for basic session-like behavior.

        Args:
            messages: List of messages in the format [{"role": "user", "content": "text"}, ...]

        Returns:
            The response from qwen as a string
        """
        # Combine all message content as a single prompt
        full_prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in messages])
        return self.simple_query(full_prompt)


class QwenPersistentWrapper(QwenPythonWrapper):
    """
    Persistent wrapper for Qwen CLI using ACP protocol.
    Maintains a single running process to avoid startup overhead.
    """
    
    def __init__(self, cli_path: str = "qwen", credentials_path: str = "~/.qwen/oauth_creds.json"):
        super().__init__(cli_path, credentials_path)
        self.process = None
        self.session_id = None
        self.request_id = 0
        
    def start(self):
        """Start the persistent Qwen process and initialize ACP session."""
        if self.process:
            return
            
        print("🚀 Starting persistent Qwen process...")
        
        # Use experimental-acp flag
        cmd = [self.cli_path, "--experimental-acp", "--no-telemetry"]
        
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        
        self.process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
            encoding='utf-8',
            errors='replace'
        )
        
        try:
            # 1. Initialize
            self._send_request("initialize", {
                "protocolVersion": 1,
                "clientCapabilities": {
                    "fs": {
                        "readTextFile": False,
                        "writeTextFile": False
                    }
                }
            })
            init_res = self._read_response()
            if not init_res or "error" in init_res:
                raise QwenCLIError(f"Initialization failed: {init_res}")
                
            # 2. Create Session
            self._send_request("session/new", {
                "cwd": os.getcwd(),
                "mcpServers": []
            })
            session_res = self._read_response()
            if not session_res or "result" not in session_res:
                raise QwenCLIError(f"Session creation failed: {session_res}")
                
            self.session_id = session_res["result"]["sessionId"]
            print(f"✅ Persistent session established: {self.session_id}")
            
        except Exception as e:
            self.close()
            raise e
            
    def close(self):
        """Terminate the persistent process."""
        if self.process:
            self.process.terminate()
            self.process = None
            self.session_id = None
            
    def _send_request(self, method: str, params: Dict[str, Any]) -> int:
        self.request_id += 1
        req = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": self.request_id
        }
        json_req = json.dumps(req)
        if self.process and self.process.stdin:
            self.process.stdin.write(json_req + "\n")
            self.process.stdin.flush()
        return self.request_id
        
    def _read_response(self) -> Optional[Dict[str, Any]]:
        """Read a single JSON-RPC response."""
        if not self.process or not self.process.stdout:
            return None
            
        while True:
            line = self.process.stdout.readline()
            if not line:
                return None
            
            line = line.strip()
            if not line:
                continue
                
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue

    def chat(self, prompt: str) -> str:
        """
        Send a chat message and return the full response.
        Uses the persistent session.
        """
        if not self.process:
            self.start()
            
        req_id = self._send_request("session/prompt", {
            "sessionId": self.session_id,
            "prompt": [{"type": "text", "text": prompt}]
        })
        
        full_response = []
        
        while True:
            res = self._read_response()
            if not res:
                break
                
            # Handle notifications (stream updates)
            if "method" in res and res["method"] == "session/update":
                update = res["params"]["update"]
                if update.get("sessionUpdate") == "agent_message_chunk":
                    content = update.get("content", {})
                    if content.get("type") == "text":
                        text = content.get("text", "")
                        print(text, end="", flush=True)
                        full_response.append(text)
                        
            # Handle final result
            elif "result" in res and res.get("id") == req_id:
                if res["result"].get("stopReason") == "end_turn":
                    break
                    
        return "".join(full_response)

def main():
    """
    Main function to handle command-line usage of the wrapper.
    """
    import argparse

    parser = argparse.ArgumentParser(
        description="Python wrapper for Qwen CLI - interact with the qwen model programmatically"
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="The prompt to send to qwen. If not provided, will show credential status"
    )
    parser.add_argument(
        "--model",
        help="Model to use for the request"
    )
    parser.add_argument(
        "--output-format",
        choices=["text", "json"],
        default="text",
        help="Format for the output"
    )
    parser.add_argument(
        "--credentials",
        action="store_true",
        help="Check credential status"
    )

    args = parser.parse_args()

    # Create wrapper instance
    wrapper = QwenPythonWrapper()

    # Check credentials if requested
    if args.credentials:
        if wrapper.check_credentials():
            print("✓ Qwen CLI credentials found")
            sys.exit(0)
        else:
            print("✗ Qwen CLI credentials not found at ~/.qwen/oauth_creds.json")
            sys.exit(1)

    # If no prompt provided, just check credentials status
    if not args.prompt:
        if wrapper.check_credentials():
            print("Qwen CLI credentials are available. You can now make requests.")
        else:
            print("Qwen CLI credentials not found. Please authenticate using 'qwen' command first.")
        return

    # Make the request based on output format
    try:
        if args.output_format == "json":
            response = wrapper.json_query(args.prompt)
            print(json.dumps(response, indent=2))
        elif args.output_format == "stream-json":
            response = wrapper.stream_json_query(args.prompt)
            print(json.dumps(response, indent=2))
        else:  # text format
            response = wrapper.simple_query(args.prompt, args.model)
            print(response)
    except QwenCLIError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()