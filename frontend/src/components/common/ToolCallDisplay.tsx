import React, { useRef, useState } from "react";
import { Check, CheckCheck, X, Loader2, Terminal } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Label } from "../ui/label";
import type {
  ToolCall,
  ToolCallConfirmationRequest,
} from "../../utils/toolCallParser";
import type { McpPermissionRequest } from "../../types";
import { ToolResultRenderer } from "./ToolResultRenderer";
import { ToolInputParser } from "../../utils/toolInputParser";
import { useTranslation } from "react-i18next";
import { McpPermissionCompact } from "../mcp/McpPermissionCompact";

interface ToolCallDisplayProps {
  toolCall: ToolCall;
  onConfirm?: (
    toolCallId: string,
    outcome: string,
    extra?: { answers?: Record<string, unknown> }
  ) => Promise<void>;
  hasConfirmationRequest?: boolean;
  confirmationRequest?: ToolCallConfirmationRequest | undefined;
  confirmationRequests?: Map<string, ToolCallConfirmationRequest>;
  mcpPermissionRequest?: McpPermissionRequest;
}

function ToolCallDisplayComponent({
  toolCall,
  onConfirm,
  hasConfirmationRequest,
  confirmationRequest,
  confirmationRequests,
  mcpPermissionRequest,
}: ToolCallDisplayProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionnaireErrors, setQuestionnaireErrors] = useState<
    Record<string, string>
  >({});
  const questionnaireDraftTimerRef = useRef<number | null>(null);

  const handleConfirm = async (
    toolCallId: string,
    outcome: string,
    extra?: { answers?: Record<string, unknown> }
  ) => {
    if (isSubmitting || !onConfirm) return;
    setIsSubmitting(true);
    try {
      await onConfirm(toolCallId, outcome, extra);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Try to get confirmation request from the Map as a fallback
  const actualConfirmationRequest =
    confirmationRequest ||
    (confirmationRequests ? confirmationRequests.get(toolCall.id) : undefined);

  // If we have a confirmation request, merge it into the tool call data
  const enhancedToolCall: ToolCall = {
    ...toolCall,
    confirmationRequest:
      actualConfirmationRequest || toolCall.confirmationRequest,
  };

  const questionnaire = enhancedToolCall.confirmationRequest?.questionnaire;
  const isQuestionnaire =
    enhancedToolCall.confirmationRequest?.confirmation?.type ===
      "questionnaire" && !!questionnaire;
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<
    Record<string, unknown>
  >(() => questionnaire?.draftAnswers || {});

  const scheduleQuestionnaireDraftSave = (answers: Record<string, unknown>) => {
    if (!onConfirm) return;
    if (questionnaireDraftTimerRef.current) {
      window.clearTimeout(questionnaireDraftTimerRef.current);
    }
    questionnaireDraftTimerRef.current = window.setTimeout(() => {
      onConfirm(enhancedToolCall.id, "questionnaire_draft", { answers }).catch(
        () => {}
      );
    }, 400);
  };

  const updateQuestionnaireAnswer = (
    questionId: string,
    value: unknown
  ): void => {
    setQuestionnaireErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setQuestionnaireAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      scheduleQuestionnaireDraftSave(next);
      return next;
    });
  };

  const validateQuestionnaire = (): boolean => {
    if (!questionnaire) return true;
    const errors: Record<string, string> = {};
    for (const q of questionnaire.questions || []) {
      if (!q.required) continue;
      const v = questionnaireAnswers[q.id];
      if (q.type === "multi") {
        if (!Array.isArray(v) || v.length === 0) {
          errors[q.id] = "必填";
        }
        continue;
      }
      if (typeof v !== "string" || v.trim() === "") {
        errors[q.id] = "必填";
      }
    }
    setQuestionnaireErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Convert snake_case to PascalCase
  const formatToolName = (name: string): string => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("");
  };

  const isUserRejected = (toolCall: ToolCall): boolean => {
    // Check the permanent rejection flag first
    if (toolCall.isUserRejected) {
      return true;
    }

    // Fallback to checking the result markdown
    return !!(
      toolCall.status === "failed" &&
      toolCall.result &&
      typeof toolCall.result === "object" &&
      toolCall.result.markdown === t("toolCalls.userRejected")
    );
  };

  const getErrorSummary = (toolCall: ToolCall): string => {
    if (!toolCall.result) return t("toolCalls.failedToExecute");

    const result = toolCall.result;

    // If result is a string
    if (typeof result === "string") {
      const firstLine = result.trim().split("\n")[0];
      return firstLine.length > 60
        ? firstLine.substring(0, 60) + "..."
        : firstLine;
    }

    // If result has markdown field (like in the error example)
    if (result.markdown) {
      const error = result.markdown.trim();
      // Return first line of error, truncated if needed
      const firstLine = error.split("\n")[0];
      return firstLine.length > 60
        ? firstLine.substring(0, 60) + "..."
        : firstLine;
    }

    // If result has error field
    if (result.error) {
      return result.error.length > 60
        ? result.error.substring(0, 60) + "..."
        : result.error;
    }

    // Handle JSON-RPC error format from outputJsonRpc
    try {
      if (toolCall.outputJsonRpc) {
        const output = JSON.parse(toolCall.outputJsonRpc);
        if (output.error?.data?.details) {
          const errorMsg = output.error.data.details;
          return errorMsg.length > 60
            ? errorMsg.substring(0, 60) + "..."
            : errorMsg;
        }
        if (output.error?.message) {
          return output.error.message;
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }

    return t("toolCalls.commandFailed");
  };

  const getRunningDescription = (toolCall: ToolCall): React.ReactNode => {
    const parsedInput = ToolInputParser.parseToolInput(toolCall);

    // If we have formatted description data, render it with proper styling
    if (parsedInput.formattedDescription) {
      return (
        <>
          {parsedInput.formattedDescription.parts.map((part, index) => (
            <span
              key={index}
              className={part.isHighlighted ? "text-muted-foreground" : ""}
            >
              {part.text}
            </span>
          ))}
        </>
      );
    }

    // Fallback to plain description
    return parsedInput.description;
  };

  // Configuration for tool loading states - easily extensible
  // To add a new tool with custom loading state:
  // 1. Add an entry to this config object with the tool name as key
  // 2. Specify custom icon, message, and whether it's a special tool (affects transition icon)
  // 3. Optionally add detectors for additional matching logic beyond tool name
  // 4. For tools that need custom completed state rendering, add them to ToolResultRenderer
  const toolLoadingConfig = {
    google_web_search: {
      icon: <Loader2 className="animate-spin h-3 w-3" />,
      message: t("toolCalls.googling"),
      isSpecialTool: true,
      detectors: [
        (toolCall: ToolCall) =>
          toolCall.label?.toLowerCase().includes("searching the web"),
      ],
    },
    web_fetch: {
      icon: <Loader2 className="animate-spin h-3 w-3" />,
      message: t("toolCalls.fetching"),
      isSpecialTool: true,
      detectors: [
        (toolCall: ToolCall) =>
          toolCall.label?.toLowerCase().includes("processing urls"),
      ],
    },
    // Example of how to add more tools:
    // glob: {
    //   icon: <Loader2 className="animate-spin h-3 w-3" />,
    //   message: t('toolCalls.searchingFiles'),
    //   isSpecialTool: true,
    //   detectors: [(toolCall: ToolCall) => toolCall.label?.toLowerCase().includes("globbed")]
    // }
  };

  // Extract URL information for WebFetch pending state
  const getWebFetchPendingInfo = (toolCall: ToolCall) => {
    if (toolCall.name !== "web_fetch") return null;

    // First try to extract from ACP confirmation request title
    if (toolCall.confirmationRequest?.label) {
      const title = toolCall.confirmationRequest.label;

      // Look for URLs in the title like: "Processing URLs and instructions from prompt: \"Fetch the title of https://www.google.com/\""
      const urlMatches = title.match(/https?:\/\/[^\s"']+/g);
      if (urlMatches && urlMatches.length > 0) {
        return {
          url: urlMatches[0],
          count: urlMatches.length,
        };
      }

      // Look for generic patterns like "Processing URLs"
      if (title.toLowerCase().includes("processing urls")) {
        const urlCountMatch = title.match(/(\d+)\s*urls?/i);
        if (urlCountMatch) {
          return {
            url: `${urlCountMatch[1]} URLs`,
            count: parseInt(urlCountMatch[1]),
          };
        }
        return {
          url: "URLs from prompt",
          count: 1,
        };
      }
    }

    // Fallback to extracting from parameters
    try {
      let params: Record<string, unknown> = {};

      // Try to get parameters from inputJsonRpc first
      if (toolCall.inputJsonRpc) {
        const input = JSON.parse(toolCall.inputJsonRpc);
        params = input.params || {};
      } else {
        // Fallback to toolCall.parameters
        params = toolCall.parameters || {};
      }

      const url = params.url;
      if (url && typeof url === "string") {
        return {
          url: url,
          count: 1,
        };
      }

      // Handle multiple URLs if they're in an array
      if (Array.isArray(url)) {
        return {
          url: url[0] || "content",
          count: url.length,
        };
      }

      return {
        url: "content",
        count: 1,
      };
    } catch {
      return {
        url: "content",
        count: 1,
      };
    }
  };

  const getLoadingState = (toolCall: ToolCall) => {
    // Check configured tools first
    for (const [toolName, config] of Object.entries(toolLoadingConfig)) {
      if (
        toolCall.name === toolName ||
        config.detectors?.some((detector) => detector(toolCall))
      ) {
        return {
          icon: config.icon,
          message: config.message,
          isWebTool: config.isSpecialTool,
        };
      }
    }

    // Default loading state for other tools
    return {
      icon: (
        <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full"></div>
      ),
      message: t("toolCalls.executing"),
      isWebTool: false,
    };
  };

  // Prefer a terminal glyph for command-style tools so the user can spot them quickly
  const getRunningIcon = (toolCall: ToolCall) => {
    if (
      toolCall.name === "run_shell_command" ||
      toolCall.name === "execute_command" ||
      toolCall.label?.toLowerCase()?.includes("running command")
    ) {
      return <Terminal className="h-4 w-4 text-muted-foreground" />;
    }

    const loadingState = getLoadingState(toolCall);
    return loadingState.icon;
  };

  // Helper function to detect MCP tool calls
  const isMcpToolCall = (): boolean => {
    // Check if we have an explicit MCP permission request
    if (mcpPermissionRequest) {
      return true;
    }

    // Check if the title contains "MCP Server" pattern
    if (actualConfirmationRequest?.label?.includes("MCP Server")) {
      return true;
    }

    return false;
  };

  // Convert legacy confirmation request to MCP permission request format
  const getMcpPermissionRequest = (
    toolCall: ToolCall
  ): McpPermissionRequest | null => {
    if (mcpPermissionRequest) {
      return mcpPermissionRequest;
    }

    if (!isMcpToolCall()) {
      return null;
    }

    const confirmReq = actualConfirmationRequest;

    // Use serverName and toolName if available from tool call
    let toolName = (toolCall.parameters?.toolName as string) || "Unknown Tool";
    let serverName =
      (toolCall.parameters?.serverName as string) || "MCP Server";

    // Fallback to parsing from label if not provided
    if (
      !toolCall.parameters?.serverName &&
      !toolCall.parameters?.toolName &&
      confirmReq?.label
    ) {
      const serverMatch = confirmReq.label.match(/\((.+?) MCP Server\)$/);
      const nameMatch = confirmReq.label.match(/^([^(]+)/);
      if (serverMatch) {
        serverName = serverMatch[1];
      }
      if (nameMatch) {
        toolName = nameMatch[1].trim();
      }
    }

    const title = confirmReq?.label || `${toolName} (${serverName} MCP Server)`;

    // Create MCP permission request
    return {
      sessionId: confirmReq?.sessionId || "",
      options: confirmReq?.options || [
        { optionId: "proceed_once", name: "Allow", kind: "allow_once" },
        { optionId: "cancel", name: "Reject", kind: "reject_once" },
      ],
      toolCall: {
        toolCallId: toolCall.id,
        status: toolCall.status || "pending",
        title: title,
        content: [],
        locations: confirmReq?.locations || [],
        kind: "other",
        serverName: serverName !== "MCP Server" ? serverName : undefined,
        toolName: toolName !== "Unknown Tool" ? toolName : undefined,
      },
    };
  };

  return (
    <div className="my-4 w-full">
      {/* Pending State */}
      {enhancedToolCall.status === "pending" && (
        <>
          {/* MCP Tool Call Permission Compact */}
          {(() => {
            const mcpRequest = getMcpPermissionRequest(enhancedToolCall);
            if (mcpRequest && hasConfirmationRequest && onConfirm) {
              return (
                <McpPermissionCompact
                  request={mcpRequest}
                  onPermissionResponse={(optionId) =>
                    handleConfirm(enhancedToolCall.id, optionId)
                  }
                  isSubmitting={isSubmitting}
                />
              );
            }
            return null;
          })()}

          {isQuestionnaire && questionnaire && (
            <div className="mt-4 border rounded-lg p-3 bg-muted/20">
              <div className="text-sm font-medium">{questionnaire.title}</div>
              <div className="mt-3 space-y-4">
                {questionnaire.questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="text-sm">{q.label}</div>
                      {q.required && (
                        <div className="text-xs text-red-500">*</div>
                      )}
                    </div>
                    {q.type === "single" && (
                      <RadioGroup
                        value={
                          typeof questionnaireAnswers[q.id] === "string"
                            ? (questionnaireAnswers[q.id] as string)
                            : ""
                        }
                        onValueChange={(v) => updateQuestionnaireAnswer(q.id, v)}
                        className="space-y-2"
                      >
                        {q.options.map((opt) => (
                          <div
                            key={opt.id}
                            className="flex items-center gap-2"
                          >
                            <RadioGroupItem value={opt.id} id={`${q.id}-${opt.id}`} />
                            <Label htmlFor={`${q.id}-${opt.id}`} className="text-sm">
                              {opt.label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    )}
                    {q.type === "multi" && (
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const arr = Array.isArray(questionnaireAnswers[q.id])
                            ? (questionnaireAnswers[q.id] as string[])
                            : [];
                          const checked = arr.includes(opt.id);
                          return (
                            <div
                              key={opt.id}
                              className="flex items-center gap-2"
                            >
                              <Checkbox
                                id={`${q.id}-${opt.id}`}
                                checked={checked}
                                onCheckedChange={(c) => {
                                  const next = c
                                    ? [...arr, opt.id]
                                    : arr.filter((x) => x !== opt.id);
                                  updateQuestionnaireAnswer(q.id, next);
                                }}
                              />
                              <Label
                                htmlFor={`${q.id}-${opt.id}`}
                                className="text-sm"
                              >
                                {opt.label}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "text" &&
                      (q.multiline ? (
                        <Textarea
                          value={
                            typeof questionnaireAnswers[q.id] === "string"
                              ? (questionnaireAnswers[q.id] as string)
                              : ""
                          }
                          placeholder={q.placeholder}
                          onChange={(e) =>
                            updateQuestionnaireAnswer(q.id, e.target.value)
                          }
                        />
                      ) : (
                        <Input
                          value={
                            typeof questionnaireAnswers[q.id] === "string"
                              ? (questionnaireAnswers[q.id] as string)
                              : ""
                          }
                          placeholder={q.placeholder}
                          onChange={(e) =>
                            updateQuestionnaireAnswer(q.id, e.target.value)
                          }
                        />
                      ))}
                    {questionnaireErrors[q.id] && (
                      <div className="text-xs text-red-500">
                        {questionnaireErrors[q.id]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!validateQuestionnaire()) return;
                    handleConfirm(enhancedToolCall.id, "questionnaire_submit", {
                      answers: questionnaireAnswers,
                    });
                  }}
                  disabled={isSubmitting || !hasConfirmationRequest || !onConfirm}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "提交"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* For edit tools, show the specialized edit renderer */}
          {!isMcpToolCall() &&
            /* For edit tools, show the specialized edit renderer */
            (enhancedToolCall.name.toLowerCase().includes("edit") ||
            enhancedToolCall.name === "replace" ||
            enhancedToolCall.name === "write_file" ||
            enhancedToolCall.confirmationRequest?.confirmation?.type ===
              "edit" ? (
              <ToolResultRenderer
                toolCall={enhancedToolCall}
                onConfirm={handleConfirm}
                hasConfirmationRequest={hasConfirmationRequest}
                isSubmitting={isSubmitting}
              />
            ) : enhancedToolCall.confirmationRequest?.confirmation?.type ===
                "command" ||
              enhancedToolCall.name === "run_shell_command" ||
              enhancedToolCall.name === "execute_command" ? (
              // Command-specific confirmation UI
              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-muted/50 rounded-lg transition-colors">
                  <Terminal className="h-4 w-4 text-amber-500" />
                  <span>
                    {t("toolCalls.pendingApproval")}{" "}
                    <span className="text-muted-foreground font-mono">
                      {enhancedToolCall.label?.match(/^(\S+)/)?.[1] ||
                        "command"}
                    </span>
                  </span>

                  {/* Compact approval buttons */}
                  {hasConfirmationRequest && onConfirm && (
                    <div className="ml-auto flex items-center gap-1">
                      {enhancedToolCall.confirmationRequest?.options &&
                      enhancedToolCall.confirmationRequest.options.length >
                        0 ? (
                        // Use ACP permission options if available
                        (() => {
                          const allowOnceOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind === "allow_once"
                            );
                          const allowAlwaysOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind === "allow_always"
                            );
                          const rejectOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind.includes("reject")
                            );

                          return (
                            <>
                              {/* Allow Always button (blue double check) */}
                              {allowAlwaysOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:bg-opacity-20 border border-blue-500 dark:border-blue-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCheck className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}

                              {/* Allow Once button (blue single check) */}
                              {allowOnceOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:bg-opacity-20 border border-blue-500 dark:border-blue-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}

                              {/* Reject button (red) */}
                              {rejectOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-red-500 dark:text-red-400 hover:bg-red-500 hover:bg-opacity-20 border border-red-500 dark:border-red-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}
                            </>
                          );
                        })()
                      ) : (
                        // Fallback to default buttons
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 w-6 bg-green-600 hover:bg-green-600 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirm(enhancedToolCall.id, "proceed_once");
                            }}
                            title={t("toolCalls.allow")}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirm(enhancedToolCall.id, "cancel");
                            }}
                            title={t("toolCalls.reject")}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : enhancedToolCall.name === "web_fetch" ? (
              // Compact WebFetch pending state (like grep/glob style)
              <div className="mt-4">
                <div className="flex items-center gap-2 text-sm px-2 py-1 hover:bg-muted/50 rounded-lg transition-colors">
                  <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                  <span>
                    {t("toolCalls.fetching")}{" "}
                    <span className="text-muted-foreground">
                      {(() => {
                        const webFetchInfo =
                          getWebFetchPendingInfo(enhancedToolCall);
                        return webFetchInfo?.count === 1
                          ? webFetchInfo.url
                          : t("toolCalls.fetchingUrls", {
                              count: webFetchInfo?.count || 1,
                            });
                      })()}
                    </span>
                  </span>

                  {/* Compact approval buttons */}
                  {hasConfirmationRequest && onConfirm && (
                    <div className="ml-auto flex items-center gap-1">
                      {enhancedToolCall.confirmationRequest?.options &&
                      enhancedToolCall.confirmationRequest.options.length >
                        0 ? (
                        // Use ACP permission options if available - group allow vs reject
                        (() => {
                          const allowOnceOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind === "allow_once"
                            );
                          const allowAlwaysOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind === "allow_always"
                            );
                          const rejectOptions =
                            enhancedToolCall.confirmationRequest.options.filter(
                              (opt) => opt.kind.includes("reject")
                            );

                          return (
                            <>
                              {/* Allow Always button (blue double check) */}
                              {allowAlwaysOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:bg-opacity-20 border border-blue-500 dark:border-blue-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCheck className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}

                              {/* Allow Once button (blue single check) */}
                              {allowOnceOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-blue-500 dark:text-blue-400 hover:bg-blue-500 hover:bg-opacity-20 border border-blue-500 dark:border-blue-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Check className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}

                              {/* Reject button (red) */}
                              {rejectOptions.slice(0, 1).map((option) => (
                                <Button
                                  key={option.optionId}
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-red-500 dark:text-red-400 hover:bg-red-500 hover:bg-opacity-20 border border-red-500 dark:border-red-400"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirm(
                                      enhancedToolCall.id,
                                      option.optionId
                                    );
                                  }}
                                  title={option.name}
                                  disabled={isSubmitting}
                                >
                                  {isSubmitting ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <X className="h-3 w-3" />
                                  )}
                                </Button>
                              ))}
                            </>
                          );
                        })()
                      ) : (
                        // Fallback to default buttons
                        <>
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 w-6 bg-green-600 hover:bg-green-600 text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirm(enhancedToolCall.id, "proceed_once");
                            }}
                            title={t("toolCalls.allow")}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConfirm(enhancedToolCall.id, "cancel");
                            }}
                            title={t("toolCalls.reject")}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Default pending state for other tools
              <div className="bg-muted/50 border border-border rounded-lg p-4">
                <div className="mb-3">
                  <span className="font-medium text-base text-black dark:text-white font-mono">
                    {formatToolName(enhancedToolCall.name)}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {t("toolCalls.pendingApproval")}
                  </span>
                </div>

                {/* Approval Buttons - Show when there's a confirmation request */}
                {hasConfirmationRequest && onConfirm && (
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-sm text-foreground">
                      {t("toolCalls.approve")}
                    </span>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 text-xs"
                      onClick={() =>
                        handleConfirm(enhancedToolCall.id, "proceed_once")
                      }
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3 mr-1" />
                      )}
                      {t("common.yes")}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="px-3 py-1 text-xs"
                      onClick={() => handleConfirm(enhancedToolCall.id, "cancel")}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <X className="h-3 w-3 mr-1" />
                      )}
                      {t("common.no")}
                    </Button>
                  </div>
                )}

                {/* Show waiting indicator only when no confirmation request */}
                {!hasConfirmationRequest && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                    <span className="animate-pulse">●</span>
                    {t("toolCalls.waitingForApproval")}
                  </div>
                )}

                {/* Input JSON-RPC */}
                {enhancedToolCall.inputJsonRpc && (
                  <div className="mt-4">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      {t("toolCalls.input")}
                    </div>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                      <code>{enhancedToolCall.inputJsonRpc}</code>
                    </pre>
                  </div>
                )}
              </div>
            ))}
        </>
      )}

      {/* Running State */}
      {enhancedToolCall.status === "running" && (
        <>
          {/* For edit tools and web tools, show the specialized renderer */}
          {enhancedToolCall.name.toLowerCase().includes("edit") ||
          enhancedToolCall.name === "replace" ||
          enhancedToolCall.name === "write_file" ||
          enhancedToolCall.name === "google_web_search" ||
          enhancedToolCall.name === "web_fetch" ||
          enhancedToolCall.confirmationRequest?.confirmation?.type ===
            "edit" ? (
            <ToolResultRenderer
              toolCall={enhancedToolCall}
              onConfirm={handleConfirm}
              hasConfirmationRequest={hasConfirmationRequest}
              isSubmitting={isSubmitting}
            />
          ) : (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="mb-3">
                <span className="font-medium text-base text-black dark:text-white font-mono">
                  {formatToolName(enhancedToolCall.name)}
                </span>
                <span className="text-sm text-muted-foreground ml-2">
                  {getRunningDescription(enhancedToolCall)}
                </span>
              </div>

              {/* Running indicator */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {getRunningIcon(enhancedToolCall)}
                <span>{getLoadingState(enhancedToolCall).message}</span>
              </div>

              {/* Input JSON-RPC */}
              {enhancedToolCall.inputJsonRpc && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    {t("toolCalls.input")}
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                    <code>{enhancedToolCall.inputJsonRpc}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Failed State */}
      {enhancedToolCall.status === "failed" && (
        <>
          {/* For edit tools and web fetch, show specialized renderers */}
          {enhancedToolCall.name.toLowerCase().includes("edit") ||
          enhancedToolCall.name === "replace" ||
          enhancedToolCall.name === "write_file" ? (
            <ToolResultRenderer
              toolCall={enhancedToolCall}
              onConfirm={handleConfirm}
              hasConfirmationRequest={hasConfirmationRequest}
              isSubmitting={isSubmitting}
            />
          ) : enhancedToolCall.name === "web_fetch" ? (
            // Compact WebFetch error state (like grep/glob style)
            <div className="mt-4">
              <div className="flex items-center gap-2 text-sm px-2 py-1 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
                <X className="h-4 w-4 text-red-500" />
                <span>
                  {isUserRejected(enhancedToolCall)
                    ? t("toolCalls.rejectedFetch")
                    : t("toolCalls.failedToFetch")}{" "}
                  <span className="text-muted-foreground">
                    {(() => {
                      const webFetchInfo =
                        getWebFetchPendingInfo(enhancedToolCall);
                      return webFetchInfo?.count === 1
                        ? webFetchInfo.url
                        : t("toolCalls.fetchingUrls", {
                            count: webFetchInfo?.count || 1,
                          });
                    })()}
                  </span>
                </span>
                {!isUserRejected(enhancedToolCall) && (
                  <span className="ml-auto text-xs text-red-600 dark:text-red-400">
                    {getErrorSummary(enhancedToolCall)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
              <div className="font-medium text-sm text-black dark:text-white mb-1 font-mono">
                {formatToolName(enhancedToolCall.name)}
              </div>
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                <X className="size-3" />
                {isUserRejected(enhancedToolCall)
                  ? t("toolCalls.rejected")
                  : getErrorSummary(enhancedToolCall)}
              </div>

              {/* Input JSON-RPC */}
              {enhancedToolCall.inputJsonRpc && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    {t("toolCalls.input")}
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                    <code>{enhancedToolCall.inputJsonRpc}</code>
                  </pre>
                </div>
              )}

              {/* Output JSON-RPC */}
              {enhancedToolCall.outputJsonRpc && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground mb-2">
                    {t("toolCalls.output")}
                  </div>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                    <code>{enhancedToolCall.outputJsonRpc}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Completed State */}
      {enhancedToolCall.status === "completed" && (
        <div className="space-y-4">
          {/* Enhanced Tool Result Renderer - replaces generic card for built-in tools */}
          <ToolResultRenderer
            toolCall={enhancedToolCall}
            onConfirm={handleConfirm}
            hasConfirmationRequest={hasConfirmationRequest}
            isSubmitting={isSubmitting}
          />

          {/* Input JSON-RPC */}
          {enhancedToolCall.inputJsonRpc && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                {t("toolCalls.input")}
              </div>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                <code>{enhancedToolCall.inputJsonRpc}</code>
              </pre>
            </div>
          )}

          {/* Output JSON-RPC */}
          {enhancedToolCall.outputJsonRpc && (
            <div className="mt-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                {t("toolCalls.output")}
              </div>
              <pre className="bg-muted p-3 rounded text-xs overflow-x-auto border">
                <code>{enhancedToolCall.outputJsonRpc}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const ToolCallDisplay = React.memo(ToolCallDisplayComponent);
