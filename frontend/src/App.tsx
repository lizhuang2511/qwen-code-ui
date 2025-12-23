import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import {
  Routes,
  Route,
  Outlet,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./lib/api";
import { AppSidebar } from "./components/layout/AppSidebar";
import {
  MessageInputBar,
  MessageInputBarRef,
} from "./components/conversation/MessageInputBar";
import { AppHeader } from "./components/layout/AppHeader";
import { ConversationSearchDialog } from "./components/conversation/ConversationSearchDialog";
import { CustomTitleBar } from "./components/layout/CustomTitleBar";
import { DirectoryPanel } from "./components/common/DirectoryPanel";
import { GitPanel } from "./components/git/GitPanel";
import { SidebarInset, SidebarResizeHandle } from "./components/ui/sidebar";
import { Toaster } from "./components/ui/sonner";
import { ConversationContext } from "./contexts/ConversationContext";
import {
  BackendProvider,
  useApiConfig,
  useBackend,
} from "./contexts/BackendContext";
import { getBackendText } from "./utils/backendText";
import { HomeDashboard } from "./pages/HomeDashboard";
import ProjectsPage from "./pages/Projects";
import ProjectDetailPage from "./pages/ProjectDetail";
import { McpServersPage } from "./pages/McpServersPage";

// Hooks
import { useConversationManager } from "./hooks/useConversationManager";
import { useProcessManager } from "./hooks/useProcessManager";
import { useMessageHandler } from "./hooks/useMessageHandler";
import { useToolCallConfirmation } from "./hooks/useToolCallConfirmation";
import { useConversationEvents } from "./hooks/useConversationEvents";
import { useCliInstallation } from "./hooks/useCliInstallation";
import { useSessionProgress } from "./hooks/useSessionProgress";
import { useResizable } from "./hooks/useResizable";
import { CliIO, Conversation, Message } from "./types";
import "./index.css";
import { getPlatform } from "./lib/runtime";
import { isPywebview } from "./lib/runtime";
import { SettingsDialog } from "./components/common/SettingsDialog";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

function RootLayoutContent() {
  const { progress, startListeningForSession, seedProgress } =
    useSessionProgress();

  const {
    width: directoryPanelWidth,
    isResizing: isDirectoryPanelResizing,
    handleMouseDown: handleDirectoryPanelResizeStart,
  } = useResizable({
    defaultWidth: 320,
    minWidth: 200,
    maxWidth: 600,
    storageKey: "directory-panel-width",
    reverse: true,
  });

  // Get current route to conditionally render MessageInputBar only on home page
  const location = useLocation();
  const navigate = useNavigate();
  const isHomePage = location.pathname === "/";
  // Check if we are on the project detail page
  const isProjectDetailPage = /^\/projects\/[^/]+$/.test(location.pathname);

  const [selectedModel, setSelectedModel] =
    useState<string>("gemini-2.5-flash");
  const [cliIOLogs, setCliIOLogs] = useState<CliIO[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Right panel state: 'none' | 'directory' | 'git'
  const [activeRightPanel, setActiveRightPanel] = useState<"none" | "directory" | "git">("none");
  
  const [searchOpen, setSearchOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState<string>(".");
  const [isContinuingConversation, setIsContinuingConversation] =
    useState(false);
  const messageInputBarRef = useRef<MessageInputBarRef>(null);
  const listenerCleanups = useRef(new Map<string, () => void>());
  const pendingListenerSetup = useRef(new Set<string>());
  // Global search dialog state (declared above)

  // Get the current working directory (default fallback)
  useEffect(() => {
    const getCurrentWorkingDirectory = async () => {
      console.log("🏠 [App] Initializing default working directory...");
      try {
        const cwd = await api.get_home_directory();
        console.log("🏠 [App] Got home directory from API:", cwd);
        setWorkingDirectory(cwd);
      } catch (error) {
        console.warn(
          "🏠 [App] Failed to get working directory, using current directory:",
          error
        );
        setWorkingDirectory(".");
      }
    };
    getCurrentWorkingDirectory();
  }, []);

  // Use backend context instead of local state
  const { apiConfig } = useApiConfig();
  const { selectedBackend, state: backendState } = useBackend();

  // Set document title based on selected backend
  useEffect(() => {
    const backendText = getBackendText(selectedBackend);
    document.title = backendText.desktopName;

    // Also update native window title on desktop platforms
    if (!__WEB__ && isPywebview()) {
      const api = (window as any).pywebview?.api;
      if (api && typeof api.set_title === "function") {
        api.set_title({ title: backendText.desktopName });
      }
    }
  }, [selectedBackend]);

  // Custom hooks for cleaner code
  const isCliInstalled = useCliInstallation(selectedBackend);

  const {
    conversations,
    activeConversation,
    setActiveConversation,
    updateConversation,
    createNewConversation,
    loadConversationFromHistory,
    removeConversation,
  } = useConversationManager();

  const { processStatuses, fetchProcessStatuses, handleKillProcess } =
    useProcessManager();

  const conversationsWithStatus = useMemo(() => {
    return conversations.map((conv) => {
      const processStatus = processStatuses.find(
        (status) =>
          status.conversation_id === conv.id ||
          status.conversation_id === conv.metadata?.timestamp
      );
      return {
        ...conv,
        isActive: processStatus?.is_alive ?? false,
      };
    });
  }, [conversations, processStatuses]);

  const currentConversationWithStatus = useMemo(() => {
    return conversationsWithStatus.find((c) => c.id === activeConversation);
  }, [conversationsWithStatus, activeConversation]);

  const currentConversation = useMemo(() => {
    return currentConversationWithStatus;
  }, [currentConversationWithStatus]);

  const {
    confirmationRequests,
    setConfirmationRequests,
    handleConfirmToolCall,
  } = useToolCallConfirmation({
    activeConversation,
    updateConversation,
  });

  const { setupEventListenerForConversation } = useConversationEvents(
    setCliIOLogs,
    setConfirmationRequests,
    updateConversation
  );

  const { input, handleInputChange, handleSendMessage } = useMessageHandler({
    activeConversation,
    conversations: conversationsWithStatus,
    selectedModel,
    isCliInstalled,
    updateConversation,
    createNewConversation,
    setActiveConversation,
    setupEventListenerForConversation,
    fetchProcessStatuses,
  });

  // Update working directory when active conversation changes
  useEffect(() => {
    if (currentConversationWithStatus?.workingDirectory) {
      setWorkingDirectory(currentConversationWithStatus.workingDirectory);
    }
  }, [currentConversationWithStatus]);

  // Open Settings dialog when a global event is dispatched
  useEffect(() => {
    const handler = () => setIsSettingsOpen(true);
    // Type guard for addEventListener/removeEventListener signature without using any
    type WindowEventHandler = (this: Window, ev: Event) => unknown;
    window.addEventListener(
      "app:open-settings",
      handler as unknown as WindowEventHandler
    );
    return () =>
      window.removeEventListener(
        "app:open-settings",
        handler as unknown as WindowEventHandler
      );
  }, []);

  // Open Search dialog when a global event is dispatched
  useEffect(() => {
    const handler = () => setSearchOpen(true);
    // Type guard to satisfy TS without any
    type WindowEventHandler = (this: Window, ev: Event) => unknown;
    window.addEventListener(
      "app:open-search",
      handler as unknown as WindowEventHandler
    );
    return () =>
      window.removeEventListener(
        "app:open-search",
        handler as unknown as WindowEventHandler
      );
  }, []);

  // Progress listener started in startNewConversation

  useEffect(() => {
    const setup = async () => {
      const activeConversations = new Set(
        conversationsWithStatus.map((c) => c.id)
      );
      // Cleanup listeners for deleted conversations
      for (const id of listenerCleanups.current.keys()) {
        if (!activeConversations.has(id)) {
          const cleanup = listenerCleanups.current.get(id);
          if (cleanup) {
            cleanup();
          }
          listenerCleanups.current.delete(id);
        }
      }

      // Add listeners for new conversations
      for (const conversation of conversationsWithStatus) {
        if (
          !listenerCleanups.current.has(conversation.id) &&
          !pendingListenerSetup.current.has(conversation.id)
        ) {
          // Mark as pending to prevent duplicate setup
          pendingListenerSetup.current.add(conversation.id);

          try {
            const cleanup = await setupEventListenerForConversation(
              conversation.id
            );
            listenerCleanups.current.set(conversation.id, cleanup);
          } finally {
            // Remove from pending set regardless of success/failure
            pendingListenerSetup.current.delete(conversation.id);
          }
        }
      }
    };

    setup();
  }, [conversationsWithStatus, setupEventListenerForConversation]);

  const handleModelChange = useCallback((model: string) => {
    setSelectedModel(model);
  }, []);

  const startNewConversation = useCallback(
    async (
      title: string,
      workingDirectory?: string,
      initialMessages: Message[] = [],
      conversationId?: string
    ): Promise<string> => {
      const convId = conversationId || Date.now().toString();
      createNewConversation(
        convId,
        title,
        initialMessages,
        false,
        workingDirectory
      );
      setActiveConversation(convId);

      if (workingDirectory) {
        // Start listening for progress before starting the session
        await startListeningForSession(convId);
        console.log(
          "🔄 [APP] Started listening for session progress: ",
          convId
        );

        console.log("Debug - apiConfig:", apiConfig);
        console.log("Debug - selectedBackend:", selectedBackend);

        let backendConfig;
        let geminiAuth;

        // For Qwen backend, pass full backend_config
        // For Gemini backend, pass geminiAuth with the appropriate configuration
        if (selectedBackend === "qwen") {
          // Always ensure backend_config is set for Qwen to trigger qwen CLI
          backendConfig = {
            // Tauri auto-converts to backend_config
            api_key: apiConfig?.api_key || "", // Empty string if OAuth
            base_url: apiConfig?.base_url || "https://openrouter.ai/api/v1",
            model: apiConfig?.model || selectedModel,
          };
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
          };
        }

        // Optimistically seed initial progress so the UI shows immediately
        try {
          const backendName = getBackendText(selectedBackend).name;
          seedProgress({
            message: `Starting ${backendName} session initialization`,
            progress_percent: 5,
            details: workingDirectory
              ? `Working directory: ${workingDirectory}`
              : undefined,
          });
        } catch (e) {
          console.warn("⚠️ [APP] Failed to seed initial progress", e);
        }

        // IMPORTANT: Attach conversation event listeners BEFORE starting the session
        // to avoid losing early streaming chunks (race observed in web mode).
        try {
          if (
            !listenerCleanups.current.has(convId) &&
            !pendingListenerSetup.current.has(convId)
          ) {
            // Mark as pending to prevent duplicate setup
            pendingListenerSetup.current.add(convId);

            try {
              const cleanup = await setupEventListenerForConversation(convId);
              listenerCleanups.current.set(convId, cleanup);
              console.log(
                "👂 [APP] Pre-attached conversation listeners before start_session:",
                convId
              );
            } finally {
              // Remove from pending set regardless of success/failure
              pendingListenerSetup.current.delete(convId);
            }
          }
        } catch (e) {
          console.error(
            "❌ [APP] Failed to pre-attach conversation listeners:",
            e
          );
        }

        const modelForBackend =
          selectedBackend === "qwen"
            ? backendState.configs.qwen.model || "qwen/qwen3-coder:free"
            : selectedModel;
        console.log("🚀 [APP] Starting session", {
          sessionId: convId,
          workingDirectory,
          model: modelForBackend,
          backend: selectedBackend,
        });
        await api.start_session({
          sessionId: convId,
          workingDirectory,
          model: modelForBackend,
          backend: selectedBackend,
          backendConfig,
          geminiAuth,
        });
        // Explicitly refresh process statuses to ensure UI updates promptly
        await fetchProcessStatuses();
      }

      return convId;
    },
    [
      selectedModel,
      selectedBackend,
      apiConfig,
      backendState.configs.gemini,
      createNewConversation,
      setActiveConversation,
      startListeningForSession,
      setupEventListenerForConversation,
      seedProgress,
      fetchProcessStatuses,
    ]
  );

  const toggleDirectoryPanel = useCallback(() => {
    setActiveRightPanel((prev) => (prev === "directory" ? "none" : "directory"));
  }, []);

  const toggleGitPanel = useCallback(() => {
    setActiveRightPanel((prev) => (prev === "git" ? "none" : "git"));
  }, []);

  // Auto-close right panel when active conversation ends, unless we are on project detail page
  useEffect(() => {
    if (!activeConversation && !isProjectDetailPage && activeRightPanel !== "none") {
      setActiveRightPanel("none");
    }
  }, [activeConversation, isProjectDetailPage, activeRightPanel]);

  const handleContinueConversation = useCallback(
    async (conversationToContinue: Conversation) => {
      if (!conversationToContinue || isContinuingConversation) return;

      setIsContinuingConversation(true);
      try {
        const newTitle = `(Continued) ${conversationToContinue.title}`;

        await startNewConversation(
          newTitle,
          conversationToContinue.workingDirectory,
          conversationToContinue.messages
        );
      } finally {
        setIsContinuingConversation(false);
      }
    },
    [startNewConversation, isContinuingConversation]
  );

  // Handle mention insertion from DirectoryPanel
  const handleMentionInsert = useCallback((mention: string) => {
    if (messageInputBarRef.current) {
      messageInputBarRef.current.insertMention(mention);
      // Close the dropdown after inserting the mention
      messageInputBarRef.current.closeDropdown();
    }
  }, []);

  // Handle new conversation from DirectoryPanel
  const handleNewConversationFromDirectory = useCallback(async () => {
    if (!workingDirectory) return;
    
    // Determine folder name from workingDirectory
    const normalizedPath = workingDirectory.replace(/\\/g, "/");
    const folderName = normalizedPath.split("/").filter(Boolean).pop() || workingDirectory;
    const title = `Chat in ${folderName}`;
    
    await startNewConversation(title, workingDirectory);
    
    // If we are not on the home page, navigate there
    if (location.pathname !== "/") {
      navigate("/");
    }
  }, [workingDirectory, startNewConversation, location.pathname, navigate]);

  // Handle conversation selection from sidebar
  const handleConversationSelect = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      // Navigate to home page to show the conversation
      if (location.pathname !== "/") {
        navigate("/");
      }
    },
    [navigate, location.pathname, setActiveConversation]
  );

  // Conversation context with progress
  const contextValue = useMemo(
    () => ({
      conversations,
      activeConversation,
      setActiveConversation,
      currentConversation,
      input,
      isCliInstalled,
      messagesContainerRef,
      cliIOLogs,
      handleInputChange,
      handleSendMessage,
      selectedModel,
      startNewConversation,
      loadConversationFromHistory,
      handleConfirmToolCall,
      confirmationRequests,
      removeConversation,
      progress,
    }),
    [
      conversations,
      activeConversation,
      currentConversation,
      input,
      isCliInstalled,
      messagesContainerRef,
      cliIOLogs,
      handleInputChange,
      handleSendMessage,
      selectedModel,
      startNewConversation,
      loadConversationFromHistory,
      handleConfirmToolCall,
      confirmationRequests,
      removeConversation,
      progress,
    ]
  );

  return (
    <ConversationContext.Provider value={contextValue}>
      <AppSidebar
        conversations={conversationsWithStatus}
        activeConversation={activeConversation}
        processStatuses={processStatuses}
        onConversationSelect={handleConversationSelect}
        onKillProcess={handleKillProcess}
        onRemoveConversation={removeConversation}
        onModelChange={handleModelChange}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        onOpenSearch={() => setSearchOpen(true)}
      >
        <SidebarInset>
          {/* Grid layout: header spans all columns; content + optional right panel */}
          <div
            className="grid h-full"
            style={{
              gridTemplateRows: "auto 1fr",
              gridTemplateColumns:
                activeRightPanel !== "none" &&
                (activeConversation || isProjectDetailPage)
                  ? `1fr ${directoryPanelWidth}px`
                  : "1fr",
            }}
          >
            {/* Header */}
            <div className="row-start-1 col-span-full">
              <AppHeader
                onDirectoryPanelToggle={toggleDirectoryPanel}
                isDirectoryPanelOpen={activeRightPanel === "directory"}
                onGitPanelToggle={toggleGitPanel}
                isGitPanelOpen={activeRightPanel === "git"}
                hasActiveConversation={!!activeConversation}
                showDirectoryButton={
                  !!activeConversation || isProjectDetailPage
                }
                onReturnToDashboard={() => {
                  setActiveConversation(null);
                  navigate("/projects");
                }}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />
            </div>

            {/* Main content column */}
            <div className="row-start-2 col-start-1 flex flex-col min-w-0 min-h-0">
              <Outlet context={{ workingDirectory, setWorkingDirectory }} />
              {currentConversationWithStatus && isHomePage && (
                <>
                  {console.log(
                    "📝 [App] Rendering MessageInputBar with workingDirectory:",
                    workingDirectory
                  )}
                  <MessageInputBar
                    ref={messageInputBarRef}
                    input={input}
                    isCliInstalled={isCliInstalled}
                    cliIOLogs={cliIOLogs}
                    handleInputChange={handleInputChange}
                    handleSendMessage={handleSendMessage}
                    workingDirectory={workingDirectory}
                    isConversationActive={
                      currentConversationWithStatus.isActive
                    }
                    onContinueConversation={() =>
                      handleContinueConversation(currentConversationWithStatus)
                    }
                    isContinuingConversation={isContinuingConversation}
                    isNew={currentConversationWithStatus.isNew}
                    isStreaming={currentConversationWithStatus.isStreaming}
                  />
                </>
              )}
            </div>

            {/* Right panel (Directory or Git) */}
            {activeRightPanel !== "none" &&
              (activeConversation || isProjectDetailPage) && (
                <div className="row-start-2 col-start-2 min-h-0 relative">
                  <SidebarResizeHandle
                    onMouseDown={handleDirectoryPanelResizeStart}
                    isResizing={isDirectoryPanelResizing}
                    side="right"
                  />
                  {activeRightPanel === "directory" && (
                    <DirectoryPanel
                      workingDirectory={workingDirectory}
                      onDirectoryChange={(path) => {
                        console.log("📁 [App] Directory changed to:", path);
                      }}
                      onMentionInsert={handleMentionInsert}
                      onNewConversation={handleNewConversationFromDirectory}
                      className="w-full h-full"
                    />
                  )}
                  {activeRightPanel === "git" && (
                    <GitPanel
                      workingDirectory={workingDirectory}
                      className="w-full h-full"
                    />
                  )}
                </div>
              )}
          </div>
        </SidebarInset>
      </AppSidebar>
      {/* Global Search Dialog */}
      <ConversationSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onConversationSelect={(id) => setActiveConversation(id)}
        fullScreen
      />
      {/* Settings Dialog */}
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onModelChange={handleModelChange}
      />
    </ConversationContext.Provider>
  );
}

function RootLayoutInner() {
  // Add OS-specific class to body for styling
  useEffect(() => {
    const setOsClass = async () => {
      if (!__WEB__) {
        const p = await getPlatform();
        document.body.classList.add(`os-${p}`);
      } else {
        document.body.classList.add("os-web");
      }
    };
    setOsClass();
  }, []);

  return (
    <div className="h-screen w-full">
      <CustomTitleBar />
      <div className="size-full">
        <ErrorBoundary>
          <RootLayoutContent />
        </ErrorBoundary>
      </div>

      
    </div>
  );
}

function RootLayout() {
  return (
    <BackendProvider>
      <RootLayoutInner />
    </BackendProvider>
  );
}

function App() {
  return (
    <>
      <Routes>
        <Route element={<RootLayout />}>
          <Route index element={<HomeDashboard />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="mcp" element={<McpServersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster richColors />
    </>
  );
}

export default App;
