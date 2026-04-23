import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { FileText, Trash2, ArrowLeft, Play } from "lucide-react";
import {
  McpServerEntry,
  isStdioConfig,
  isSSEConfig,
  isHTTPConfig,
} from "../types";
import { PasteJsonDialog } from "../components/mcp/PasteJsonDialog";
import { ModelContextProtocol } from "../components/common/ModelContextProtocol";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../components/ui/dialog";
// import { Code } from "../components/ui/code"; // Unused import
import { useBackend } from "../contexts/BackendContext";
import { getBackendText } from "../utils/backendText";
import { useTranslation } from "react-i18next";

import { Switch } from "../components/ui/switch";
import { api } from "../lib/api";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, PowerOff, Edit } from "lucide-react";

export function McpServersPage() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [serverStatuses, setServerStatuses] = useState<Record<string, { alive: boolean; checking: boolean; message?: string }>>({});
  const [settingsFilePath, setSettingsFilePath] = useState<string>("~/.qwen/settings.json");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<McpServerEntry | null>(
    null
  );
  const { selectedBackend } = useBackend();
  const backendText = getBackendText(selectedBackend);
  const navigate = useNavigate();

  const loadSettingsPath = useCallback(async () => {
    // For Qwen, the path is fixed
    setSettingsFilePath("~/.qwen/settings.json");
  }, [selectedBackend, t]);

  // Use settingsFilePath to prevent unused variable warning
  useEffect(() => {
    if (settingsFilePath) {
      console.log("Using settings file:", settingsFilePath);
    }
  }, [settingsFilePath]);

  const checkServerStatus = useCallback(async (server: McpServerEntry) => {
    setServerStatuses(prev => ({
      ...prev,
      [server.id]: { alive: false, checking: true }
    }));
    
    try {
      const result = await api.check_mcp_server({ config: server.config });
      setServerStatuses(prev => ({
        ...prev,
        [server.id]: { alive: result.success, checking: false, message: result.message }
      }));
    } catch (error) {
      setServerStatuses(prev => ({
        ...prev,
        [server.id]: { alive: false, checking: false, message: String(error) }
      }));
    }
  }, []);

  const loadSettingsFromFile = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await api.get_mcp_config();
      if (config && config.mcpServers) {
        const loadedServers: McpServerEntry[] = Object.entries(config.mcpServers).map(
          ([name, serverConfig]: [string, any]) => ({
            id: name,
            name: name,
            config: serverConfig,
            enabled: serverConfig.enabled !== false,
          })
        );
        setServers(loadedServers);
        
        // Check status for enabled servers
        loadedServers.forEach(s => {
            if (s.enabled) {
                checkServerStatus(s);
            }
        });
      } else {
        setServers([]);
      }
    } catch (error) {
      console.error("Failed to load MCP config:", error);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBackend, t, checkServerStatus]);

  // Load settings file path on component mount and when backend changes
  useEffect(() => {
    loadSettingsPath();
  }, [selectedBackend, loadSettingsPath]);

  // Load MCP servers from settings.json file when component mounts
  useEffect(() => {
    loadSettingsFromFile();
  }, [loadSettingsFromFile]);

  // Save MCP servers to settings.json file
  const saveServersToFile = async (updatedServers: McpServerEntry[]) => {
    setIsLoading(true);
    setServers(updatedServers); // Optimistic update
    
    try {
      const mcpServers: Record<string, any> = {};
      updatedServers.forEach(server => {
        mcpServers[server.name] = { ...server.config, enabled: server.enabled };
      });
      
      await api.save_mcp_config({ mcpServers });
    } catch (error) {
      console.error("Failed to save MCP config:", error);
      // Revert state if needed, or show error
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleServer = (server: McpServerEntry, checked: boolean) => {
    const updatedServers = servers.map((s) =>
      s.id === server.id ? { ...s, enabled: checked } : s
    );
    saveServersToFile(updatedServers);
    
    if (checked) {
        checkServerStatus(server);
    } else {
        setServerStatuses(prev => {
            const next = { ...prev };
            delete next[server.id];
            return next;
        });
    }
  };

  const handleDisableAllServers = () => {
    const updatedServers = servers.map((s) => ({ ...s, enabled: false }));
    saveServersToFile(updatedServers);
    setServerStatuses({});
  };

  const handleAddServers = (newServers: McpServerEntry[]) => {
    const updatedServers = [...servers, ...newServers];
    saveServersToFile(updatedServers);
  };

  const handleDeleteServer = (server: McpServerEntry) => {
    setServerToDelete(server);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteServer = () => {
    if (serverToDelete) {
      const updatedServers = servers.filter(
        (server) => server.id !== serverToDelete.id
      );
      saveServersToFile(updatedServers);
      setDeleteDialogOpen(false);
      setServerToDelete(null);
    }
  };

  const cancelDeleteServer = () => {
    setDeleteDialogOpen(false);
    setServerToDelete(null);
  };

  const handleLaunchQwenTest = async () => {
    try {
      await api.launch_qwen_mcp();
    } catch (error) {
      console.error("Failed to launch Qwen:", error);
    }
  };

  // Helper function to format server details
  const formatServerDetails = (server: McpServerEntry) => {
    const config = server.config;
    const details: { label: string; value: string }[] = [];

    // Add environment variables
    if (config.env && Object.keys(config.env).length > 0) {
      const envStrings = Object.entries(config.env)
        .map(([key, value]) => `${key} = ${value}`)
        .join(" • ");
      details.push({ label: t("mcp.environment"), value: envStrings });
    }

    // Add working directory for stdio servers
    if (isStdioConfig(config) && config.cwd) {
      details.push({ label: t("mcp.workingDirectory"), value: config.cwd });
    }

    // Add headers for HTTP servers
    if (
      (isSSEConfig(config) || isHTTPConfig(config)) &&
      config.headers &&
      Object.keys(config.headers).length > 0
    ) {
      const headerStrings = Object.entries(config.headers)
        .map(([key, value]) => `${key} = ${value}`)
        .join(" • ");
      details.push({ label: t("mcp.headers"), value: headerStrings });
    }

    // Add include tools
    if (config.includeTools && config.includeTools.length > 0) {
      details.push({
        label: t("mcp.includedTools"),
        value: config.includeTools.join(" • "),
      });
    }

    // Add exclude tools
    if (config.excludeTools && config.excludeTools.length > 0) {
      details.push({
        label: t("mcp.excludedTools"),
        value: config.excludeTools.join(" • "),
      });
    }

    // Add timeout
    if (config.timeout) {
      const minutes = Math.round(config.timeout / 60000);
      details.push({
        label: t("mcp.timeout"),
        value: `${config.timeout.toLocaleString()}ms (${minutes} minutes)`,
      });
    }

    return details;
  };

  const getMainServerInfo = (server: McpServerEntry) => {
    const config = server.config;
    if (isStdioConfig(config)) {
      const args =
        config.args && config.args.length > 0
          ? ` ${config.args.join(" ")}`
          : "";
      return `${config.command}${args}`;
    } else if (isSSEConfig(config)) {
      return config.url;
    } else if (isHTTPConfig(config)) {
      return config.httpUrl;
    }
    return "";
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 flex-1 flex flex-col overflow-hidden">
        {/* Page Header */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition cursor-pointer"
            aria-label={t("accessibility.backToHome")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>{t("navigation.backToHome")}</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">{t("mcp.title")}</h1>
              <p className="text-muted-foreground">{t("mcp.description")}</p>
            </div>
            {/* Top action buttons */}
            {servers.length > 0 && (
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                  onClick={handleDisableAllServers}
                >
                  <PowerOff className="h-4 w-4" />
                  关闭所有 MCP
                </Button>
                <Button
                  variant="secondary"
                  className="flex items-center gap-2"
                  onClick={handleLaunchQwenTest}
                >
                  <Play className="h-4 w-4" />
                  启动 qwen 安测
                </Button>
                <PasteJsonDialog
                  trigger={
                    <Button variant="outline" className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      添加 MCP 服务
                    </Button>
                  }
                  onServersAdd={handleAddServers}
                />
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="text-sm text-muted-foreground">
                {t("mcp.loadingSettings")}
              </div>
            </div>
          ) : servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <ModelContextProtocol className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {t("mcp.noServersConfigured")}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                {backendText.mcpCapabilities} {t("mcp.addFirstServer")}.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex items-center gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                  onClick={handleDisableAllServers}
                >
                  <PowerOff className="h-4 w-4" />
                  关闭所有 MCP
                </Button>
                <Button
                  variant="secondary"
                  className="flex items-center gap-2"
                  onClick={handleLaunchQwenTest}
                >
                  <Play className="h-4 w-4" />
                  启动 qwen 安测
                </Button>
                <PasteJsonDialog
                  trigger={
                    <Button
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      <FileText className="h-4 w-4" />
                      添加 MCP 服务
                    </Button>
                  }
                  onServersAdd={handleAddServers}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-5xl mx-auto">
              {servers.map((server) => {
                const details = formatServerDetails(server);
                const mainInfo = getMainServerInfo(server);

                return (
                  <Card key={server.id} className="p-4">
                    <CardContent className="p-0 space-y-2">
                      {/* Server header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-lg">
                          <span className="font-semibold">{server.name}</span>
                          <span className="text-muted-foreground font-mono text-sm">
                            {mainInfo}
                          </span>
                          {server.config.trust ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              <span className="text-sm font-medium">
                                {t("mcp.trusted")}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              {t("mcp.notTrusted")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Status Indicator */}
                          {server.enabled && (
                            <div className="flex items-center mr-2" title={serverStatuses[server.id]?.message || ""}>
                                {serverStatuses[server.id]?.checking ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : serverStatuses[server.id]?.alive ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                )}
                            </div>
                          )}

                          {/* Edit Server Button (JSON Editor) */}
                          <PasteJsonDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Edit Server Configuration"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            }
                            initialJson={JSON.stringify({ mcpServers: { [server.name]: server.config } }, null, 2)}
                            isEditMode={true}
                            onServersAdd={(updatedServers) => {
                              if (updatedServers.length > 0) {
                                // Find the server being edited
                                const updatedServerConfig = updatedServers[0];
                                
                                // Maintain the original ID and enabled status, update name and config
                                const serverToSave = {
                                  ...server,
                                  name: updatedServerConfig.name,
                                  config: updatedServerConfig.config
                                };
                                
                                const newServersList = servers.map(s => 
                                  s.id === server.id ? serverToSave : s
                                );
                                saveServersToFile(newServersList);
                                
                                // Check status immediately after editing if it's enabled
                                if (serverToSave.enabled) {
                                  checkServerStatus(serverToSave);
                                }
                              }
                            }}
                          />

                          <div className="flex items-center gap-2 mr-2">
                            <Switch
                              checked={server.enabled}
                              onCheckedChange={(checked) => handleToggleServer(server, checked)}
                            />
                            <span className="text-sm text-muted-foreground hidden sm:inline-block">
                              {server.enabled ? t("common.enabled") : t("common.disabled")}
                            </span>
                          </div>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => checkServerStatus(server)}
                            disabled={!server.enabled || serverStatuses[server.id]?.checking}
                            title="Check Status"
                          >
                             <RefreshCw className={`h-4 w-4 ${serverStatuses[server.id]?.checking ? "animate-spin" : ""}`} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteServer(server)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Server details */}
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {details.map((detail, index) => (
                          <div key={index}>
                            <span className="font-medium">{detail.label}:</span>{" "}
                            <span className="font-mono">{detail.value}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-6 flex justify-center">
          <Button
            variant="outline"
            onClick={() => navigate("/skills")}
            className="px-10"
          >
            {t("skills.title", "Skills 管理")}
          </Button>
        </div>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("mcp.deleteServer")}</DialogTitle>
              <DialogDescription>
                {t("mcp.deleteConfirmation", {
                  serverName: serverToDelete?.name,
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={cancelDeleteServer}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" onClick={confirmDeleteServer}>
                {t("mcp.deleteServerButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
