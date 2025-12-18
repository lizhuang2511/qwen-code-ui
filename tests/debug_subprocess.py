import subprocess
import os

exe = r"C:\nvm4w\nodejs\qwen.CMD"
# Try the cmd /c approach
args = ["cmd.exe", "/c", exe, "--output-format", "stream-json"]

print(f"Running: {args}")

try:
    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding='utf-8',
        errors='replace',
        bufsize=1
    )

    input_str = "user: 你是谁"
    print(f"Writing: {input_str}")
    proc.stdin.write(input_str)
    proc.stdin.close()

    print("Reading stdout...")
    for line in proc.stdout:
        print(f"STDOUT: {line.strip()}")

    print("Reading stderr...")
    for line in proc.stderr:
        print(f"STDERR: {line.strip()}")

    proc.wait()
    print(f"Exit code: {proc.returncode}")

except Exception as e:
    print(f"Error: {e}")
