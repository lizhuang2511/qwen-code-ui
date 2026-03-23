import json
from typing import Callable, Any, Optional
import logging

logger = logging.getLogger("events")

# Global handler
_event_handler: Optional[Callable[[str, Any], None]] = None

def set_event_handler(handler: Callable[[str, Any], None]) -> None:
    global _event_handler
    _event_handler = handler

def emit(event: str, payload) -> None:
    """
    Emit an event. 
    If an event handler is set (e.g. for WebSocket server), it uses that.
    Also, it attempts to use pywebview if available (legacy desktop mode) 
    so that both WebSocket clients and pywebview clients receive the event.
    """
    if _event_handler:
        try:
            _event_handler(event, payload)
        except Exception as e:
            logger.error(f"Error in event handler: {e}")

    try:
        import webview
        if hasattr(webview, 'windows') and webview.windows:
            w = webview.windows[0]
            w.evaluate_js(
                'window.dispatchEvent(new CustomEvent("%s",{detail:%s}))'
                % (event, json.dumps(payload))
            )
    except:
        # No handler and no webview, or webview disposed (catch-all for CLR/System exceptions)
        pass
