#!/usr/bin/env python3
"""
支持流式输出的简单用法测试 - 让 Qwen 写 1+1 等于 2 的 Python 代码
"""

from qwen_python_wrapper import QwenPythonWrapper, QwenCLIError, QwenPersistentWrapper
import sys
import subprocess
import shutil
import time

def 检查环境():
    """检查运行环境是否准备就绪"""
    try:
        # 首先尝试使用 shutil.which 检查
        if shutil.which('qwen'):
            return True
            
        # 尝试直接运行 qwen --version
        result = subprocess.run(['qwen', '--version'], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
        
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        # 尝试 PowerShell 方式检测（适用于 Windows nvm 安装的情况）
        try:
            result = subprocess.run(
                ['powershell', '-Command', 'Get-Command qwen | Select-Object -ExpandProperty Source'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                return True
        except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
            pass
            
        return False

def 流式输出测试():
    """执行流式输出的 Qwen 调用测试"""
    print("🚀 开始流式输出测试 (Persistent Mode)...")
    
    # 初始化持久化包装器
    wrapper = QwenPersistentWrapper()
    
    # 检查环境
    if not 检查环境():
        print("❌ 环境检查失败")
        print("请确保 Qwen CLI 已正确安装和配置")
        return
    
    print("✅ 环境检查通过")
    
    # 检查凭证
    if not wrapper.check_credentials():
        print("❌ 未找到 Qwen CLI 凭证")
        print("请先运行 'qwen login' 进行身份验证")
        return
    
    print("✅ 凭证检查通过")
    
    try:
        # 启动持久化会话
        print("📝 启动持久化会话...")
        start_init = time.time()
        wrapper.start()
        print(f"⏱️ 会话初始化耗时: {time.time() - start_init:.2f} 秒")
        
        # 第一次请求
        print("\n📝 发送第一个请求 (Cold Start)...")
        print("请求内容：请写一个 Python 代码，计算 1+1")
        print("\n🎯 流式输出开始：")
        print("-" * 60)
        
        start_time = time.time()
        response = wrapper.chat("请写一个 Python 代码，证明 1+1 等于 2")
        end_time = time.time()
        
        print("-" * 60)
        print("✅ 第一次请求完成！")
        print(f"⏱️ 耗时: {end_time - start_time:.2f} 秒")
        
        # 第二次请求 (测试热启动速度)
        print("\n📝 发送第二个请求 (Warm Start)...")
        print("请求内容：请简单解释一下刚才的代码")
        print("\n🎯 流式输出开始：")
        print("-" * 60)
        
        start_time = time.time()
        response = wrapper.chat("请简单解释一下刚才的代码")
        end_time = time.time()
        
        print("-" * 60)
        print("✅ 第二次请求完成！")
        print(f"⏱️ 耗时: {end_time - start_time:.2f} 秒")
        
        # 关闭会话
        wrapper.close()
        
    except QwenCLIError as e:
        print(f"❌ 请求失败：{e}")
        if wrapper:
            wrapper.close()
    except Exception as e:
        print(f"❌ 发生未知错误：{e}")
        if wrapper:
            wrapper.close()

if __name__ == "__main__":
    流式输出测试()