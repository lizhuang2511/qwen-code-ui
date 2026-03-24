import React, { useState, useCallback } from "react";
import { api } from "../lib/api";
import { Message, Conversation, UserMessagePart } from "../types";
import { useBackend } from "../contexts/BackendContext";

interface UseMessageHandlerProps {
  activeConversation: string | null;
  conversations: Conversation[];
  selectedModel: string;
  isCliInstalled: boolean | null;
  updateConversation: (
    conversationId: string,
    updateFn: (conv: Conversation, lastMsg: Message | undefined) => void
  ) => void;
  createNewConversation: (
    id: string,
    title: string,
    messages: Message[],
    isStreaming: boolean
  ) => Conversation;
  setActiveConversation: (id: string) => void;
  setupEventListenerForConversation: (
    conversationId: string
  ) => Promise<() => void>;
  fetchProcessStatuses: () => Promise<void>;
}

export const useMessageHandler = ({
  activeConversation,
  conversations,
  selectedModel,
  isCliInstalled,
  updateConversation,
  createNewConversation,
  setActiveConversation,
  setupEventListenerForConversation,
  fetchProcessStatuses,
}: UseMessageHandlerProps) => {
  const [inputState, setInputState] = useState<Record<string, string>>({});
  const [approvalModeState, setApprovalModeState] = useState<Record<string, string>>({});
  const conversationModes = React.useRef<Record<string, string>>({});
  const { selectedBackend, getApiConfig, state: backendState } = useBackend();

  // Get current values based on active conversation or defaults
  const currentInput = activeConversation ? (inputState[activeConversation] || "") : (inputState["new"] || "");
  const currentApprovalMode = activeConversation ? (approvalModeState[activeConversation] || "default") : (approvalModeState["new"] || "default");

  const [imagesState, setImagesState] = useState<Record<string, { mimeType: string; data: string; name?: string }[]>>({});
  const currentImages = activeConversation ? (imagesState[activeConversation] || []) : (imagesState["new"] || []);

  const setImages = useCallback((value: { mimeType: string; data: string; name?: string }[]) => {
    setImagesState(prev => ({
      ...prev,
      [activeConversation || "new"]: value
    }));
  }, [activeConversation]);

  const setInput = useCallback((value: string) => {
    setInputState(prev => ({
      ...prev,
      [activeConversation || "new"]: value
    }));
  }, [activeConversation]);

  const setApprovalMode = useCallback(async (value: string) => {
    setApprovalModeState(prev => ({
      ...prev,
      [activeConversation || "new"]: value
    }));

    if (!activeConversation) return;

    const convId = activeConversation;
    const currentMode = conversationModes.current[convId] || "default";

    if (value !== currentMode) {
        console.log(`[useMessageHandler] Restarting session to switch mode from ${currentMode} to ${value} for session ${convId}`);
        
        try {
          const apiConfig = getApiConfig();
          const isYolo = value === "yolo" || value === "auto-edit";
          
          let backendConfig = undefined;

          if (selectedBackend === "qwen") {
            backendConfig = {
              api_key: apiConfig?.api_key || "",
              base_url: apiConfig?.base_url || "https://openrouter.ai/api/v1",
              model: selectedModel,
              yolo: isYolo,
            };
          }

          const existing = conversations.find((c) => c.id === convId);
          let wd = existing?.workingDirectory;
          if (wd === "." || !wd) {
            wd = undefined;
          }

          await api.start_session({
            sessionId: convId,
            workingDirectory: wd,
            model: selectedModel,
            backend: selectedBackend,
            backendConfig: backendConfig,
          });
          
          conversationModes.current[convId] = value;
          
          // Seed progress so the UI shows starting indicator immediately
          const event = new CustomEvent('seed-progress', { detail: { sessionId: convId } });
          window.dispatchEvent(event);
          
          updateConversation(convId, (conv) => {
            // Only add system message if it's the active conversation
            if (conv.id === convId) {
              conv.messages.push({
                id: Date.now().toString(),
                parts: [{ type: "text", text: `🔄 **System:** Session restarted in **${value}** mode.` }],
                sender: "assistant",
                timestamp: new Date(),
              });
            }
          });

        } catch (error) {
          console.error("Failed to restart session for approval mode:", error);
           updateConversation(convId, (conv) => {
            conv.messages.push({
              id: Date.now().toString(),
              parts: [{ type: "text", text: `❌ **Error:** Failed to switch mode: ${error}` }],
              sender: "assistant",
              timestamp: new Date(),
            });
          });
        }
    }
  }, [activeConversation, conversations, getApiConfig, selectedModel, selectedBackend, updateConversation]);

  const handleInputChange = useCallback(
    (
      _event: React.ChangeEvent<HTMLTextAreaElement> | null,
      newValue: string,
      _newPlainTextValue: string,
      _mentions: unknown[]
    ) => {
      setInput(newValue);
    },
    [setInput]
  );

  const generateTitleIfNeeded = useCallback(
    async (conversationId: string, messages: Message[]) => {
      const userMessageCount = messages.filter(
        (msg) => msg.sender === "user"
      ).length;

      if (userMessageCount === 3) {
        const userMessages = messages
          .filter((msg) => msg.sender === "user")
          .map((msg) => {
            const textPart = msg.parts.find(p => p.type === "text");
            return textPart && textPart.type === "text" ? textPart.text : "[Attachment]";
          })
          .join(" | ");

        try {
          const generatedTitle = await api.generate_conversation_title({
            message: userMessages,
            model: selectedModel,
          });
          updateConversation(conversationId, (conv) => {
            conv.title = generatedTitle;
          });
        } catch (error) {
          console.error("Failed to generate conversation title:", error);
        }
      }
    },
    [selectedModel, updateConversation]
  );

  const handleSendMessage = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if ((!currentInput.trim() && currentImages.length === 0) || !isCliInstalled) {
        return;
      }

      const parts: UserMessagePart[] = [];
      if (currentInput.trim()) {
        parts.push({
          type: "text",
          text: currentInput,
        });
      }
      
      currentImages.forEach(img => {
        if (img.mimeType.startsWith('image/')) {
          parts.push({
            type: "image",
            mimeType: img.mimeType,
            data: img.data,
          });
        } else {
          parts.push({
            type: "file",
            mimeType: img.mimeType,
            data: img.data,
            name: img.name || "file",
          });
        }
      });

      const newMessage: Message = {
        id: Date.now().toString(),
        parts: parts,
        sender: "user",
        timestamp: new Date(),
      };

      let convId: string;
      if (activeConversation) {
        convId = activeConversation;

        updateConversation(activeConversation, (conv) => {
          conv.messages.push(newMessage);
          conv.isStreaming = true; // Start streaming indicator when sending message
          conv.isNew = false; // Mark as not new once a message is sent
        });

        // Check if this is the 3rd user message and generate title
        const currentConv = conversations.find(
          (c) => c.id === activeConversation
        );
        if (currentConv) {
          await generateTitleIfNeeded(activeConversation, currentConv.messages);
        }
      } else {
        // Create a new conversation with this message.
        // Use timestamp that matches backend log file naming convention
        const timestamp = Date.now();
        convId = timestamp.toString();
        createNewConversation(convId, currentInput.slice(0, 50), [newMessage], true);
        setActiveConversation(convId);
        // IMPORTANT: Wait for event listeners to be fully set up before proceeding
        await setupEventListenerForConversation(convId);
      }

      const messageText = currentInput;
      const messageImages = [...currentImages];

      setInput("");
      setImages([]);

      // Check if user is trying to use the disabled model.
      if (selectedModel === "gemini-2.5-flash-lite") {
        updateConversation(convId, (conv) => {
          conv.messages.push({
            id: (Date.now() + 1).toString(),
            parts: [
              {
                type: "text",
                text: "Unfortunately, Gemini 2.5 Flash-Lite isn't usable due to thinking issues. See issues [#1953](https://github.com/google-gemini/gemini-cli/issues/1953) and [#4548](https://github.com/google-gemini/gemini-cli/issues/4548) on the Gemini CLI repository for more details.  PRs [#3033](https://github.com/google-gemini/gemini-cli/pull/3033) and [#4652](https://github.com/google-gemini/gemini-cli/pull/4652) resolve this issue.",
              },
            ],
            sender: "assistant",
            timestamp: new Date(),
          });
        });
        return;
      }

      try {
        // Get backend configuration
        const apiConfig = getApiConfig();
        console.log("🔍 [useMessageHandler] selectedBackend:", selectedBackend);
        console.log("🔍 [useMessageHandler] apiConfig:", apiConfig);
        let backendConfig = undefined;
        let geminiAuth = undefined;
        let llxprtConfig = undefined;

        if (selectedBackend === "qwen") {
          // Always set backend_config for Qwen, even with OAuth
          // This ensures the backend knows to use qwen CLI instead of gemini CLI
          const qwenCfg = backendState.configs.qwen;
          
          // Determine yolo based on current approvalMode state
          const isYolo = currentApprovalMode === "yolo" || currentApprovalMode === "auto-edit";
          
          backendConfig = {
            api_key: apiConfig?.api_key || "", // Empty string if OAuth
            base_url: apiConfig?.base_url || "https://openrouter.ai/api/v1",
            model: qwenCfg.model || apiConfig?.model || "qwen/qwen3-coder:free",
            yolo: isYolo,
          };
          console.log(
            "🔍 [useMessageHandler] Setting backend_config for Qwen:",
            backendConfig
          );
        } else if (selectedBackend === "llxprt") {
          const llxprtCfg = backendState.configs.llxprt;
          llxprtConfig = {
            provider: llxprtCfg.provider,
            api_key: llxprtCfg.apiKey,
            model: llxprtCfg.model,
            base_url: llxprtCfg.baseUrl || undefined,
          };
          console.log(
            "🔍 [useMessageHandler] Setting llxprt_config for LLxprt:",
            llxprtConfig
          );
        } else if (selectedBackend === "gemini") {
          const geminiConfig = backendState.configs.gemini;
          geminiAuth = {
            // Tauri auto-converts to gemini_auth
            method: geminiConfig.authMethod,
            api_key:
              geminiConfig.authMethod === "gemini-api-key"
                ? geminiConfig.apiKey
                : undefined,
            vertex_project:
              geminiConfig.authMethod === "vertex-ai"
                ? geminiConfig.vertexProject
                : undefined,
            vertex_location:
              geminiConfig.authMethod === "vertex-ai"
                ? geminiConfig.vertexLocation
                : undefined,
            yolo: geminiConfig.yolo,
          };
        }

        // Session progress will be handled by useSessionProgress hook
        // which should be integrated at the component level
        const modelForBackend =
          selectedBackend === "qwen"
            ? backendState.configs.qwen.model || "qwen/qwen3-coder:free"
            : selectedBackend === "llxprt"
              ? backendState.configs.llxprt.model || selectedModel
              : selectedModel;

        const existing = conversations.find((c) => c.id === convId);
        if (!existing?.isActive) {
          const wd = existing?.workingDirectory || ".";
          await api.start_session({
            sessionId: convId,
            workingDirectory: wd,
            model: modelForBackend,
            backendConfig,
            geminiAuth,
            llxprtConfig,
          });
        }

        // Send approval mode command if needed (fallback check)
        const currentMode = conversationModes.current[convId] || "default";
        // If mode in UI (approvalMode) is different from what we think backend has (currentMode),
        // sync it now. This handles cases where session wasn't active when user changed dropdown.
        if (currentApprovalMode !== currentMode) {
          console.log(`[useMessageHandler] Syncing approval mode before message: ${currentMode} -> ${currentApprovalMode}`);
          // Update ref to track current state
          conversationModes.current[convId] = currentApprovalMode;
        }

        await api.send_message({
          sessionId: convId, // Tauri auto-converts to session_id
          message: messageText,
          images: messageImages.length > 0 ? messageImages : undefined,
          conversationHistory: "", // Tauri auto-converts to conversation_history
          model: selectedModel,
          backendConfig: backendConfig, // Tauri auto-converts to backend_config
        });

        // Refresh process statuses after sending message
        await fetchProcessStatuses();
      } catch (error) {
        console.error("Failed to send message:", error);

        updateConversation(convId, (conv) => {
          conv.messages.push({
            id: (Date.now() + 1).toString(),
            parts: [{ type: "text", text: `❌ **Error:** ${error}` }],
            sender: "assistant",
            timestamp: new Date(),
          });
        });
      }
    },
    [
      currentInput,
      currentApprovalMode,
      isCliInstalled,
      activeConversation,
      conversations,
      selectedModel,
      backendState.configs.gemini,
      backendState.configs.qwen,
      backendState.configs.llxprt,
      getApiConfig,
      selectedBackend,
      updateConversation,
      createNewConversation,
      setActiveConversation,
      setupEventListenerForConversation,
      fetchProcessStatuses,
      generateTitleIfNeeded,
      setInput,
    ]
  );

  return {
    input: currentInput,
    setInput,
    images: currentImages,
    setImages,
    handleInputChange,
    handleSendMessage,
    approvalMode: currentApprovalMode,
    setApprovalMode,
  };
};
