import sys
import os
import time
import shutil
import json

# 1. 设置路径，确保能导入 crates 下的模块
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
crates_path = os.path.join(project_root, "crates")
if crates_path not in sys.path:
    sys.path.insert(0, crates_path)

from qwen_adapter import QwenProcess
from cli_runner import resolve_qwen_executable

print("=== 开始 Qwen 真实环境测试 ===")

# 2. 查找可执行文件
exe = resolve_qwen_executable()
print(f"目标可执行文件: {exe}")

if not shutil.which(exe):
    print(f"警告: 在 PATH 中未找到 '{exe}'，请确保已安装该工具。")
    # 继续执行，让系统报错，符合真实测试原则

# 3. 初始化进程
print("正在初始化 QwenProcess...")
process = QwenProcess(exe)

# 4. 发送消息
prompt = "写一段简单的Python代码，计算斐波那契数列"
print(f"发送 Prompt: {prompt}")
process.stdin.write(prompt)

# 5. 循环获取回复
print("\n=== 接收回复 (按 Ctrl+C 可提前终止) ===")
print("-" * 50)

# 设置超时时间（秒）
timeout = 30
last_activity = time.time()
start_time = time.time()

while True:
    # 检查总超时
    if time.time() - start_time > 60:
        print("\n\n[测试结束] 达到最大运行时间 60秒")
        break
        
    # 检查空闲超时
    if time.time() - last_activity > timeout:
        print(f"\n\n[测试结束] {timeout}秒内无响应")
        break

    if not process.stdout_queue.empty():
        line = process.stdout_queue.get()
        if line:
            # 更新活动时间
            last_activity = time.time()
            
            # 直接解析 JSON，不使用 try-except
            # 假设输出符合 qwen-agent 的 stream-json 格式
            if line.strip().startswith("{"):
                data = json.loads(line)
                
                # 尝试提取内容，根据常见的几种格式
                content = ""
                
                # 格式 1: qwen-agent 标准格式
                if "content" in data:
                    content = data["content"]
                # 格式 2: OpenAI 兼容格式
                elif "choices" in data and len(data["choices"]) > 0:
                    delta = data["choices"][0].get("delta", {})
                    content = delta.get("content", "")
                
                if content:
                    print(content, end="", flush=True)

    # 避免 CPU 占用过高
    time.sleep(0.05)

print("-" * 50)
print("测试完成")

# 清理资源
process.terminate()
