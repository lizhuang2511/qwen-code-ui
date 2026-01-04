import os
import sys
import subprocess

def main():
    # 获取脚本所在目录的绝对路径
    if getattr(sys, 'frozen', False):
        # 如果是打包后的可执行文件
        current_dir = os.path.dirname(sys.executable)
    else:
        # 如果是脚本直接运行
        current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 切换当前工作目录到脚本所在目录
    # 这样可以确保后续运行 python.exe 时，是在正确的目录下
    os.chdir(current_dir)
    print(f"已切换工作目录至: {current_dir}")
    
    # 定义目标 python.exe 和 start.py 的路径
    target_python = os.path.join(current_dir, "python.exe")
    target_script = os.path.join(current_dir, "start.py")
    
    # 检查 python.exe 是否存在
    if not os.path.exists(target_python):
        print(f"错误: 在目录 {current_dir} 下未找到 python.exe")
        print("请确保 python.exe 位于当前文件夹中。")
        sys.exit(1)
        
    # 检查 start.py 是否存在
    if not os.path.exists(target_script):
        print(f"错误: 在目录 {current_dir} 下未找到 start.py")
        sys.exit(1)
        
    # 构建执行命令，保留传入的参数
    # 格式: [python.exe, start.py, arg1, arg2, ...]
    cmd = [target_python, target_script] + sys.argv[1:]
    
    print(f"正在使用当前目录下的 Python 解释器运行脚本...")
    print(f"解释器: {target_python}")
    print(f"脚本: {target_script}")
    
    # 使用 subprocess.call 执行命令
    # 这里不使用 try-except，让异常自然抛出（如果发生）
    exit_code = subprocess.call(cmd)
    
    # 退出并返回相同的状态码
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
