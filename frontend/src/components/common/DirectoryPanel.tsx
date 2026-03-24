import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Folder,
  FolderOpen,
  File,
  Loader2,
  AlertCircle,
  RefreshCw,
  Plus,
  Eye,
  ExternalLink,
  Clipboard,
  Copy,
  Trash2,
  FolderPlus,
  Move,
  Scissors,
  FilePlus,
  FileMinus,
  RotateCcw,
} from "lucide-react";
import { Button } from "../ui/button";
import { ScrollArea, ScrollBar } from "../ui/scroll-area";
import { api } from "../../lib/api";
import { listen } from "../../lib/listen";
import { FileContentViewer } from "./FileContentViewer";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../ui/context-menu";

interface DirEntry {
  name: string;
  is_directory: boolean;
  full_path: string;
  size?: number;
  modified?: number;
  is_symlink?: boolean;
  symlink_target?: string;
}

interface TreeNode extends DirEntry {
  children?: TreeNode[];
  isExpanded?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
}

interface DirectoryPanelProps {
  workingDirectory: string;
  onDirectoryChange?: (path: string) => void;
  onMentionInsert?: (mention: string) => void;
  className?: string;
}

export function DirectoryPanel({
  workingDirectory,
  onDirectoryChange,
  onMentionInsert,
  className = "",
}: DirectoryPanelProps) {
  const { t } = useTranslation();
  const [rootNode, setRootNode] = useState<TreeNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  
  // Persist expanded paths
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  
  // Excluded paths state
  const [excludedPaths, setExcludedPaths] = useState<string[]>([]);
  
  // Paste text dialog state
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState<string>("");
  const [pasteFilename, setPasteFilename] = useState<string>("");
  const [isPastingImage, setIsPastingImage] = useState<boolean>(false);

  // Context Menu Actions State
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderParent, setNewFolderParent] = useState("");

  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileParent, setNewFileParent] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{path: string, isDir: boolean} | null>(null);

  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [itemToMove, setItemToMove] = useState<{path: string, name: string} | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  const [internalClipboard, setInternalClipboard] = useState<{
    type: "cut" | "copy";
    path: string;
    name: string;
  } | null>(null);

  // Handle Cut/Copy (Internal + System)
  const handleCutCopy = async (
    node: TreeNode,
    type: "cut" | "copy"
  ) => {
    // 1. Set internal clipboard (for app-internal moves/copies)
    setInternalClipboard({
      type,
      path: node.full_path,
      name: node.name,
    });

    // 2. Set system clipboard (for external pastes)
    try {
      await api.set_clipboard_content({
        type: "files",
        content: [node.full_path],
      });
      
      const message = type === "cut" 
        ? t("directoryPanel.cutToClipboard", "Cut to internal clipboard")
        : t("directoryPanel.copyToClipboard", "Copied to clipboard");
        
      toast.success(message);
    } catch (err) {
      console.error("Failed to set system clipboard", err);
      // Fallback message if system clipboard fails but internal succeeded
      toast.success(
        type === "cut"
          ? t("directoryPanel.cutToClipboard", "Cut to internal clipboard")
          : t("directoryPanel.copyToClipboard", "Copied to internal clipboard")
      );
    }
  };

  // Calculate relative path from working directory
  const getRelativePath = useCallback(
    (fullPath: string) => {
      // Normalize paths by replacing backslashes with forward slashes
      const normalizedWorkingDir = workingDirectory.replace(/\\/g, "/");
      const normalizedFullPath = fullPath.replace(/\\/g, "/");

      // Remove working directory prefix
      if (normalizedFullPath.startsWith(normalizedWorkingDir)) {
        let relativePath = normalizedFullPath.slice(
          normalizedWorkingDir.length
        );
        // Remove leading slash if present
        if (relativePath.startsWith("/")) {
          relativePath = relativePath.slice(1);
        }
        return relativePath || ".";
      }

      // If not under working directory, return the full path
      return fullPath;
    },
    [workingDirectory]
  );

  const fetchExcludedPaths = useCallback(async () => {
    if (!workingDirectory) return;
    try {
      const paths = await api.get_excluded_paths({ path: workingDirectory });
      setExcludedPaths(paths);
    } catch (e) {
      console.error(e);
    }
  }, [workingDirectory]);

  // Handle file click to insert mention or view content
  const handleFileClick = useCallback(
    (node: TreeNode, event: React.MouseEvent) => {
      if (node.is_directory) return;

      // If Ctrl/Cmd is held, view file content
      if (event.ctrlKey || event.metaKey) {
        setViewingFile(node.full_path);
        return;
      }

      // Otherwise, insert mention if callback is available
      if (!onMentionInsert) {
        return;
      }

      const relativePath = getRelativePath(node.full_path);
      onMentionInsert(`@${relativePath} `);
    },
    [onMentionInsert, getRelativePath]
  );

  // Handle folder plus button click to insert mention
  const handleFolderPlusClick = useCallback(
    (node: TreeNode, event: React.MouseEvent) => {
      event.stopPropagation(); // Prevent folder expansion
      if (!onMentionInsert) {
        return;
      }

      const relativePath = getRelativePath(node.full_path);
      onMentionInsert(`@${relativePath}/ `);
    },
    [onMentionInsert, getRelativePath]
  );



  // Load directory contents
  const loadDirectoryContents = useCallback(
    async (path: string): Promise<TreeNode[]> => {
      try {
        // console.log("📁 [DirectoryPanel] Loading contents for:", path);
        const entries = await api.list_directory_contents({ path });

        // Sort entries: directories first, then files, both alphabetically
        const sortedEntries = entries.sort((a, b) => {
          if (a.is_directory && !b.is_directory) return -1;
          if (!a.is_directory && b.is_directory) return 1;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        return sortedEntries.map((entry) => ({
          ...entry,
          children: entry.is_directory ? [] : undefined,
          isExpanded: false,
          isLoading: false,
          hasError: false,
        }));
      } catch (err) {
        console.error("📁 [DirectoryPanel] Error loading directory:", err);
        throw err;
      }
    },
    []
  );

  // Initialize root directory with state restoration
  const initializeRoot = useCallback(async () => {
    if (!workingDirectory) return;

    setIsLoading(true);
    setError(null);

    try {
      const children = await loadDirectoryContents(workingDirectory);
      const pathParts = workingDirectory.split(/[/\\]/).filter(Boolean);
      const rootName =
        pathParts.length > 0
          ? pathParts[pathParts.length - 1]
          : workingDirectory;

      let root: TreeNode = {
        name: rootName || "Root",
        is_directory: true,
        full_path: workingDirectory,
        children,
        isExpanded: true,
        isLoading: false,
        hasError: false,
      };
      
      // Recursive function to restore expanded state
      const restoreExpansion = async (node: TreeNode): Promise<TreeNode> => {
        if (!node.is_directory || !node.children) return node;
        
        // Process children concurrently
        const updatedChildren = await Promise.all(
            node.children.map(async (child) => {
                if (child.is_directory && expandedPaths.has(child.full_path)) {
                    try {
                        const grandChildren = await loadDirectoryContents(child.full_path);
                        const expandedChild = {
                            ...child,
                            isExpanded: true,
                            children: grandChildren
                        };
                        return restoreExpansion(expandedChild);
                    } catch (e) {
                        console.error(`Failed to restore expansion for ${child.full_path}`, e);
                        return child;
                    }
                }
                return child;
            })
        );
        
        return {
            ...node,
            children: updatedChildren
        };
      };

      // Restore expansion state
      root = await restoreExpansion(root);

      setRootNode(root);
      
      // Fetch excluded paths
      await fetchExcludedPaths();
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load directory");
      setRootNode(null);
    } finally {
      setIsLoading(false);
    }
  }, [workingDirectory, loadDirectoryContents, fetchExcludedPaths, expandedPaths]);

  // Toggle directory expansion
  const toggleDirectory = useCallback(
    async (node: TreeNode, _path: TreeNode[]) => {
      if (!node.is_directory) return;

      const updateNodeInTree = (
        root: TreeNode,
        targetNode: TreeNode,
        updater: (node: TreeNode) => TreeNode
      ): TreeNode => {
        // If this is the target node, update it
        if (root.full_path === targetNode.full_path) {
          return updater(root);
        }

        // If this node has children, search through them
        if (root.children) {
          const updatedChildren = root.children.map((child) =>
            updateNodeInTree(child, targetNode, updater)
          );

          return {
            ...root,
            children: updatedChildren,
          };
        }

        return root;
      };

      if (node.isExpanded) {
        // Collapse
        setExpandedPaths(prev => {
            const next = new Set(prev);
            next.delete(node.full_path);
            return next;
        });
        
        setRootNode((prev) =>
          prev
            ? updateNodeInTree(prev, node, (n) => ({ ...n, isExpanded: false }))
            : prev
        );
      } else {
        // Expand
        setExpandedPaths(prev => new Set(prev).add(node.full_path));
        
        // first set loading state
        setRootNode((prev) =>
          prev
            ? updateNodeInTree(prev, node, (n) => ({ ...n, isLoading: true }))
            : prev
        );

        try {
          const children = await loadDirectoryContents(node.full_path);
          setRootNode((prev) =>
            prev
              ? updateNodeInTree(prev, node, (n) => ({
                  ...n,
                  children,
                  isExpanded: true,
                  isLoading: false,
                  hasError: false,
                  }))
              : prev
          );
        } catch (err) {
          console.error("📁 [DirectoryPanel] Error expanding directory:", err);
          setRootNode((prev) =>
            prev
              ? updateNodeInTree(prev, node, (n) => ({
                  ...n,
                  isLoading: false,
                  hasError: true,
                  }))
              : prev
          );
        }
      }
    },
    [loadDirectoryContents]
  );

  // Refresh current directory
  const refreshDirectory = useCallback(() => {
    initializeRoot();
  }, [initializeRoot]);

  // Handle Paste
  const handlePaste = useCallback(async (targetDir: string = workingDirectory) => {
    try {
      // 1. Check internal clipboard first (for Cut/Copy operations)
      if (internalClipboard) {
        const sourcePath = internalClipboard.path;
        const fileName = internalClipboard.name;
        // Simple join, assuming forward slashes or consistent handling
        const targetPath = `${targetDir.replace(/\\/g, "/")}/${fileName}`;
        
        if (internalClipboard.type === "cut") {
          // Prevent moving to self
          if (sourcePath === targetPath) {
            setInternalClipboard(null);
            return;
          }

          await api.move_path({ oldPath: sourcePath, newPath: targetPath });
          setInternalClipboard(null);
          refreshDirectory();
          toast.success(t("directoryPanel.moved", "Item moved successfully"));
        } else if (internalClipboard.type === "copy") {
          // Prevent copying to self
          if (sourcePath === targetPath) {
            toast.info(t("directoryPanel.copyToSelf", "Cannot copy to the same location"));
            setInternalClipboard(null);
            return;
          }

          await api.copy_files({ paths: [sourcePath], target: targetDir });
          // Don't clear clipboard for copy to allow multiple pastes
          refreshDirectory();
          toast.success(t("directoryPanel.copied", "Item copied successfully"));
        }
        return;
      }

      // 2. Fallback to system clipboard
      // Try to read from browser clipboard API first to support images
      if (navigator.clipboard && navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imageTypes = item.types.filter(type => type.startsWith('image/'));
            if (imageTypes.length > 0) {
              const blob = await item.getType(imageTypes[0]);
              const buffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              
              // Convert to base64 in chunks to avoid call stack size exceeded
              const chunkSize = 8192;
              let binary = '';
              for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
              }
              const base64 = btoa(binary);
              
              const ext = imageTypes[0].split('/')[1] || 'png';
              const timestamp = new Date().getTime();
              
              setPasteFilename(`screenshot_${timestamp}.${ext}`);
              setPasteContent(base64);
              setPasteTargetDir(targetDir);
              setIsPastingImage(true);
              setPasteDialogOpen(true);
              return;
            }
          }
        } catch (e) {
          console.warn("Failed to read from navigator.clipboard, falling back to api", e);
        }
      }

      const clipboard = await api.get_clipboard_content();
      
      if (clipboard.type === "image" && typeof clipboard.content === "string") {
        const ext = clipboard.format || 'png';
        const timestamp = new Date().getTime();
        setPasteFilename(`screenshot_${timestamp}.${ext}`);
        setPasteContent(clipboard.content);
        setPasteTargetDir(targetDir);
        setIsPastingImage(true);
        setPasteDialogOpen(true);
      } else if (clipboard.type === "files" && Array.isArray(clipboard.content)) {
        await api.copy_files({ 
          paths: clipboard.content, 
          target: targetDir 
        });
        refreshDirectory();
        toast.success(t("directoryPanel.filesPasted", "Files pasted successfully"));
      } else if (clipboard.type === "text" && typeof clipboard.content === "string") {
        const text = clipboard.content;
        // Generate default filename from first 10 chars
        // Use first 10 chars, but preserve unicode characters (Chinese, etc.)
        // Only replace invalid filesystem characters
        let safeName = text.slice(0, 10).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
        safeName = safeName.trim();
        if (!safeName) safeName = "clipboard";
        setPasteFilename(`${safeName}.md`);
        setPasteContent(text);
        setPasteTargetDir(targetDir);
        setIsPastingImage(false);
        setPasteDialogOpen(true);
      } else {
        toast.info(t("directoryPanel.clipboardEmpty", "Clipboard is empty or format not supported"));
      }
    } catch (err) {
      console.error("Paste failed", err);
      toast.error(t("directoryPanel.pasteFailed", "Failed to paste content"));
    }
  }, [workingDirectory, refreshDirectory, t, internalClipboard]);

  const [pasteTargetDir, setPasteTargetDir] = useState<string>(workingDirectory);

  const handleSavePaste = async () => {
    if (!pasteFilename) return;
    try {
      // Simple path join
      const targetPath = `${pasteTargetDir.replace(/\\/g, "/")}/${pasteFilename}`;
      if (isPastingImage) {
        await api.write_binary_file_content({ path: targetPath, content: pasteContent });
      } else {
        await api.write_file_content({ path: targetPath, content: pasteContent });
      }
      setPasteDialogOpen(false);
      refreshDirectory();
      toast.success(t("directoryPanel.fileCreated", "File created from clipboard"));
    } catch (err) {
      console.error("Failed to save pasted file", err);
      toast.error(t("directoryPanel.saveFailed", "Failed to save file"));
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !newFolderParent) return;
    try {
      const targetPath = `${newFolderParent.replace(/\\/g, "/")}/${newFolderName}`;
      await api.create_directory({ path: targetPath });
      setNewFolderDialogOpen(false);
      setNewFolderName("");
      refreshDirectory();
      toast.success(t("directoryPanel.folderCreated", "Folder created successfully"));
    } catch (err) {
      console.error("Failed to create folder", err);
      toast.error(t("directoryPanel.createFolderFailed", "Failed to create folder"));
    }
  };

  const handleCreateFile = async () => {
    if (!newFileName || !newFileParent) return;
    try {
      const targetPath = `${newFileParent.replace(/\\/g, "/")}/${newFileName}`;
      await api.write_file_content({ path: targetPath, content: "" });
      setNewFileDialogOpen(false);
      setNewFileName("");
      refreshDirectory();
      toast.success(t("directoryPanel.fileCreated", "File created successfully"));
    } catch (err) {
      console.error("Failed to create file", err);
      toast.error(t("directoryPanel.createFileFailed", "Failed to create file"));
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await api.delete_path({ path: itemToDelete.path });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      refreshDirectory();
      toast.success(t("directoryPanel.deleted", "Item deleted successfully"));
    } catch (err) {
      console.error("Failed to delete item", err);
      toast.error(t("directoryPanel.deleteFailed", "Failed to delete item"));
    }
  };

  const handleMove = async () => {
    if (!itemToMove || !moveTarget) return;
    try {
      await api.move_path({ oldPath: itemToMove.path, newPath: moveTarget });
      setMoveDialogOpen(false);
      setItemToMove(null);
      setMoveTarget("");
      refreshDirectory();
      toast.success(t("directoryPanel.moved", "Item moved successfully"));
    } catch (err) {
      console.error("Failed to move item", err);
      toast.error(t("directoryPanel.moveFailed", "Failed to move item"));
    }
  };
  
  const handleExclude = async (node: TreeNode) => {
    try {
        const relPath = getRelativePath(node.full_path);
        // Avoid duplicates
        if (!excludedPaths.includes(relPath)) {
            const newPaths = [...excludedPaths, relPath];
            await api.save_excluded_paths({ path: workingDirectory, excluded: newPaths });
            setExcludedPaths(newPaths);
            toast.success(t("directoryPanel.excluded", "Item excluded"));
        }
    } catch (e) {
        console.error(e);
        toast.error(t("directoryPanel.excludeFailed", "Failed to exclude"));
    }
  };

  const handleCancelExclude = async (node: TreeNode) => {
    try {
        const relPath = getRelativePath(node.full_path);
        const newPaths = excludedPaths.filter(p => p !== relPath);
        await api.save_excluded_paths({ path: workingDirectory, excluded: newPaths });
        setExcludedPaths(newPaths);
        toast.success(t("directoryPanel.exclusionCanceled", "Exclusion canceled"));
    } catch (e) {
        console.error(e);
        toast.error(t("directoryPanel.cancelExcludeFailed", "Failed to cancel exclusion"));
    }
  };

  // Initialize on mount and when working directory changes
  useEffect(() => {
    initializeRoot();
  }, [initializeRoot]);

  // Listen for fs-change events
  useEffect(() => {
    let unlisten: () => void;
    
    // Debounce timer
    let timer: NodeJS.Timeout | null = null;

    const setupListener = async () => {
        unlisten = await listen<any>("fs-change", () => {
            // console.log("Received fs-change event", event);
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                refreshDirectory();
            }, 500); // 500ms debounce
        });
    };
    
    setupListener();
    
    return () => {
        if (unlisten) unlisten();
        if (timer) clearTimeout(timer);
    };
  }, [refreshDirectory]);

  // Render tree node
  const renderTreeNode = useCallback(
    (
      node: TreeNode,
      depth: number = 0,
      path: TreeNode[] = []
    ): React.ReactNode => {
      const currentPath = [...path, node];
      const hasChildren =
        node.is_directory && node.children && node.children.length > 0;

      const getParentDir = (path: string) => {
        return path.replace(/[/\\][^/\\]+$/, "");
      };

      const isCut = internalClipboard?.type === "cut" && internalClipboard.path === node.full_path;
      
      const relativePath = getRelativePath(node.full_path);
      const isSystemExcluded = node.name === ".git" || node.name === ".history";
      const isExcluded = excludedPaths.includes(relativePath);
      const isVisualExcluded = isExcluded || isSystemExcluded;

      return (
        <div key={node.full_path}>
          <ContextMenu>
            <ContextMenuTrigger>
              <div
                className={`flex items-center gap-2 py-1 pr-2 hover:bg-accent hover:text-accent-foreground cursor-pointer text-sm rounded-sm transition-colors relative group ${isCut ? "opacity-50" : ""}`}
                style={{
                  paddingLeft: `${depth * 24}px`,
                }}
                onClick={(event) => {
                  if (node.is_directory) {
                    toggleDirectory(node, []);
                    onDirectoryChange?.(node.full_path);
                  } else {
                    handleFileClick(node, event);
                  }
                }}
              >
                {/* Loading/Error Icon for directories */}
                {node.is_directory && (node.isLoading || node.hasError) && (
                  <div className="w-4 h-4 flex items-center justify-center">
                    {node.isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                )}

                {/* File/Folder Icon */}
                {node.is_directory ? (
                  node.isExpanded ? (
                    <FolderOpen className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Folder className="h-4 w-4 text-blue-500" />
                  )
                ) : (
                  <File className="h-4 w-4 text-muted-foreground" />
                )}

                {/* Name */}
                <span
                  className={`text-foreground flex-1 whitespace-nowrap ${isVisualExcluded ? "text-green-600 font-medium" : ""}`}
                  title={
                    node.is_directory
                      ? node.name
                      : `${node.name} (Ctrl+Click to view content)`
                  }
                >
                  {node.name}
                </span>

                {/* Action buttons */}
                <div className="ml-auto flex items-center gap-1">
                  {/* Eye icon for files on hover */}
                  {!node.is_directory && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingFile(node.full_path);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                        title="View file content"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </>
                  )}

                  {/* Plus button for folders on hover */}
                  {node.is_directory && onMentionInsert && (
                    <>
                      <button
                        onClick={(e) => handleFolderPlusClick(node, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title="Add folder mention"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>

                {/* Symlink indicator */}
                {node.is_symlink && (
                  <span className="text-xs text-muted-foreground">→</span>
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {node.is_directory && (
                <>
                  <ContextMenuItem
                    onClick={() => {
                      setNewFileParent(node.full_path);
                      setNewFileName("");
                      setNewFileDialogOpen(true);
                    }}
                  >
                    <FilePlus className="mr-2 h-4 w-4" />
                    {t("directoryPanel.newFile", "New File")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => {
                      setNewFolderParent(node.full_path);
                      setNewFolderName("");
                      setNewFolderDialogOpen(true);
                    }}
                  >
                    <FolderPlus className="mr-2 h-4 w-4" />
                    {t("directoryPanel.newFolder", "New Folder")}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
              <ContextMenuItem
                onClick={async () => {
                  await api.open_with_default_app({ path: node.full_path });
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("directoryPanel.openWithDefault", "Open with Default App")}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const targetPath = node.is_directory ? node.full_path : getParentDir(node.full_path);
                  handlePaste(targetPath);
                }}
              >
                <Clipboard className="mr-2 h-4 w-4" />
                {t("directoryPanel.paste", "Paste")}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => handleCutCopy(node, "copy")}
              >
                <Copy className="mr-2 h-4 w-4" />
                {t("directoryPanel.copy", "Copy")}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => handleCutCopy(node, "cut")}
              >
                <Scissors className="mr-2 h-4 w-4" />
                {t("directoryPanel.cut", "Cut")}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setItemToMove({ path: node.full_path, name: node.name });
                  setMoveTarget(getParentDir(node.full_path) + "/" + node.name);
                  setMoveDialogOpen(true);
                }}
              >
                <Move className="mr-2 h-4 w-4" />
                {t("directoryPanel.move", "Move/Rename")}
              </ContextMenuItem>
              <ContextMenuSeparator />
              
              {!isSystemExcluded && (isExcluded ? (
                  <ContextMenuItem onClick={() => handleCancelExclude(node)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t("directoryPanel.cancelExclusion", "Cancel Exclusion")}
                  </ContextMenuItem>
              ) : (
                  <ContextMenuItem onClick={() => handleExclude(node)}>
                    <FileMinus className="mr-2 h-4 w-4" />
                    {t("directoryPanel.exclude", "Exclude File/Folder")}
                  </ContextMenuItem>
              ))}
              
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => {
                  setItemToDelete({ path: node.full_path, isDir: node.is_directory });
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("directoryPanel.delete", "Delete")}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>

          {/* Render children */}
          {node.isExpanded && hasChildren && (
            <div>
              {node.children!.map((child) =>
                renderTreeNode(child, depth + 1, currentPath)
              )}
            </div>
          )}
        </div>
      );
    },
    [
      toggleDirectory,
      onDirectoryChange,
      handleFileClick,
      handleFolderPlusClick,
      onMentionInsert,
      excludedPaths, // Add dependency
      getRelativePath,
      handleExclude,
      handleCancelExclude,
      t,
      internalClipboard,
    ]
  );

  return (
    <div
      className={`flex flex-col h-full border-l border-border bg-background ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm">{workingDirectory}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => api.open_with_default_app({ path: workingDirectory })}
            title={t("directoryPanel.openInFileManager", "Open in File Manager")}
            className="h-6 w-6 p-0"
          >
            <Folder className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshDirectory}
            disabled={isLoading}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Tree Content */}
      <ScrollArea className="flex-1 overflow-hidden">
        <div
          className="p-2 min-w-max h-full"
        >
          {isLoading && !rootNode ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-muted-foreground mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={refreshDirectory}>
                {t("common.retry", "Retry")}
              </Button>
            </div>
          ) : rootNode ? (
            renderTreeNode(rootNode)
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {t("directoryPanel.noContent", "No directory content")}
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
        <ScrollBar orientation="vertical" />
      </ScrollArea>

      <FileContentViewer
        filePath={viewingFile}
        onClose={() => setViewingFile(null)}
      />

      <Dialog open={pasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("directoryPanel.saveClipboard", "Save Clipboard Content")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="filename" className="text-right">
                {t("directoryPanel.filename", "Filename")}
              </Label>
              <Input
                id="filename"
                value={pasteFilename}
                onChange={(e) => setPasteFilename(e.target.value)}
                className="col-span-3"
              />
            </div>
            {isPastingImage ? (
              <div className="flex justify-center max-h-[200px] overflow-y-auto p-2 bg-muted rounded">
                <img src={`data:image/png;base64,${pasteContent}`} alt="Pasted" className="max-w-full h-auto object-contain" />
              </div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto p-2 bg-muted rounded text-xs whitespace-pre-wrap">
                {pasteContent.slice(0, 500)}
                {pasteContent.length > 500 && "..."}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleSavePaste}>{t("common.save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={newFolderDialogOpen} onOpenChange={setNewFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("directoryPanel.newFolder", "New Folder")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-folder-name" className="text-right">
                {t("common.name", "Name")}
              </Label>
              <Input
                id="new-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleCreateFolder}>{t("common.create", "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New File Dialog */}
      <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("directoryPanel.newFile", "New File")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-file-name" className="text-right">
                {t("common.name", "Name")}
              </Label>
              <Input
                id="new-file-name"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFile();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleCreateFile}>{t("common.create", "Create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("directoryPanel.deleteTitle", "Confirm Deletion")}</DialogTitle>
            <DialogDescription>
              {t(
                "directoryPanel.deleteConfirm",
                "Are you sure you want to delete this item? This action cannot be undone."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm font-medium text-destructive">
            {itemToDelete?.path}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t("common.delete", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move/Rename Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("directoryPanel.moveTitle", "Move or Rename")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="move-target" className="text-right">
                {t("directoryPanel.targetPath", "Target Path")}
              </Label>
              <Input
                id="move-target"
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                className="col-span-3"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleMove();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={handleMove}>{t("common.move", "Move")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
