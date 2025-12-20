import sys
import os
import unittest
from unittest.mock import MagicMock, patch

# Add crates to path
sys.path.insert(0, os.path.join(os.getcwd(), "crates"))

import session
import qwen_adapter

class TestOAuthModel(unittest.TestCase):
    @patch('session.QwenProcess')
    @patch('session.resolve_executable')
    @patch('session._emit_progress')
    @patch('session.events.emit')
    @patch('threading.Thread')
    def test_qwen_oauth_forces_model(self, mock_thread, mock_emit, mock_progress, mock_resolve, MockQwenProcess):
        # Setup mocks
        mock_resolve.return_value = "qwen_mock_exe"
        
        # Scenario 1: OAuth credentials exist
        MockQwenProcess.check_credentials.return_value = True
        
        # Call start_session with backend="qwen" and some other model
        session.start_session("test_session_1", ".", "qwen-max", backend="qwen")
        
        # Verify QwenProcess was initialized with "qwenfree" instead of "qwen-max"
        MockQwenProcess.assert_called_with("qwen_mock_exe", "qwenfree", ".")
        print("\nTest 1 Passed: Model forced to qwenfree when OAuth credentials exist")
        
    @patch('session.QwenProcess')
    @patch('session.resolve_executable')
    @patch('session._emit_progress')
    @patch('session.events.emit')
    @patch('threading.Thread')
    def test_qwen_no_oauth_uses_provided_model(self, mock_thread, mock_emit, mock_progress, mock_resolve, MockQwenProcess):
        # Setup mocks
        mock_resolve.return_value = "qwen_mock_exe"
        
        # Scenario 2: No OAuth credentials
        MockQwenProcess.check_credentials.return_value = False
        
        # Call start_session with backend="qwen" and "qwen-max"
        session.start_session("test_session_2", ".", "qwen-max", backend="qwen")
        
        # Verify QwenProcess was initialized with "qwen-max"
        MockQwenProcess.assert_called_with("qwen_mock_exe", "qwen-max", ".")
        print("\nTest 2 Passed: Model remains qwen-max when no OAuth credentials")

if __name__ == '__main__':
    unittest.main()
