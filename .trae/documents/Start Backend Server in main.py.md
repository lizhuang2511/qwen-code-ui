I have identified the cause of the WebSocket error. The frontend (running on port 1420) is trying to connect to a WebSocket server at `/api/ws`, which is proxied to `ws://localhost:1858` by Vite. However, the backend server (FastAPI) that should be listening on port 1858 is not being started by the main application script (`main.py`).

Here is the plan to fix this:

1.  **Modify `main.py`**:
    *   Add a function `start_backend()` to launch the FastAPI server using `uvicorn` on port 1858.
    *   Call this function in the main execution block before starting the webview.
    *   Ensure the backend process is terminated when the application exits.

This will ensure that the backend server is running and listening on the correct port, allowing the frontend to establish the WebSocket connection successfully.
