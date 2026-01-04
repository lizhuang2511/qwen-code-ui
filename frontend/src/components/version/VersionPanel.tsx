import { useState, useEffect, useCallback } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { api } from "../../lib/api";
import {
  RotateCcw,
  RefreshCw,
  Loader2,
  Trash2,
  FileClock,
  FileMinus,
  X,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface VersionPanelProps {
  workingDirectory: string;
  className?: string;
}

interface VersionLogEntry {
  id: string;
  name?: string;
  message: string;
  date: string;
  size?: number;
  formatted_time?: string;
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'K', 'M', 'G', 'T'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function VersionPanel({ workingDirectory, className = "" }: VersionPanelProps) {
  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [log, setLog] = useState<VersionLogEntry[]>([]);
  const [versionName, setVersionName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  
  // Excluded paths state
  const [isExcludedDialogOpen, setIsExcludedDialogOpen] = useState(false);
  const [excludedPaths, setExcludedPaths] = useState<string[]>([]);

  const fetchStatus = useCallback(async () => {
    if (!workingDirectory) return;
    setIsLoading(true);
    try {
      const info = await api.get_version_info({ path: workingDirectory });
      setIsInitialized(info?.is_initialized || false);
      
      if (info?.is_initialized) {
        const history = await api.version_list({
          path: workingDirectory,
          limit: 20,
        });
        setLog(history);
      } else {
        setLog([]);
      }
    } catch (error) {
      console.error("Failed to fetch version info:", error);
      toast.error("Failed to fetch version info");
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory]);

  const fetchExcludedPaths = useCallback(async () => {
    if (!workingDirectory) return;
    try {
      const paths = await api.get_excluded_paths({ path: workingDirectory });
      setExcludedPaths(paths);
    } catch (error) {
      console.error("Failed to fetch excluded paths:", error);
    }
  }, [workingDirectory]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (isExcludedDialogOpen) {
        fetchExcludedPaths();
    }
  }, [isExcludedDialogOpen, fetchExcludedPaths]);

  const handleCreateVersion = async () => {
    if (!versionName.trim()) {
      toast.error("请输入文件名称");
      return;
    }
    
    setIsCreating(true);
    try {
      if (!isInitialized) {
          try {
             await api.version_init({ path: workingDirectory });
             setIsInitialized(true);
          } catch (e) {
             console.error("Failed to auto-initialize backup:", e);
          }
      }

      const success = await api.version_create({
        path: workingDirectory,
        message: "",
        name: versionName,
      });
      if (success) {
        toast.success("备份成功");
        setVersionName("");
        fetchStatus();
      } else {
        toast.error("备份失败");
      }
    } catch (error) {
      toast.error("备份失败");
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleCreateVersion();
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    if (!confirm("Are you sure you want to delete this version backup?")) {
      return;
    }
    try {
      const success = await api.version_delete({
        path: workingDirectory,
        versionId,
      });
      if (success) {
        toast.success("Version deleted successfully");
        fetchStatus();
        if (selectedVersion === versionId) {
          setSelectedVersion(null);
        }
      } else {
        toast.error("Failed to delete version");
      }
    } catch (error) {
      toast.error("Failed to delete version");
    }
  };

  const handleRestore = async (versionId: string) => {
    if (
      confirm(
        "Are you sure you want to restore to this version? Current files will be replaced."
      )
    ) {
      try {
        const success = await api.version_restore({
          path: workingDirectory,
          versionId,
        });
        if (success) {
          toast.success("Restored successfully");
          fetchStatus();
        } else {
          toast.error("Restore failed");
        }
      } catch (error) {
        toast.error("Restore failed");
      }
    }
  };

  const handleRemoveExclusion = async (pathToRemove: string) => {
    try {
        const newPaths = excludedPaths.filter(p => p !== pathToRemove);
        await api.save_excluded_paths({ path: workingDirectory, excluded: newPaths });
        setExcludedPaths(newPaths);
        toast.success("Exclusion removed");
    } catch (error) {
        toast.error("Failed to remove exclusion");
    }
  };

  if (isLoading && isInitialized === null) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-background border-l border-border ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">版本列表</span>
        </div>
        <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExcludedDialogOpen(true)}
              title="Excluded Files"
              className="h-6 w-6"
            >
              <FileMinus className="h-3 w-3" />
            </Button>
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
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-6">
          {/* Create Version Section */}
          <div className="space-y-3">
            <Input
              placeholder="文件名称"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-xs h-9"
            />
            
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCreateVersion}
                disabled={isCreating || !versionName.trim()}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 备份中...
                  </>
                ) : (
                  <>
                    <FileClock className="mr-2 h-4 w-4" /> 备份 (Ctrl+Enter)
                  </>
                )}
              </Button>
            </div>
          </div>

          <Separator />

          {/* History Section */}
          <div className="space-y-2 relative pl-2">
            {/* Vertical line */}
            {log.length > 0 && (
              <div
                className="absolute left-[15px] top-2 bottom-4 w-px bg-border"
                style={{ zIndex: 0 }}
              />
            )}

            {log.map((entry) => (
              <ContextMenu key={entry.id}>
                <ContextMenuTrigger>
                  <div
                    className={cn(
                      "relative flex items-start gap-3 p-2 rounded-md transition-colors group cursor-pointer",
                      selectedVersion === entry.id
                        ? "bg-accent"
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedVersion(entry.id)}
                  >
                    {/* Dot */}
                    <div
                      className="relative z-10 mt-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background shadow-sm flex-shrink-0 group-hover:scale-110 transition-transform"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-medium text-sm truncate"
                          title={entry.name}
                        >
                          {entry.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{entry.formatted_time || new Date(entry.date).toLocaleString()}</span>
                        <span>{formatBytes(entry.size || 0)}</span>
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => handleRestore(entry.id)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Restore this version
                  </ContextMenuItem>
                  <ContextMenuItem onClick={() => handleDeleteVersion(entry.id)} className="text-red-600 focus:text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Version
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
            {log.length === 0 && (
              <div className="text-xs text-muted-foreground italic pl-4">
                No backup history
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      
      {/* Excluded Files Dialog */}
      <Dialog open={isExcludedDialogOpen} onOpenChange={setIsExcludedDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excluded Files & Folders</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <ScrollArea className="h-[300px] w-full rounded-md border p-2">
                {excludedPaths.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        No excluded files
                    </div>
                ) : (
                    <div className="space-y-2">
                        {excludedPaths.map((path) => (
                            <div key={path} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded hover:bg-muted group">
                                <span className="truncate flex-1 mr-2" title={path}>{path}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => handleRemoveExclusion(path)}
                                >
                                    <X className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
