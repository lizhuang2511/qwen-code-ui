#!/usr/bin/env python3
"""
Example script demonstrating usage of the Qwen Python wrapper.
"""

from qwen_python_wrapper import QwenPythonWrapper, QwenCLIError

def check_qwen_cli_available():
    """Check if Qwen CLI is available in the system."""
    try:
        import subprocess
        result = subprocess.run(['qwen', '--version'], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        return False

def main():
    # Initialize the wrapper
    wrapper = QwenPythonWrapper()

    # Check if Qwen CLI is available
    if not check_qwen_cli_available():
        print("❌ Qwen CLI is not installed or not in PATH")
        print("\nTo install Qwen CLI:")
        print("1. Install Node.js if not already installed")
        print("2. Run: npm install -g @qwen/cli")
        print("3. Or download from: https://github.com/QwenLM/qwen")
        print("\nAfter installation, verify with: qwen --version")
        return

    # Check if credentials are available
    if not wrapper.check_credentials():
        print("❌ Qwen CLI credentials not found at ~/.qwen/oauth_creds.json")
        print("Please authenticate using the 'qwen login' command first.")
        print("\nTo authenticate:")
        print("1. Run: qwen login")
        print("2. Follow the authentication prompts")
        print("3. This will create the credentials file")
        return
    else:
        print("✅ Qwen CLI credentials found")

    # Example 1: Simple query
    print("\n--- Simple Query ---")
    try:
        response = wrapper.simple_query("What is the capital of France?")
        print(f"Response: {response}")
    except QwenCLIError as e:
        print(f"Error: {e}")

    # Example 2: Query with specific model
    print("\n--- Query with specific model ---")
    try:
        response = wrapper.simple_query("Translate 'Hello, World!' to French", model="gpt-4")
        print(f"Response: {response}")
    except QwenCLIError as e:
        print(f"Error: {e}")

    # Example 3: JSON format response
    print("\n--- JSON Format Query ---")
    try:
        response = wrapper.json_query("Explain quantum computing in simple terms")
        print(f"JSON Response: {response}")
    except QwenCLIError as e:
        print(f"Error: {e}")

    # Example 4: Chat session simulation
    print("\n--- Chat Session ---")
    try:
        messages = [
            {"role": "user", "content": "What is Python?"},
            {"role": "assistant", "content": "Python is a high-level programming language."},
            {"role": "user", "content": "What are its main features?"}
        ]
        response = wrapper.chat_session(messages)
        print(f"Chat Response: {response}")
    except QwenCLIError as e:
        print(f"Chat Error: {e}")

if __name__ == "__main__":
    main()