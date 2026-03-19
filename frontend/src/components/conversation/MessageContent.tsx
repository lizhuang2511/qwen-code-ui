import React from "react";
import { MarkdownRenderer } from "../common/MarkdownRenderer";

interface MessageContentProps {
  content: string;
  isAssistant?: boolean;
}

export const MessageContent = React.memo(({ content, isAssistant }: MessageContentProps) => {
  return <MarkdownRenderer isAssistant={isAssistant}>{content}</MarkdownRenderer>;
});

MessageContent.displayName = "MessageContent";
