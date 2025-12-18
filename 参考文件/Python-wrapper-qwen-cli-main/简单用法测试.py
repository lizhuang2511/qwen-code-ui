#!/usr/bin/env python3
"""
简单的用法测试 - 让 Qwen 写 1+1 等于 2 的 Python 代码
"""

from qwen_python_wrapper import QwenPythonWrapper, QwenCLIError

def 检查环境():
    """检查运行环境是否准备就绪"""
    try:
        import subprocess
        import shutil
        
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

def 简单测试():
    """执行简单的 Qwen 调用测试"""
    print("🚀 开始简单的 Qwen 用法测试...")
    
    # 初始化包装器
    wrapper = QwenPythonWrapper()
    
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
    
    # 发送测试请求
    print("\n📝 正在向 Qwen 发送请求...")
    print("请求内容：请写一个 Python 代码，证明 1+1 等于 2")
    
    try:
        response = wrapper.simple_query("请写一个 Python 代码，证明 1+1 等于 2")
        print("\n🎯 Qwen 的回复：")
        print("=" * 50)
        print(response)
        print("=" * 50)
        print("✅ 测试完成！")
        
    except QwenCLIError as e:
        print(f"❌ 请求失败：{e}")
    except Exception as e:
        print(f"❌ 发生未知错误：{e}")

if __name__ == "__main__":
    简单测试()