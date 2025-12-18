import { ErrorContent } from "../types";

// Helper function to detect if a tool call result indicates an error
export function isErrorResult(content: ErrorContent): boolean {
  if (!content) return false;

  // Check for common error patterns
  const errorIndicators = [
    "is not recognized as an internal or external command",
    "command not found",
    "no such file or directory",
    "permission denied",
    "access denied",
    "error:",
    "failed:",
    "exception:",
  ];

  // If content is a ToolCallResult with markdown field
  if (typeof content === "object" && content !== null && content.markdown) {
    const markdown = content.markdown.toLowerCase();
    return errorIndicators.some((indicator) => markdown.includes(indicator));
  }

  // If content is a string
  if (typeof content === "string") {
    const contentStr = content.toLowerCase();
    return errorIndicators.some((indicator) => contentStr.includes(indicator));
  }

  // If content has an error field
  if (
    typeof content === "object" &&
    content !== null &&
    (content.error || content.stderr)
  ) {
    return true;
  }

  return false;
}
