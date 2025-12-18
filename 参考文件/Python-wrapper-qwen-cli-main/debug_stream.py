from qwen_python_wrapper import QwenPythonWrapper
import subprocess
import sys

wrapper = QwenPythonWrapper()
print(f"CLI Path: {wrapper.cli_path}")

cmd = [wrapper.cli_path, "--prompt", "1+1=?", "--stream", "true"]
print(f"Running: {cmd}")

# Try running directly with Popen and reading byte by byte
process = subprocess.Popen(
    cmd,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    bufsize=0
)

print("Reading...")
while True:
    b = process.stdout.read(1)
    if not b:
        break
    sys.stdout.buffer.write(b)
    sys.stdout.flush()

print("\nDone")
