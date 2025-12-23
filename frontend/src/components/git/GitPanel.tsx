import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { api } from "../../lib/api";
import {
  GitBranch,
  GitCommit,
  RotateCcw,
  RefreshCw,
  Loader2,
  Play,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface GitPanelProps {
  workingDirectory: string;
  className?: string;
}

interface GitStatus {
  is_repo: boolean;
  current_branch?: string;
  staged?: { path: string; change_type: string }[];
  unstaged?: { path: string; change_type: string }[];
  untracked?: string[];
  error?: string;
}

interface GitLogEntry {
  hexsha: string;
  message: string;
  author_name: string;
  author_email: string;
  date: string;
  summary: string;
}

export function GitPanel({ workingDirectory, className = "" }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [log, setLog] = useState<GitLogEntry[]>([]);
  const [commitMessage, setCommitMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [isChangesExpanded, setIsChangesExpanded] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!workingDirectory) return;
    setIsLoading(true);
    try {
      const result = await api.get_git_info({ path: workingDirectory });
      setStatus(result);
      if (result?.is_repo) {
        const logResult = await api.git_log({
          path: workingDirectory,
          limit: 20,
        });
        setLog(logResult);
      } else {
        setLog([]);
      }
    } catch (error) {
      console.error("Failed to fetch git info:", error);
      toast.error("Failed to fetch git info");
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleInit = async () => {
    try {
      await api.git_init({ path: workingDirectory });
      toast.success("Repository initialized");
      fetchStatus();
    } catch (error) {
      toast.error("Failed to initialize repository");
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      toast.error("Please enter a commit message");
      return;
    }
    setIsCommitting(true);
    try {
      const success = await api.git_commit({
        path: workingDirectory,
        message: commitMessage,
      });
      if (success) {
        toast.success("Committed successfully");
        setCommitMessage("");
        fetchStatus();
      } else {
        toast.error("Commit failed");
      }
    } catch (error) {
      toast.error("Commit failed");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleCommit();
    }
  };

  const handleReset = async (commitHash: string) => {
    if (
      confirm(
        "Are you sure you want to reset to this commit? This will discard uncommitted changes."
      )
    ) {
      try {
        const success = await api.git_reset({
          path: workingDirectory,
          commitHash,
          mode: "mixed",
        });
        if (success) {
          toast.success("Reset successfully");
          fetchStatus();
        } else {
          toast.error("Reset failed");
        }
      } catch (error) {
        toast.error("Reset failed");
      }
    }
  };

  if (isLoading && !status) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status && !status.is_repo) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full p-4 gap-4 ${className}`}
      >
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">Not a Git Repository</h3>
          <p className="text-sm text-muted-foreground">
            Initialize a git repository to start tracking changes.
          </p>
        </div>
        <Button onClick={handleInit}>
          <Play className="mr-2 h-4 w-4" /> Initialize
        </Button>
      </div>
    );
  }

  const changesCount =
    (status?.staged?.length || 0) +
    (status?.unstaged?.length || 0) +
    (status?.untracked?.length || 0);

  const getChangesSummary = () => {
    const parts = [];
    if (status?.staged?.length) parts.push(`${status.staged.length} staged`);
    if (status?.unstaged?.length)
      parts.push(`${status.unstaged.length} unstaged`);
    if (status?.untracked?.length)
      parts.push(`${status.untracked.length} untracked`);
    return parts.join(", ") || "No changes";
  };

  return (
    <div
      className={`flex flex-col h-full bg-background border-l border-border ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-blue-500" />
          <span
            className="font-medium text-sm truncate max-w-[120px]"
            title={status?.current_branch}
          >
            {status?.current_branch || "HEAD"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchStatus}
          disabled={isLoading}
          className="h-6 w-6"
        >
          <RefreshCw
            className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-6">
          {/* Commit Section */}
          <div className="space-y-3">
            <Input
              placeholder={`提交变更内容(Ctrl+Enter 在“${
                status?.current_branch || "main"
              }”提交)`}
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-xs h-9"
            />
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleCommit}
              disabled={isCommitting || changesCount === 0}
            >
              {isCommitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 提交中...
                </>
              ) : (
                <>
                  <GitCommit className="mr-2 h-4 w-4" /> 提交 Ctrl+Enter
                </>
              )}
            </Button>
            
            {/* Working Tree Status Summary (moved here) */}
            <div className="pt-1">
              <div
                className="flex items-center justify-between cursor-pointer hover:text-foreground transition-colors"
                onClick={() => setIsChangesExpanded(!isChangesExpanded)}
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  {isChangesExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  Working Tree ({changesCount})
                </span>
              </div>

              {isChangesExpanded ? (
                <ScrollArea className="h-[120px] -mx-2 px-2 mt-2 border rounded-md bg-muted/20">
                  <div className="space-y-1 p-2">
                    {status?.staged?.map((f, i) => (
                      <div
                        key={`staged-${i}`}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="truncate text-muted-foreground flex-1" title={f.path}>
                          {f.path}
                        </span>
                        <span className="text-[10px] text-green-600 font-mono ml-2">
                          {f.change_type}
                        </span>
                      </div>
                    ))}
                    {status?.unstaged?.map((f, i) => (
                      <div
                        key={`unstaged-${i}`}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="truncate text-muted-foreground flex-1" title={f.path}>
                          {f.path}
                        </span>
                        <span className="text-[10px] text-yellow-600 font-mono ml-2">
                          {f.change_type}
                        </span>
                      </div>
                    ))}
                    {status?.untracked?.map((f, i) => (
                      <div
                        key={`untracked-${i}`}
                        className="flex items-center justify-between text-xs py-0.5"
                      >
                        <span className="truncate text-muted-foreground flex-1" title={f}>
                          {f}
                        </span>
                        <span className="text-[10px] text-red-600 font-mono ml-2">
                          U
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-xs text-muted-foreground pl-4 mt-1">
                  {changesCount > 0
                    ? getChangesSummary()
                    : "No pending changes"}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* History Section (Vertical Graph) */}
          <div className="space-y-2 relative pl-2">
            {/* Vertical line connector background */}
            {log.length > 0 && (
              <div
                className="absolute left-[15px] top-2 bottom-4 w-px bg-border"
                style={{ zIndex: 0 }}
              />
            )}

            {log.map((commit, index) => (
              <ContextMenu key={commit.hexsha}>
                <ContextMenuTrigger>
                  <div
                    className={cn(
                      "relative flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors group",
                      selectedCommit === commit.hexsha
                        ? "bg-accent"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedCommit(commit.hexsha)}
                  >
                    {/* Dot on the timeline */}
                    <div
                      className="relative z-10 mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-background shadow-sm flex-shrink-0 group-hover:scale-110 transition-transform"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-medium text-sm truncate"
                          title={commit.message}
                        >
                          {commit.summary}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{commit.author_name}</span>
                        {index === 0 && status?.current_branch && (
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px]">
                            {status.current_branch}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleReset(commit.hexsha)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset to this commit
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {log.length === 0 && (
              <div className="text-xs text-muted-foreground italic pl-4">
                No commit history
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Selected Item Detail Area */}
      {selectedCommit && (
        <div className="border-t border-border bg-muted/20 p-3 min-h-[100px]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                Commit Details
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4"
                onClick={() => setSelectedCommit(null)}
              >
                <span className="sr-only">Close</span>×
              </Button>
            </div>
            {(() => {
              const commit = log.find((c) => c.hexsha === selectedCommit);
              return commit ? (
                <div className="text-xs space-y-1">
                  <div className="font-mono text-[10px] text-muted-foreground select-all">
                    {commit.hexsha}
                  </div>
                  <div className="font-medium">{commit.message}</div>
                  <div className="text-muted-foreground">
                    {commit.author_name} &lt;{commit.author_email}&gt;
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(commit.date).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Commit not found
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
