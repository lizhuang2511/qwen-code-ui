import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { MentionInput, MentionInputRef } from "../common/MentionInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Send,
  Info,
  Play,
  Loader2,
  X,
  Paperclip,
  FileText,
  MessageCircle,
} from "lucide-react";
import { useBackend } from "../../contexts/BackendContext";
import { getBackendText } from "../../utils/backendText";
import { CliIO } from "../../types";

import { useMessageTimer } from "../../hooks/useMessageTimer";
import { useWittyLoadingPhrase } from "../../hooks/useWittyLoadingPhrase";
import commonPhrases from "../../assets/commonPhrases.json";

type CommonPhrase = {
  abbr: string;
  content: string;
};

const commonPhrasesList = commonPhrases as CommonPhrase[];

interface MessageInputBarProps {
  input: string;
  images?: { mimeType: string; data: string; name?: string }[];
  setImages?: (images: { mimeType: string; data: string; name?: string }[]) => void;
  isCliInstalled: boolean | null;
  cliIOLogs: CliIO[];
  handleInputChange: (
    _event: React.ChangeEvent<HTMLTextAreaElement> | null,
    newValue: string,
    _newPlainTextValue: string,
    _mentions: unknown[]
  ) => void;
  handleSendMessage: (e: React.FormEvent) => Promise<void>;
  workingDirectory?: string;
  isConversationActive: boolean;
  onContinueConversation: () => void;
  isContinuingConversation: boolean;
  isNew?: boolean;
  isStreaming?: boolean;
  approvalMode?: string;
  setApprovalMode?: (mode: string) => void;
}

export interface MessageInputBarRef {
  insertMention: (mention: string) => void;
  closeDropdown: () => void;
}

export const MessageInputBar = forwardRef<
  MessageInputBarRef,
  MessageInputBarProps
>(
  (
    {
      input,
      images = [],
      setImages,
      isCliInstalled,
      cliIOLogs,
      handleInputChange,
      handleSendMessage,
      workingDirectory = ".",
      isConversationActive,
      onContinueConversation,
      isContinuingConversation,
      isNew,
      isStreaming,
      approvalMode,
      setApprovalMode,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const { selectedBackend } = useBackend();
    const backendText = getBackendText(selectedBackend);
    const mentionInputRef = useRef<MentionInputRef>(null);

    // Use message timer hook to track generation time
    const { formattedDuration, isActive: isTimerActive } = useMessageTimer({
      isGenerating: isStreaming || false,
    });

    // Use witty loading phrase hook for entertaining messages
    const { currentPhrase } = useWittyLoadingPhrase({
      isActive: isTimerActive,
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && setImages) {
        const newImages = Array.from(e.target.files);
        
        newImages.forEach((file) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            if (result) {
              const base64Data = result.split(',')[1];
              setImages([...images, { mimeType: file.type || 'application/octet-stream', data: base64Data, name: file.name }]);
            }
          };
          reader.readAsDataURL(file);
        });
        
        // Clear input so same file can be selected again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    const removeImage = (index: number) => {
      if (setImages) {
        const newImages = [...images];
        newImages.splice(index, 1);
        setImages(newImages);
      }
    };

    // Expose the insertMention method via ref
    useImperativeHandle(
      ref,
      () => ({
        insertMention: (mention: string) => {
          if (mentionInputRef.current) {
            mentionInputRef.current.insertMention(mention);
          }
        },
        closeDropdown: () => {
          if (mentionInputRef.current) {
            mentionInputRef.current.closeDropdown();
          }
        },
      }),
      []
    );

    if (!isConversationActive) {
      if (isNew) {
        return null;
      }
      return (
        <div className="mt-auto border-t bg-white dark:bg-neutral-900 flex items-center p-6">
          <Button
            className="w-full"
            onClick={onContinueConversation}
            disabled={isContinuingConversation}
          >
            {isContinuingConversation ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("messageInput.startingConversation")}
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {t("messageInput.continueConversation")}
              </>
            )}
          </Button>
        </div>
      );
    }

    return (
      <div className="mt-auto border-t bg-white dark:bg-neutral-900 flex items-center">
        <div className="px-6 pb-3 pt-2 w-full">
          {/* Message timer - positioned above input when active */}
          {isTimerActive && (
            <div className="mb-2 text-center">
              <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
                {currentPhrase} {formattedDuration}
              </span>
            </div>
          )}

          {/* File/Image Previews */}
          {images.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {images.map((img, index) => {
                const isImage = img.mimeType.startsWith('image/');
                return (
                  <div key={index} className="relative group shrink-0">
                    {isImage ? (
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt="Uploaded"
                        className="h-16 w-16 object-cover rounded-md border"
                      />
                    ) : (
                      <div className="h-16 w-16 flex flex-col items-center justify-center bg-muted rounded-md border text-muted-foreground p-1">
                        <FileText className="h-6 w-6 mb-1" />
                        <span className="text-[10px] truncate w-full text-center" title={img.name}>
                          {img.name || 'File'}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hidden group-hover:block z-10"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <form
            className="flex gap-2 items-end mt-2"
            onSubmit={handleSendMessage}
          >
            {approvalMode && setApprovalMode && (
              <Select value={approvalMode} onValueChange={setApprovalMode}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="plan">Plan</SelectItem>
                  <SelectItem value="yolo">Yolo</SelectItem>
                  <SelectItem value="auto-edit">Auto-Edit</SelectItem>
                </SelectContent>
              </Select>
            )}
            <div className="flex-1 relative">
              <MentionInput
                ref={mentionInputRef}
                value={input}
                onChange={handleInputChange}
                workingDirectory={workingDirectory}
                placeholder={
                  isCliInstalled === false
                    ? backendText.cliNotFound
                    : t("messageInput.placeholder")
                }
                disabled={isCliInstalled === false}
                className="w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
            </div>
            <Button
              type="submit"
              disabled={isCliInstalled === false || !input.trim()}
              size="icon"
            >
              <Send />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  disabled={isCliInstalled === false}
                  size="icon"
                  variant="outline"
                  title={t("messageInput.commonPhrases")}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                {commonPhrasesList.map((phrase) => (
                  <DropdownMenuItem
                    key={phrase.abbr}
                    className="cursor-pointer"
                    onSelect={() => {
                      mentionInputRef.current?.closeDropdown();
                      mentionInputRef.current?.insertMention(phrase.content);
                    }}
                  >
                    {phrase.abbr}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  title={t("messageInput.viewCliLogs")}
                >
                  <Info className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("messageInput.cliLogsTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {cliIOLogs.map((log, index) => (
                    <div key={index} className="border rounded p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-mono px-2 py-1 rounded ${
                            log.type === "input"
                              ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                              : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          }`}
                        >
                          {log.type === "input"
                            ? t("messageInput.logTypeIn")
                            : t("messageInput.logTypeOut")}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {log.timestamp.toLocaleTimeString()}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.conversationId}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap break-all font-mono bg-white dark:bg-gray-900 p-2 rounded border">
                        {log.data}
                      </pre>
                    </div>
                  ))}
                  {cliIOLogs.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      {t("messageInput.noLogsMessage")}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*,.txt,.md,.csv,.pdf,.xlsx,.py,.js,.ts,.jsx,.tsx,.json,.html,.css,.java,.c,.cpp,.go,.rs,.php,.rb,.swift"
              multiple
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCliInstalled === false}
              size="icon"
              variant="outline"
              title={t("messageInput.uploadFile")}
            >
              <Paperclip />
            </Button>
          </form>
        </div>
      </div>
    );
  }
);

MessageInputBar.displayName = "MessageInputBar";
