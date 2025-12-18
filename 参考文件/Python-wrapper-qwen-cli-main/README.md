# Qwen Python Wrapper

A Python wrapper for interacting with the Qwen CLI tool programmatically. This wrapper provides an easy-to-use API to send queries to Qwen and handle responses.

## Prerequisites

Before using this wrapper, you need to have:

1. **Qwen CLI installed**: Install the Qwen command-line interface on your system
2. **Authentication**: Authenticate with your Qwen account to create the credentials file

## Installation

### Method 1: Direct File Usage (Simplest)

1. Download the `qwen_python_wrapper.py` file to your project directory
2. Import and use it directly in your Python code

### Method 2: Package Installation (Recommended for frequent use)

1. Clone or download the entire `qwen_wrapper` directory
2. Navigate to the directory in your terminal
3. Run the following command:

```bash
pip install -e .
```

The `-e` flag installs it in "editable" mode, meaning changes to the source code will be reflected without reinstalling.

## Setup Instructions

### Step 1: Install Qwen CLI

If you haven't already installed the Qwen CLI, follow the official installation instructions for your operating system.

For example, on some systems you might use:
```bash
# For npm-based installation (example)
npm install -g @qwen/cli

# Or download the binary directly from the Qwen website
```

### Step 2: Authenticate with Qwen

Before using the wrapper, you need to authenticate with your Qwen account:

```bash
# This will prompt you to authenticate and create the credentials file
qwen login
```

This creates a credentials file at `~/.qwen/oauth_creds.json` which the wrapper will automatically detect.

## Usage

### Basic Usage

```python
from qwen_python_wrapper import QwenPythonWrapper, QwenCLIError

# Create an instance of the wrapper
wrapper = QwenPythonWrapper()

# Check if credentials are available
if wrapper.check_credentials():
    # Send a simple query
    response = wrapper.simple_query("What is the capital of France?")
    print(response)
else:
    print("Please authenticate with Qwen first using 'qwen login'")
```

### Advanced Usage

#### Query with specific model
```python
response = wrapper.simple_query("Translate 'Hello, World!' to French", model="gpt-4")
print(response)
```

#### Get JSON response
```python
try:
    response = wrapper.json_query("Explain quantum computing in simple terms")
    print(response)
except QwenCLIError as e:
    print(f"Error: {e}")
```

#### Chat session simulation
```python
messages = [
    {"role": "user", "content": "What is Python?"},
    {"role": "assistant", "content": "Python is a high-level programming language."},
    {"role": "user", "content": "What are its main features?"}
]
response = wrapper.chat_session(messages)
print(response)
```

## Using from Any Directory

After installing the package (Method 2), you can use the wrapper from any directory:

```python
# This will work from any directory after package installation
from qwen_python_wrapper import QwenPythonWrapper

wrapper = QwenPythonWrapper()
response = wrapper.simple_query("Hello, how are you?")
print(response)
```

If you're using Method 1 (direct file), you'll need to either:
1. Copy the `qwen_python_wrapper.py` file to your project directory, or
2. Add the directory containing the file to your Python path:

```python
import sys
sys.path.append('/path/to/directory/containing/qwen_python_wrapper')

from qwen_python_wrapper import QwenPythonWrapper
```

## Command-Line Usage

The wrapper can also be used directly from the command line:

```bash
# Check if credentials are available
python qwen_python_wrapper.py --credentials

# Send a simple query
python qwen_python_wrapper.py "What is the weather today?"

# Send a query and get JSON output
python qwen_python_wrapper.py "Summarize the latest news" --output-format json

# Use a specific model
python qwen_python_wrapper.py "Write a poem" --model gpt-4
```

## Error Handling

The wrapper raises `QwenCLIError` when the Qwen CLI encounters an error. Always handle these exceptions in your code:

```python
from qwen_python_wrapper import QwenPythonWrapper, QwenCLIError

wrapper = QwenPythonWrapper()

try:
    response = wrapper.simple_query("Your prompt here")
    print(response)
except QwenCLIError as e:
    print(f"Qwen CLI Error: {e}")
```

## Troubleshooting

### "Qwen CLI not found" error
- Make sure the Qwen CLI is installed and accessible from your command line
- Verify by running `qwen --version` in your terminal

### "Credentials not found" error
- Run `qwen login` to authenticate and create the credentials file
- Ensure the credentials file is at `~/.qwen/oauth_creds.json`

### Timeout errors
- Increase the timeout value when initializing the wrapper:
  ```python
  wrapper = QwenPythonWrapper(cli_path="qwen", timeout=600)  # 10 minutes timeout
  ```

## Examples

See the `examples/` directory for more usage examples:

- Basic queries
- Error handling
- Different output formats
- Model selection

## License

This project is licensed under the MIT License - see the LICENSE file for details.