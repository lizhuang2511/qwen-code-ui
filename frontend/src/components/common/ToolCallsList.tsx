import React from "react";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { type ToolCall } from "../../utils/toolCallParser";

interface ToolCallsListProps {
  toolCalls: ToolCall[];
}

export const ToolCallsList: React.FC<ToolCallsListProps> = ({ toolCalls }) => {
  return (
    <>
      {toolCalls.map((toolCall) => (
        <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
      ))}
    </>
  );
};
