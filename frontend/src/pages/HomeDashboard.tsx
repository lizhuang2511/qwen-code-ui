import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useConversation } from "../contexts/ConversationContext";
import { MessageContent } from "../components/conversation/MessageContent";
import { ThinkingBlock } from "../components/conversation/ThinkingBlock";
import { ToolCallDisplay } from "../components/common/ToolCallDisplay";
import { NewChatPlaceholder } from "../components/conversation/NewChatPlaceholder";
import { SmartLogo } from "../components/branding/SmartLogo";
import { SmartLogoCenter } from "../components/branding/SmartLogoCenter";
import { DesktopText } from "../components/branding/DesktopText";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "../components/ui/dialog";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { Info, UserRound, FolderKanban, FileText, Sparkles, Download, Loader2, MessageSquare } from "lucide-react";
import { ModelContextProtocol } from "../components/common/ModelContextProtocol";
import { getBackendText } from "../utils/backendText";
import { useBackend } from "../contexts/BackendContext";
import { GeminiMessagePart, type Message } from "../types";
import { api } from "../lib/api";
import { downloadMarkdownContent } from "../utils/download";
import { toast } from "sonner";

export const HomeDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    currentConversation,
    messagesContainerRef,
    handleConfirmToolCall,
    confirmationRequests,
    startNewConversation,
  } = useConversation();

  // Debug logging for currentConversation
  console.log("🏠 HomeDashboard - currentConversation:", currentConversation);

  const { selectedBackend } = useBackend();
  const backendText = getBackendText(selectedBackend);

  const [qwenDialogOpen, setQwenDialogOpen] = React.useState(false);
  const [qwenStatus, setQwenStatus] = React.useState<
    "idle" | "checking" | "installing" | "installed" | "failed"
  >("idle");
  const [qwenOutput, setQwenOutput] = React.useState<string>("");

  const [pythonDialogOpen, setPythonDialogOpen] = React.useState(false);
  const [pythonStatus, setPythonStatus] = React.useState<
    "idle" | "checking" | "downloading" | "installing" | "installed" | "failed"
  >("idle");
  const [pythonOutput, setPythonOutput] = React.useState<string>("");

  const [exportingMessageId, setExportingMessageId] = React.useState<
    string | null
  >(null);
  const [exportChoiceOpen, setExportChoiceOpen] = React.useState(false);
  const [pendingExportMessage, setPendingExportMessage] = React.useState<Message | null>(null);
  const [isStartingDirectChat, setIsStartingDirectChat] = React.useState(false);

  const handleStartDirectChat = React.useCallback(async () => {
    if (isStartingDirectChat) return;
    setIsStartingDirectChat(true);
    try {
      const baseDir = "d:/qwencode/临时计算";
      const exists = await api.validate_directory({ path: baseDir });
      if (!exists) {
        const ok = confirm(`目录不存在：${baseDir}\n是否新建？`);
        if (!ok) return;
        const created = await api.create_directory({ path: baseDir });
        if (!created) {
          toast.error(t("dashboard.directChatCreateDirFailed", "创建目录失败"));
          return;
        }
      }
      const wd = await api.create_temp_workspace();
      const title = t("dashboard.directChatTitle", "直接对话");
      await startNewConversation(title, wd);
    } finally {
      setIsStartingDirectChat(false);
    }
  }, [isStartingDirectChat, startNewConversation, t]);

  const joinPath = React.useCallback((dir: string, fileName: string) => {
    const normalized = (dir || "").replace(/[\\/]+$/, "");
    const sep = normalized.includes("\\") ? "\\" : "/";
    if (!normalized) return fileName;
    return `${normalized}${sep}${fileName}`;
  }, []);

  const buildMessageMarkdown = React.useCallback(
    (message: Message, mode: "all" | "last" = "all"): string => {
    const getFence = (content: string) => {
      const matches = content.match(/`+/g) || [];
      const maxRun = matches.reduce((m, s) => Math.max(m, s.length), 0);
      return "`".repeat(Math.max(3, maxRun + 1));
    };

    const codeBlock = (content: string, lang?: string) => {
      const c = content ?? "";
      const fence = getFence(c);
      const language = lang ? lang.trim() : "";
      return `${fence}${language}\n${c}\n${fence}`;
    };

    const asText = (value: unknown) => {
      if (typeof value === "string") return value;
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    };

    if (message.sender === "user") {
      return "";
    }

    if (mode === "last") {
      const out: string[] = [];
      for (const part of message.parts) {
        if (part.type === "text") {
          const text = part.text.trimEnd();
          if (text.trim()) out.push(text);
        }
      }
      return `${out.join("\n\n").trim()}\n`;
    }

    const groupedParts = message.parts.reduce<GeminiMessagePart[]>(
      (acc, part) => {
        const lastPart = acc.length > 0 ? acc[acc.length - 1] : null;
        if (part.type === "thinking" && lastPart?.type === "thinking") {
          lastPart.thinking += `\n\n${part.thinking}`;
        } else {
          acc.push({ ...part });
        }
        return acc;
      },
      []
    );

    const out: string[] = [];
    for (const part of groupedParts) {
      if (part.type === "text") {
        if (part.text.trim()) out.push(part.text.trimEnd());
      } else if (part.type === "thinking") {
        const t = part.thinking.trimEnd();
        if (t) {
          out.push("## Thinking");
          out.push(codeBlock(t, "text"));
        }
      } else if (part.type === "toolCall") {
        const toolCall = part.toolCall;
        out.push(`## ToolCall: ${toolCall.name}`);
        if (toolCall.status) out.push(`Status: ${toolCall.status}`);
        if (toolCall.inputJsonRpc) {
          out.push("### Input (JSON-RPC)");
          out.push(codeBlock(toolCall.inputJsonRpc.trimEnd(), "json"));
        }
        if (toolCall.outputJsonRpc) {
          out.push("### Output (JSON-RPC)");
          out.push(codeBlock(toolCall.outputJsonRpc.trimEnd(), "json"));
        }
        if (toolCall.result !== undefined) {
          const result = toolCall.result;
          if (
            typeof result === "object" &&
            result !== null &&
            "markdown" in result &&
            typeof (result as { markdown?: unknown }).markdown === "string" &&
            (result as { markdown: string }).markdown.trim()
          ) {
            out.push("### Result (Markdown)");
            out.push((result as { markdown: string }).markdown.trimEnd());
          } else {
            out.push("### Result");
            out.push(codeBlock(asText(result).trimEnd(), "json"));
          }
        }
      }
    }

    return `${out.join("\n\n").trim()}\n`;
    },
    []
  );

  const exportMd = React.useCallback(
    async (message: Message, mode: "all" | "last") => {
      if (message.sender !== "assistant") return;
      const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date();
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const fileName = `reply-${timestamp.getFullYear()}-${pad2(
        timestamp.getMonth() + 1
      )}-${pad2(timestamp.getDate())}-${pad2(timestamp.getHours())}-${pad2(
        timestamp.getMinutes()
      )}-${pad2(timestamp.getSeconds())}.md`;

      const content = buildMessageMarkdown(message, mode);
      if (!content.trim()) return;

      setExportingMessageId(message.id);
      try {
        const wd = currentConversation?.workingDirectory;
        if (wd) {
          const targetPath = joinPath(wd, fileName);
          await api.write_file_content({ path: targetPath, content });
          return;
        }

        const selectedPath = await api.select_save_file({
          sessionId: currentConversation?.id,
          defaultFilename: fileName,
        });
        if (!selectedPath) return;
        await api.write_file_content({ path: selectedPath, content });
      } catch {
        downloadMarkdownContent(content, fileName);
      } finally {
        setExportingMessageId((prev) => (prev === message.id ? null : prev));
      }
    },
    [buildMessageMarkdown, currentConversation?.id, currentConversation?.workingDirectory, joinPath]
  );

  const handleExportMd = React.useCallback((message: Message) => {
    if (message.sender !== "assistant") return;
    setPendingExportMessage(message);
    setExportChoiceOpen(true);
  }, []);

  const startQwenInstallFlow = React.useCallback(async () => {
    setQwenDialogOpen(true);
    setQwenOutput("");
    setQwenStatus("checking");
    try {
      const installed = await api.is_qwen_installed();
      if (installed) {
        setQwenStatus("installed");
        return;
      }
      setQwenStatus("installing");
      const res = await api.install_qwen();
      setQwenOutput(res.output || "");
      setQwenStatus(res.installed ? "installed" : "failed");
    } catch {
      setQwenStatus("failed");
    }
  }, []);

  const startPythonInstallFlow = React.useCallback(async () => {
    setPythonDialogOpen(true);
    setPythonOutput("");
    setPythonStatus("checking");
    try {
      const installed = await api.is_python_installed();
      if (installed) {
        setPythonStatus("installed");
        return;
      }
      setPythonStatus("downloading");
      await new Promise((r) => setTimeout(r, 500));
      setPythonStatus("installing");
      const res = await api.install_python();
      setPythonOutput(res.output || "");
      setPythonStatus(res.installed ? "installed" : "failed");
    } catch {
      setPythonStatus("failed");
    }
  }, []);

  // Auto-scroll to bottom when entering a conversation or when messages change
  const prevConversationIdRef = React.useRef<string | undefined>(undefined);
  useEffect(() => {
    if (currentConversation?.id) {
      const isNewConversation = prevConversationIdRef.current !== currentConversation.id;
      prevConversationIdRef.current = currentConversation.id;

      // Small delay to ensure React has rendered the messages in the DOM
      setTimeout(() => {
        if (messagesContainerRef.current) {
          const container = messagesContainerRef.current;
          
          if (isNewConversation) {
            // Always scroll to bottom when entering a new conversation
            container.scrollTop = container.scrollHeight;
          } else {
            // If just adding messages to current conversation, only auto-scroll if already near bottom
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
            if (isNearBottom) {
              container.scrollTop = container.scrollHeight;
            }
          }
        }
      }, 50);
    }
  }, [currentConversation?.id, currentConversation?.messages?.length, messagesContainerRef]);

  return (
    <>
      <Dialog
        open={exportChoiceOpen}
        onOpenChange={(open) => {
          setExportChoiceOpen(open);
          if (!open) setPendingExportMessage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出 Markdown</DialogTitle>
            <DialogDescription>选择导出内容范围</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              onClick={async () => {
                const msg = pendingExportMessage;
                setExportChoiceOpen(false);
                if (!msg) return;
                await exportMd(msg, "all");
              }}
            >
              导出所有内容（含工具调用）
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const msg = pendingExportMessage;
                setExportChoiceOpen(false);
                if (!msg) return;
                await exportMd(msg, "last");
              }}
            >
              仅导出最后回复内容
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setExportChoiceOpen(false);
              }}
            >
              取消
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {currentConversation ? (
        currentConversation.messages.length === 0 ? (
          <NewChatPlaceholder />
        ) : (
          <div
            ref={messagesContainerRef as React.RefObject<HTMLDivElement>}
            className="flex-1 min-h-0 overflow-y-auto p-6 relative"
          >
            <div className="space-y-8 pb-4">
              {currentConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`w-full ${message.sender === "user" ? "flex justify-start" : ""}`}
                >
                  <div className="w-full">
                    {/* Header with logo and timestamp */}
                    <div className="flex items-center gap-2 mb-4">
                      {message.sender === "assistant" ? (
                        <div>
                          <SmartLogo />
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            <div
                              className="size-5.5 flex items-center justify-center overflow-hidden rounded-full"
                              style={{
                                background:
                                  "radial-gradient(circle, #346bf1 0%, #3186ff 50%, #4fa0ff 100%)",
                              }}
                            >
                              <UserRound className="size-4" />
                            </div>
                            {t("dashboard.user")}
                          </div>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <>
                      {(() => {
                        if (message.sender === "user") {
                          return message.parts.map((msgPart, partIndex) => {
                            if (msgPart.type === "text") {
                              return (
                                <div
                                  key={partIndex}
                                  className="text-sm text-gray-900 dark:text-gray-100 mb-2"
                                >
                                  <MessageContent content={msgPart.text} />
                                </div>
                              );
                            } else if (msgPart.type === "image") {
                              return (
                                <div key={partIndex} className="mb-2 max-w-sm">
                                  <img 
                                    src={`data:${msgPart.mimeType};base64,${msgPart.data}`} 
                                    alt="User uploaded" 
                                    className="rounded-lg border object-contain max-h-96"
                                  />
                                </div>
                              );
                            } else if (msgPart.type === "file") {
                              return (
                                <div key={partIndex} className="mb-2 max-w-sm">
                                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border">
                                    <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-medium truncate" title={msgPart.name}>
                                        {msgPart.name || 'File'}
                                      </div>
                                      <div className="text-xs text-muted-foreground truncate">
                                        {msgPart.mimeType || 'Unknown type'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          });
                        }

                        const groupedParts = message.parts.reduce<
                          GeminiMessagePart[]
                        >((acc, part) => {
                          const lastPart =
                            acc.length > 0 ? acc[acc.length - 1] : null;
                          if (
                            part.type === "thinking" &&
                            lastPart &&
                            lastPart.type === "thinking"
                          ) {
                            lastPart.thinking += `
                            
${part.thinking}`;
                          } else {
                            acc.push({ ...part });
                          }
                          return acc;
                        }, []);

                        return groupedParts.map((msgPart, partIndex) => (
                          <React.Fragment key={partIndex}>
                            {msgPart.type === "thinking" ? (
                              <ThinkingBlock thinking={msgPart.thinking} />
                            ) : msgPart.type === "text" ? (
                              <div className="text-sm text-gray-900 dark:text-gray-100 mb-2">
                                <MessageContent content={msgPart.text} isAssistant={true} />
                              </div>
                            ) : msgPart.type === "toolCall" ? (
                              <>
                                {(() => {
                                  const hasConfirmation =
                                    confirmationRequests.has(
                                      msgPart.toolCall.id
                                    );
                                  const confirmationRequest =
                                    confirmationRequests.get(
                                      msgPart.toolCall.id
                                    );

                                  const finalConfirmationRequest =
                                    confirmationRequest
                                      ? confirmationRequest
                                      : undefined;

                                  return (
                                    <ToolCallDisplay
                                      key={`${
                                        msgPart.toolCall.id
                                      }-${hasConfirmation}-${Date.now()}`}
                                      toolCall={msgPart.toolCall}
                                      hasConfirmationRequest={hasConfirmation}
                                      confirmationRequest={
                                        finalConfirmationRequest
                                      }
                                      confirmationRequests={
                                        confirmationRequests
                                      }
                                      onConfirm={handleConfirmToolCall}
                                    />
                                  );
                                })()}
                              </>
                            ) : null}
                          </React.Fragment>
                        ));
                      })()}
                    </>

                    {/* Info button for raw JSON */}
                    <div className="mt-2 flex justify-start gap-1">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Info className="h-3 w-3 mr-1" />
                            {t("dashboard.rawJsonButton")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {t("dashboard.rawJsonTitle")}
                            </DialogTitle>
                            <DialogDescription className="sr-only">
                              Raw JSON content of the message
                            </DialogDescription>
                          </DialogHeader>
                          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                            <pre className="text-xs whitespace-pre-wrap break-all font-mono">
                              {JSON.stringify(message, null, 2)}
                            </pre>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {message.sender === "assistant" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                          disabled={exportingMessageId === message.id}
                          onClick={() => handleExportMd(message)}
                        >
                          {exportingMessageId === message.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          {t("dashboard.exportMdButton")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Generating indicator as separate assistant message */}
              {currentConversation.isStreaming &&
                currentConversation.messages.length > 0 &&
                currentConversation.messages[
                  currentConversation.messages.length - 1
                ].sender === "user" && (
                  <div className="w-full">
                    {/* Header with logo */}
                    <div className="flex items-center gap-2 mb-4">
                      <div>
                        <SmartLogo />
                      </div>
                    </div>

                    {/* Generating indicator */}
                    <div className="text-gray-400 text-xs flex items-center gap-2">
                      <span className="animate-pulse">●</span>
                      <span>{t("dashboard.generating")}</span>
                    </div>
                  </div>
                )}
            </div>
          </div>
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <div className="flex flex-row items-center mb-4 gap-2">
            <SmartLogoCenter />
            <DesktopText size="large" />
          </div>

          <p className="text-muted-foreground mb-6">{backendText.tagline}</p>

          <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className={`cursor-pointer transition-colors hover:bg-accent w-full ${isStartingDirectChat ? "opacity-60 pointer-events-none" : ""}`}
              onClick={handleStartDirectChat}
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="shrink-0 h-6 w-6 flex items-center justify-center">
                  {isStartingDirectChat ? (
                    <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                  ) : (
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="text-left">
                  <CardTitle className="text-base">
                    {t("dashboard.directChatCard.title", "直接对话")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "dashboard.directChatCard.description",
                      "使用临时文件夹作为工作区，直接开始一次新的对话。"
                    )}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
            <Card
              className="cursor-pointer transition-colors hover:bg-accent w-full"
              onClick={() => navigate("/projects")}
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="shrink-0 h-6 w-6 flex items-center justify-center">
                  <FolderKanban className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <CardTitle className="text-base">
                    {t("dashboard.projectsCard.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("dashboard.projectsCard.description")}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl mt-4">
            <Card
              className="cursor-pointer transition-colors hover:bg-accent w-full"
              onClick={() => navigate("/mcp")}
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="shrink-0 h-6 w-6 flex items-center justify-center">
                  <ModelContextProtocol className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <CardTitle className="text-base">
                    {t("dashboard.mcpCard.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("dashboard.mcpCard.description")}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="cursor-pointer transition-colors hover:bg-accent w-full"
              onClick={() => navigate("/skills")}
            >
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="shrink-0 h-6 w-6 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <CardTitle className="text-base">
                    {t("dashboard.skillsCard.title", "Skills 管理")}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      "dashboard.skillsCard.description",
                      "抽取全局与各项目 Skills，一键导入到项目。"
                    )}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          <div className="w-full max-w-3xl mt-3 flex justify-center">
            <Button
              variant="secondary"
              className="w-full max-w-xl h-12 flex items-center justify-center gap-2"
              onClick={startQwenInstallFlow}
            >
              <Download className="h-4 w-4" />
              {t("dashboard.installQwen", "自动安装 Qwen")}
            </Button>
          </div>

          <div className="w-full max-w-3xl mt-3 flex justify-center">
            <Button
              variant="secondary"
              className="w-full max-w-xl h-12 flex items-center justify-center gap-2"
              onClick={startPythonInstallFlow}
            >
              <Download className="h-4 w-4" />
              {t("dashboard.installPython", "自动安装 Python")}
            </Button>
          </div>

          <Dialog open={qwenDialogOpen} onOpenChange={setQwenDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("qwenInstall.title", "安装 Qwen Code")}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t("qwenInstall.description", "自动安装 Qwen Code 并展示后续配置步骤")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="text-3xl font-semibold tracking-tight flex items-center gap-3">
                    {qwenStatus === "installing" || qwenStatus === "checking" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : null}
                    {qwenStatus === "installed"
                      ? t("qwenInstall.installed", "已安装")
                      : qwenStatus === "installing"
                        ? t("qwenInstall.installing", "正在安装…")
                        : qwenStatus === "checking"
                          ? t("qwenInstall.checking", "检查中…")
                          : qwenStatus === "failed"
                            ? t("qwenInstall.failed", "安装失败")
                            : t("qwenInstall.idle", "准备安装")}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {qwenStatus === "failed"
                      ? t(
                          "qwenInstall.failedHint",
                          "若安装失败，请以管理员身份运行后再重试，或重启终端后再检查。"
                        )
                      : t(
                          "qwenInstall.runningHint",
                          "安装完成后建议重启终端，以确保环境变量生效。"
                        )}
                  </div>
                  {qwenOutput ? (
                    <pre className="mt-3 text-xs whitespace-pre-wrap break-all bg-muted/50 rounded-md p-3 max-h-40 overflow-auto">
                      {qwenOutput}
                    </pre>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      onClick={startQwenInstallFlow}
                      disabled={qwenStatus === "installing" || qwenStatus === "checking"}
                    >
                      {t("qwenInstall.retry", "重新检查/安装")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="text-lg font-semibold">
                    {t("qwenInstall.nextStep", "第二步：Key 获取与配置")}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div>
                      {t("qwenInstall.docsLabel", "文档：")}{" "}
                      <a
                        href="https://qwenlm.github.io/qwen-code-docs/zh/users/overview/"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        https://qwenlm.github.io/qwen-code-docs/zh/users/overview/
                      </a>
                    </div>
                    <div>
                      {t("qwenInstall.keyLabel", "Key 获取（可选）：")}{" "}
                      <a
                        href="https://dashscope.console.aliyun.com/apiKey"
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        https://dashscope.console.aliyun.com/apiKey
                      </a>
                    </div>
                    <div className="space-y-1">
                      <div className="font-medium text-foreground">
                        {t("qwenInstall.configTitle", "配置说明")}
                      </div>
                      <div>
                        {t(
                          "qwenInstall.configLine1",
                          "1) 重启终端后进入项目目录，运行 qwen"
                        )}
                      </div>
                      <div>
                        {t(
                          "qwenInstall.configLine2",
                          "2) 选择 Qwen OAuth (Free) 登录（推荐），按提示完成授权"
                        )}
                      </div>
                      <div>
                        {t(
                          "qwenInstall.configLine3",
                          "3) 配置文件通常在 ~/.qwen/settings.json（本应用的 MCP/设置也会读取它）"
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={pythonDialogOpen} onOpenChange={setPythonDialogOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t("pythonInstall.title", "安装 Python")}</DialogTitle>
                <DialogDescription className="sr-only">
                  {t("pythonInstall.description", "自动安装 Python 并展示后续说明")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border p-4">
                  <div className="text-3xl font-semibold tracking-tight flex items-center gap-3">
                    {pythonStatus === "installing" ||
                    pythonStatus === "checking" ||
                    pythonStatus === "downloading" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : null}
                    {pythonStatus === "installed"
                      ? t("pythonInstall.installed", "已安装")
                      : pythonStatus === "downloading"
                        ? t("pythonInstall.downloading", "正在下载…")
                        : pythonStatus === "installing"
                          ? t("pythonInstall.installing", "正在安装…")
                          : pythonStatus === "checking"
                            ? t("pythonInstall.checking", "检查中…")
                            : pythonStatus === "failed"
                              ? t("pythonInstall.failed", "安装失败")
                              : t("pythonInstall.idle", "准备安装")}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {pythonStatus === "failed"
                      ? t(
                          "pythonInstall.failedHint",
                          "若安装失败，请确认系统已安装 winget（Windows 应用安装程序），并以管理员身份运行后再重试。"
                        )
                      : t(
                          "pythonInstall.runningHint",
                          "安装完成后建议重启终端，以确保 python 命令可用。"
                        )}
                  </div>
                  {pythonOutput ? (
                    <pre className="mt-3 text-xs whitespace-pre-wrap break-all bg-muted/50 rounded-md p-3 max-h-40 overflow-auto">
                      {pythonOutput}
                    </pre>
                  ) : null}
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="outline"
                      onClick={startPythonInstallFlow}
                      disabled={
                        pythonStatus === "installing" ||
                        pythonStatus === "checking" ||
                        pythonStatus === "downloading"
                      }
                    >
                      {t("pythonInstall.retry", "重新检查/安装")}
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <div className="text-lg font-semibold">
                    {t("pythonInstall.howItWorks", "安装方式")}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div>
                      {t(
                        "pythonInstall.method",
                        "通过命令行调用 winget 安装 Python（等价于在终端执行安装命令）。"
                      )}
                    </div>
                    <div className="font-mono text-xs break-all bg-muted/50 rounded-md p-3">
                      winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
                    </div>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Settings link moved to sidebar footer */}
        </div>
      )}
    </>
  );
};
