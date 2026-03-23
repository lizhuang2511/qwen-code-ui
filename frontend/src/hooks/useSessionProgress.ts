import { useState, useCallback, useRef } from "react";
import { listen } from "../lib/listen";
import { SessionProgressPayload, SessionProgressStage } from "../types/session";

export function useSessionProgress() {
  const [progresses, setProgresses] = useState<Record<string, SessionProgressPayload>>({});
  const unlistenRefs = useRef<Record<string, () => void>>({});
  const pendingListeners = useRef<Set<string>>(new Set());

  const handleProgressEvent = useCallback(
    (sessionId: string, payload: SessionProgressPayload) => {
      console.log(`🔄 [SESSION-PROGRESS] Session ${sessionId}:`, payload);
      setProgresses((prev) => ({
        ...prev,
        [sessionId]: payload,
      }));
    },
    []
  );

  const startListeningForSession = useCallback(
    async (sessionId: string) => {
      // If already listening or pending, don't set up again
      if (unlistenRefs.current[sessionId] || pendingListeners.current.has(sessionId)) {
        return unlistenRefs.current[sessionId] || (() => {});
      }

      pendingListeners.current.add(sessionId);
      const eventName = `session-progress-${sessionId}`;

      try {
        const unlisten = await listen<SessionProgressPayload>(
          eventName,
          (event) => {
            // Only update progress for this specific session ID
            handleProgressEvent(sessionId, event.payload);
          }
        );
        unlistenRefs.current[sessionId] = unlisten;
        pendingListeners.current.delete(sessionId);
        
        return () => {
          try {
            unlisten();
          } catch (e) {
            console.warn(`⚠️ [SESSION-PROGRESS] Error while unlistening ${sessionId}`, e);
          }
          delete unlistenRefs.current[sessionId];
        };
      } catch (error) {
        console.error(
          `Failed to set up session progress listener for ${sessionId}:`,
          error
        );
        pendingListeners.current.delete(sessionId);
        return () => {};
      }
    },
    [handleProgressEvent]
  );

  const resetProgress = useCallback((sessionId?: string) => {
    if (sessionId) {
      setProgresses((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (unlistenRefs.current[sessionId]) {
        try {
          unlistenRefs.current[sessionId]();
        } catch (e) {
          console.warn(`⚠️ [SESSION-PROGRESS] Error while unlistening ${sessionId} on reset`, e);
        }
        delete unlistenRefs.current[sessionId];
      }
    } else {
      setProgresses({});
      Object.values(unlistenRefs.current).forEach((unlisten) => {
        try {
          unlisten();
        } catch (e) {
          console.warn("⚠️ [SESSION-PROGRESS] Error while unlistening on reset all", e);
        }
      });
      unlistenRefs.current = {};
    }
  }, []);

  return {
    progresses,
    startListeningForSession,
    resetProgress,
    // Optimistically seed progress before backend emits
    seedProgress: (sessionId: string, payload?: Partial<SessionProgressPayload>) => {
      const seeded: SessionProgressPayload = {
        stage: SessionProgressStage.Starting,
        message: payload?.message || "Starting session initialization",
        progress_percent: payload?.progress_percent ?? 5,
        details: payload?.details,
      };
      setProgresses((prev) => ({
        ...prev,
        [sessionId]: seeded,
      }));
    },
  };
}
