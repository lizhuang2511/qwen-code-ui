import os
import sys
import subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
subprocess.run([sys.executable, "-m", "pip", "install", "pytest"])
CMD = [sys.executable, "-m", "pytest", "-s", "-vv", os.path.join(ROOT, "test")]
PROC = subprocess.run(CMD, cwd=ROOT)
sys.exit(PROC.returncode)
