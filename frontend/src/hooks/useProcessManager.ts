import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { listen } from "../lib/listen";
import { ProcessStatus } from "../types";

export const useProcessManager = () => {
  const [processStatuses, setProcessStatuses] = useState<ProcessStatus[]>([]);

  const fetchProcessStatuses = useCallback(async () => {
    console.log("🔄 [FRONTEND-STATUS] Fetching process statuses...");
    let statuses: ProcessStatus[] = [];
    try {
      statuses = await api.get_process_statuses();
    } catch (e) {
      console.error("⚠️ [FRONTEND-STATUS] Failed to fetch statuses; using empty list");
      statuses = [];
    }
    console.log("📊 [FRONTEND-STATUS] Received statuses:", statuses);

    setProcessStatuses((prev) => {
      // Only update if statuses actually changed
      const hasChanged = JSON.stringify(prev) !== JSON.stringify(statuses);
      if (hasChanged) {
        console.log("🔄 [FRONTEND-STATUS] Process statuses changed!");
        console.log("🔄 [FRONTEND-STATUS] Previous:", prev);
        console.log("🔄 [FRONTEND-STATUS] New:", statuses);

        // Log individual status changes
        statuses.forEach((status) => {
          const prevStatus = prev.find(
            (p) => p.conversation_id === status.conversation_id
          );
          if (!prevStatus) {
            console.log(
              `➕ [FRONTEND-STATUS] New session: ${status.conversation_id} (${status.is_alive ? "ACTIVE" : "INACTIVE"})`
            );
          } else if (prevStatus.is_alive !== status.is_alive) {
            console.log(
              `🔄 [FRONTEND-STATUS] Status change: ${status.conversation_id} ${prevStatus.is_alive ? "ACTIVE" : "INACTIVE"} → ${status.is_alive ? "ACTIVE" : "INACTIVE"}`
            );
          }
        });

        return statuses;
      }
      return prev;
    });
  }, []);

  const handleKillProcess = useCallback(
    async (conversationId: string) => {
      try {
        await api.kill_process({ conversationId });
        // Refresh process statuses after killing
        await fetchProcessStatuses();
      } catch (error) {
        console.error("Failed to kill process:", error);
      }
    },
    [fetchProcessStatuses]
  );

  // WebSocket-based real-time updates - no more polling!
  useEffect(() => {
    console.log(
      "🔌 [PROCESS-WS] Setting up WebSocket listeners for real-time status updates"
    );

    // Initial fetch to get current state
    fetchProcessStatuses();

    // Listen for real-time status updates via WebSocket
    const unsubscribe = listen<ProcessStatus[]>(
      "process-status-changed",
      (event) => {
        console.log(
          "📡 [PROCESS-WS] Received real-time status update:",
          event.payload
        );
        setProcessStatuses(event.payload);
      }
    );

    return () => {
      console.log("🔌 [PROCESS-WS] Cleaning up WebSocket listeners");
      unsubscribe.then((unsub) => unsub());
    };
  }, [fetchProcessStatuses]);

  return {
    processStatuses,
    fetchProcessStatuses,
    handleKillProcess,
  };
};
