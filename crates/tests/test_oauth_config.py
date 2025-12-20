import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Add crates to path
sys.path.insert(0, os.path.join(os.getcwd(), "crates"))

import session
import qwen_adapter

class TestOAuthModeConfig(unittest.TestCase):
    @patch('session.QwenProcess')
    @patch('session.resolve_executable')
    @patch('session._emit_progress')
    @patch('session.events.emit')
    @patch('threading.Thread')
    def test_qwen_oauth_mode_true(self, mock_thread, mock_emit, mock_progress, mock_resolve, MockQwenProcess):
        mock_resolve.return_value = "qwen_mock"
        MockQwenProcess.check_credentials.return_value = True
        
        # useOAuth = True in config
        config = {"useOAuth": True, "apiKey": "fake_key"}
        session.start_session("s1", ".", "qwen-max", backend="qwen", backend_config=config)
        
        # Should enforce qwenfree even if model is qwen-max
        # And verify env_vars empty (or default)
        MockQwenProcess.assert_called_with("qwen_mock", "qwenfree", ".", env_vars={})
        print("\nTest 1 Passed: useOAuth=True enforces qwenfree")

    @patch('session.QwenProcess')
    @patch('session.resolve_executable')
    @patch('session._emit_progress')
    @patch('session.events.emit')
    @patch('threading.Thread')
    def test_qwen_oauth_mode_false_openai(self, mock_thread, mock_emit, mock_progress, mock_resolve, MockQwenProcess):
        mock_resolve.return_value = "qwen_mock"
        # Even if credentials exist on disk
        MockQwenProcess.check_credentials.return_value = True
        
        # useOAuth = False (OpenAI mode)
        config = {"useOAuth": False, "apiKey": "sk-test-key", "model": "qwen-plus"}
        session.start_session("s2", ".", "qwen-plus", backend="qwen", backend_config=config)
        
        # Should use provided model (qwen-plus)
        # Should inject API key
        expected_env = {"DASHSCOPE_API_KEY": "sk-test-key", "OPENAI_API_KEY": "sk-test-key"}
        MockQwenProcess.assert_called_with("qwen_mock", "qwen-plus", ".", env_vars=expected_env)
        print("\nTest 2 Passed: useOAuth=False uses provided model and injects API key")

if __name__ == '__main__':
    unittest.main()
