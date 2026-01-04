import threading
import time
import os
import events

# Try to import watchdog, but provide fallback if not available
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    HAS_WATCHDOG = True
except ImportError:
    HAS_WATCHDOG = False

class FileWatcher:
    """
    A wrapper that chooses the best available file watching strategy.
    """
    def __init__(self, path: str):
        self.path = path
        self._watcher = None

    def start(self):
        if HAS_WATCHDOG:
            print(f"[FileWatcher] Starting Watchdog for {self.path}")
            self._watcher = WatchdogWatcher(self.path)
        else:
            print(f"[FileWatcher] Starting PollingWatcher for {self.path}")
            self._watcher = PollingWatcher(self.path)
        self._watcher.start()

    def stop(self):
        if self._watcher:
            self._watcher.stop()
            self._watcher = None

if HAS_WATCHDOG:
    class WatchdogHandler(FileSystemEventHandler):
        def on_any_event(self, event):
            if event.is_directory:
                return
            # Emit change event
            # We debounce slightly on the backend? No, let frontend handle debounce.
            # But we might want to avoid emitting for every single byte write.
            # For now, just emit.
            # print(f"[FileWatcher] Change detected: {event.src_path}")
            events.emit("fs-change", {"path": event.src_path, "type": event.event_type})

    class WatchdogWatcher:
        def __init__(self, path: str):
            self.path = path
            self.observer = Observer()
            self.handler = WatchdogHandler()

        def start(self):
            if not os.path.exists(self.path):
                return
            self.observer.schedule(self.handler, self.path, recursive=True)
            self.observer.start()

        def stop(self):
            self.observer.stop()
            self.observer.join()

else:
    class PollingWatcher:
        def __init__(self, path: str, interval=2.0):
            self.path = path
            self.interval = interval
            self.running = False
            self._snapshot = {}
            self._thread = None

        def start(self):
            if not os.path.exists(self.path):
                return
            self._snapshot = self._scan()
            self.running = True
            self._thread = threading.Thread(target=self._run, daemon=True)
            self._thread.start()

        def stop(self):
            self.running = False
            if self._thread:
                self._thread.join(timeout=1.0)

        def _scan(self):
            snapshot = {}
            try:
                for root, dirs, files in os.walk(self.path):
                    # Skip .git and .history
                    if '.git' in dirs: dirs.remove('.git')
                    if '.history' in dirs: dirs.remove('.history')
                    
                    for f in files:
                        full = os.path.join(root, f)
                        try:
                            mtime = os.path.getmtime(full)
                            snapshot[full] = mtime
                        except:
                            pass
                    # We also track dirs to detect creation/deletion of empty dirs
                    for d in dirs:
                         full = os.path.join(root, d)
                         try:
                             mtime = os.path.getmtime(full)
                             snapshot[full] = mtime
                         except:
                             pass
            except:
                pass
            return snapshot

        def _run(self):
            while self.running:
                time.sleep(self.interval)
                new_snapshot = self._scan()
                
                # Compare keys (paths) and values (mtimes)
                if new_snapshot != self._snapshot:
                    # print(f"[FileWatcher] Change detected via polling")
                    events.emit("fs-change", {"path": self.path, "type": "polling_diff"})
                    self._snapshot = new_snapshot
