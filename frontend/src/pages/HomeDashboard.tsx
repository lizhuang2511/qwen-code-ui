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
import { Info, UserRound, FolderKanban, FileText } from "lucide-react";
import { ModelContextProtocol } from "../components/common/ModelContextProtocol";
import { getBackendText } from "../utils/backendText";
import { useBackend } from "../contexts/BackendContext";
import { GeminiMessagePart } from "../types";

export const HomeDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    currentConversation,
    messagesContainerRef,
    handleConfirmToolCall,
    confirmationRequests,
  } = useConversation();

  // Debug logging for currentConversation
  console.log("🏠 HomeDashboard - currentConversation:", currentConversation);

  const { selectedBackend } = useBackend();
  const backendText = getBackendText(selectedBackend);

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
                    <div className="mt-2 flex justify-start">
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

          {/* Dashboard tiles */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
            {/* Projects Card */}
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
          </div>

          {/* Settings link moved to sidebar footer */}
        </div>
      )}
    </>
  );
};
