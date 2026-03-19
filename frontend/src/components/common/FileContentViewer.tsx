import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText,
  Copy,
  Download,
  Edit,
  Save,
  X,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Image as ImageIcon,
  MoveDiagonal2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { api } from "../../lib/api";
import { downloadTextContent, downloadImageData } from "../../utils/download";
import { CodeMirrorViewer } from "./CodeMirrorViewer";
import { ExcelViewer } from "./ExcelViewer";
import { PDFViewer } from "./PDFViewer";
import { ImageViewer } from "./ImageViewer";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface FileContentViewerProps {
  filePath: string | null;
  onClose: () => void;
}

interface FileContent {
  path: string;
  content: string | null;
  size: number;
  modified: number | null;
  encoding: string;
  is_text: boolean;
  is_binary: boolean;
  error: string | null;
}

export function FileContentViewer({
  filePath,
  onClose,
}: FileContentViewerProps) {
  const { t } = useTranslation();
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [forceViewAsText, setForceViewAsText] = useState(false);

  // Drag & Resize states
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dialogContentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; initialLeft: number; initialTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; initialWidth: number; initialHeight: number } | null>(null);

  // Image/PDF viewer states
  const [imageScale, setImageScale] = useState(1.0);

  const [imageRotation, setImageRotation] = useState(0);
  const [pdfScale, setPdfScale] = useState(1.0);
  const [textScale, setTextScale] = useState(1.0);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{
    width: number;
    height: number;
    size: number;
  } | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);

  const isOpen = filePath !== null;

  const getFileExtension = (path: string): string => {
    return path.split(".").pop()?.toLowerCase() || "";
  };

  const isMarkdown = (path: string) => {
    const ext = getFileExtension(path);
    return ext === "md" || ext === "markdown";
  };

  const handleDragStart = (e: React.MouseEvent) => {
    // Prevent dragging if clicking buttons/controls or resize handle
    if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest(".no-drag") || (e.target as HTMLElement).closest(".resize-handle")) {
      return;
    }

    e.preventDefault();

    const dialogNode = dialogContentRef.current;
    if (!dialogNode) return;

    // If position is null (centered), calculate current computed position
    let currentX = position?.x;
    let currentY = position?.y;

    if (currentX === undefined || currentY === undefined) {
      const rect = dialogNode.getBoundingClientRect();
      currentX = rect.left;
      currentY = rect.top;
      setPosition({ x: currentX, y: currentY });
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: currentX,
      initialTop: currentY,
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current) return;
    
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    
    setPosition({
      x: dragRef.current.initialLeft + dx,
      y: dragRef.current.initialTop + dy,
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseMove]);

  // Resize Handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const dialogNode = dialogContentRef.current;
    if (!dialogNode) return;

    // Initialize size state if it's null
    let currentWidth = size?.width;
    let currentHeight = size?.height;

    if (currentWidth === undefined || currentHeight === undefined) {
      const rect = dialogNode.getBoundingClientRect();
      currentWidth = rect.width;
      currentHeight = rect.height;
      setSize({ width: currentWidth, height: currentHeight });
    }

    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialWidth: currentWidth,
      initialHeight: currentHeight,
    };

    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeUp);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizeRef.current) return;

    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;

    setSize({
      width: Math.max(320, resizeRef.current.initialWidth + dx), // Minimum width constraint
      height: Math.max(200, resizeRef.current.initialHeight + dy), // Minimum height constraint
    });
  }, []);

  const handleResizeUp = useCallback(() => {
    resizeRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeUp);
  }, [handleResizeMove]);

  // Clean up event listeners on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeUp);
    };
  }, [handleMouseMove, handleMouseUp, handleResizeMove, handleResizeUp]);

  const getFileType = useCallback(
    (path: string): "excel" | "pdf" | "image" | "text" => {
      const ext = getFileExtension(path);

      // Excel files
      if (["xlsx", "xls", "xlsm", "xlsb", "csv"].includes(ext)) {
        return "excel";
      }

      // PDF files
      if (ext === "pdf") {
        return "pdf";
      }

      // Image files
      if (
        ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
      ) {
        return "image";
      }

      // Default to text
      return "text";
    },
    []
  );

  useEffect(() => {
    if (!filePath) {
      setFileContent(null);
      setError(null);
      setForceViewAsText(false);
      return;
    }

    const loadFileContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const content = await api.read_file_content_with_options({
          path: filePath,
          forceText: forceViewAsText,
        });
        setFileContent(content);
        setEditedContent(content.content || "");
        setIsEditing(false);

        if (content.error) {
          setError(content.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load file content"
        );
      } finally {
        setLoading(false);
      }
    };

    loadFileContent();
  }, [filePath, forceViewAsText, getFileType]);

  const handleEdit = () => {
    if (
      (fileContent?.is_text || (fileContent?.is_binary && forceViewAsText)) &&
      fileContent.content !== null
    ) {
      setIsEditing(true);
      setEditedContent(fileContent.content);
    }
  };

  const handleSave = async () => {
    if (!filePath) return;

    setSaving(true);
    setError(null);

    try {
      const result = await api.write_file_content({
        path: filePath,
        content: editedContent,
      });

      if (result.error) {
        setError(result.error);
      } else {
        setFileContent(result);
        setIsEditing(false);
        // Show success toast
        const toast = document.createElement("div");
        toast.className =
          "fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg z-50";
        toast.textContent = "File saved successfully!";
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent(fileContent?.content || "");
  };

  const handleCopy = async () => {
    if (fileContent?.content === null || fileContent?.content === undefined) return;

    try {
      await navigator.clipboard.writeText(fileContent.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy content:", err);
    }
  };

  const handleDownload = () => {
    if (fileContent?.content === null || fileContent?.content === undefined || !filePath) return;
    downloadTextContent(fileContent.content, filePath);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  };

  const formatModifiedTime = (timestamp?: number): string => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getLanguageFromExtension = (path: string): string => {
    const ext = getFileExtension(path);
    const languageMap: Record<string, string> = {
      js: "javascript",
      ts: "typescript",
      jsx: "javascript",
      tsx: "typescript",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      c: "c",
      cpp: "cpp",
      css: "css",
      html: "html",
      json: "json",
      xml: "xml",
      yaml: "yaml",
      yml: "yaml",
      md: "markdown",
      sh: "bash",
      sql: "sql",
      php: "php",
      rb: "ruby",
    };
    return languageMap[ext] || "text";
  };

  // Image viewer control handlers
  const handleImageZoomIn = () => {
    setImageScale((prev) => Math.min(5.0, prev + 0.25));
  };

  const handleImageZoomOut = () => {
    setImageScale((prev) => Math.max(0.1, prev - 0.25));
  };

  const handleImageResetZoom = () => {
    setImageScale(1.0);
  };

  const handleImageRotate = () => {
    setImageRotation((prev) => (prev + 90) % 360);
  };

  const handleImageDownload = () => {
    if (!imageData || !filePath) return;
    downloadImageData(imageData, filePath);
  };

  // PDF viewer control handlers
  const handlePdfZoomIn = () => {
    setPdfScale((prev) => Math.min(3.0, prev + 0.25));
  };

  const handlePdfZoomOut = () => {
    setPdfScale((prev) => Math.max(0.5, prev - 0.25));
  };

  const handlePdfResetZoom = () => {
    setPdfScale(1.0);
  };

  // Text/Markdown viewer control handlers
  const handleTextZoomIn = () => {
    setTextScale((prev) => Math.min(3.0, prev + 0.1));
  };

  const handleTextZoomOut = () => {
    setTextScale((prev) => Math.max(0.5, prev - 0.1));
  };

  const handleTextResetZoom = () => {
    setTextScale(1.0);
  };

  // Get appropriate icon for file type
  const getFileIcon = (path: string) => {
    const fileType = getFileType(path);
    switch (fileType) {
      case "image":
        return <ImageIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />;
      case "pdf":
        return <FileText className="h-5 w-5 text-red-500 flex-shrink-0" />;
      default:
        return <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />;
    }
  };

  // Handle Ctrl+Wheel for zooming
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && isOpen) {
        // Only zoom if the mouse is over the dialog content
        if (dialogContentRef.current && dialogContentRef.current.contains(e.target as Node)) {
          e.preventDefault();
          
          if (!filePath) return;
          const fileType = getFileType(filePath);
          
          if (e.deltaY < 0) {
            // Zoom in
            if (fileType === "image") handleImageZoomIn();
            else if (fileType === "pdf") handlePdfZoomIn();
            else handleTextZoomIn();
          } else {
            // Zoom out
            if (fileType === "image") handleImageZoomOut();
            else if (fileType === "pdf") handlePdfZoomOut();
            else handleTextZoomOut();
          }
        }
      }
    };

    // Use non-passive listener to be able to prevent default browser zoom
    document.addEventListener("wheel", handleWheel, { passive: false });
    return () => document.removeEventListener("wheel", handleWheel);
  }, [isOpen, filePath, getFileType]);

  if (!isOpen) return null;

  // Compute dynamic styles for dragging and resizing
  const dialogStyle: React.CSSProperties = {
    // Position
    ...(position ? {
      top: position.y,
      left: position.x,
      transform: "none",
    } : {}),
    // Size
    ...(size ? {
      width: size.width,
      height: size.height,
      maxWidth: "none",
      maxHeight: "none",
    } : {
      // Default size constraints when not resized manually
      // We rely on className for initial sizing
    }),
  };

  return (
    <Dialog open={!!isOpen} onOpenChange={onClose}>
      <DialogContent
        ref={dialogContentRef}
        style={dialogStyle}
        className={`flex flex-col ${
          size 
            ? "" // If manually resized, don't apply default size classes
            : `${getFileType(filePath || "") === "pdf" ? "max-h-[95vh]" : "max-h-[80vh]"} max-w-4xl`
        }`}
      >
        <DialogHeader 
          className="flex-shrink-0 cursor-move hover:bg-muted/30 transition-colors rounded-t-lg -mx-6 -mt-6 px-6 pt-6 pb-2"
          onMouseDown={handleDragStart}
        >
          <DialogTitle className="flex items-center gap-2 justify-between select-none">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {getFileIcon(filePath || "")}
              <span className="font-mono text-sm truncate" title={filePath}>
                {filePath}
              </span>
              {fileContent && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {formatFileSize(fileContent.size)}
                  </Badge>
                  {fileContent.modified && (
                    <span className="hidden sm:inline">
                      {formatModifiedTime(fileContent.modified)}
                    </span>
                  )}
                  {/* Image-specific info */}
                  {getFileType(filePath || "") === "image" && imageInfo && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {imageInfo.width} × {imageInfo.height}
                    </Badge>
                  )}
                  {/* PDF-specific info */}
                  {getFileType(filePath || "") === "pdf" && numPages && (
                    <Badge variant="secondary" className="text-xs px-1.5 py-0">
                      {numPages} {numPages === 1 ? "page" : "pages"}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="w-px h-4 bg-border mx-1" />
              
              {fileContent && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {getFileType(fileContent.path) === "image" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleImageZoomOut}
                      disabled={imageScale <= 0.1}
                      className="h-7 w-7 p-0"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleImageResetZoom}
                      className="text-xs h-7 px-2 min-w-[3rem]"
                    >
                      {Math.round(imageScale * 100)}%
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleImageZoomIn}
                      disabled={imageScale >= 5.0}
                      className="h-7 w-7 p-0"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                    <div className="w-px h-4 bg-border mx-1" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleImageRotate}
                      className="h-7 w-7 p-0"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleImageDownload}
                      className="h-7 w-7 p-0"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}

                {getFileType(fileContent.path) === "pdf" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePdfZoomOut}
                      disabled={pdfScale <= 0.5}
                      className="h-7 w-7 p-0"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePdfResetZoom}
                      className="text-xs h-7 px-2 min-w-[3rem]"
                    >
                      {Math.round(pdfScale * 100)}%
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePdfZoomIn}
                      disabled={pdfScale >= 3.0}
                      className="h-7 w-7 p-0"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}

                {getFileType(fileContent.path) === "text" &&
                  (fileContent.is_text ||
                    (fileContent.is_binary && forceViewAsText)) &&
                  fileContent.content !== null && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleTextZoomOut}
                        disabled={textScale <= 0.5}
                        className="h-7 w-7 p-0"
                        title="Zoom Out"
                      >
                        <ZoomOut className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleTextResetZoom}
                        className="text-xs h-7 px-2 min-w-[3rem]"
                        title="Reset Zoom"
                      >
                        {Math.round(textScale * 100)}%
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleTextZoomIn}
                        disabled={textScale >= 3.0}
                        className="h-7 w-7 p-0"
                        title="Zoom In"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                      <div className="w-px h-4 bg-border mx-1" />
                      {!isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleEdit}
                            className="text-xs h-7 px-2"
                          >
                            <Edit className="h-3.5 w-3.5 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="text-xs h-7 px-2"
                          >
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            {copied ? t("common.copied") : t("common.copy")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDownload}
                            className="text-xs h-7 px-2"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            className="text-xs h-7 px-2"
                          >
                            <Save className="h-3.5 w-3.5 mr-1" />
                            {saving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCancel}
                            disabled={saving}
                            className="text-xs h-7 px-2"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        </>
                      )}
                    </>
                  )}
              </div>
            )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-24" />
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : error || fileContent?.error ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
              <div className="text-sm text-red-800 dark:text-red-200">
                {error || fileContent?.error}
              </div>
            </div>
          ) : fileContent ? (
            <>
              {/* File info bar for text files */}
              {getFileType(fileContent.path) === "text" && (
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50 rounded-md mx-2 mb-2 text-xs text-muted-foreground">
                  <span>{fileContent.encoding}</span>
                  <Badge
                    variant={
                      fileContent.is_binary && forceViewAsText
                        ? "destructive"
                        : fileContent.is_text
                          ? "default"
                          : "secondary"
                    }
                    className="text-xs px-1.5 py-0.5"
                  >
                    {fileContent.is_binary && forceViewAsText
                      ? "Binary (forced as text)"
                      : fileContent.is_text
                        ? "Text"
                        : "Binary"}
                  </Badge>
                  {fileContent.is_binary && forceViewAsText && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setForceViewAsText(false)}
                      className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground"
                    >
                      Back to binary view
                    </Button>
                  )}
                </div>
              )}

              {/* File content */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                {(() => {
                  const fileType = getFileType(fileContent.path);

                  // Handle specialized file types
                  if (fileType === "excel") {
                    return <ExcelViewer filePath={fileContent.path} />;
                  }

                  if (fileType === "pdf") {
                    return (
                      <PDFViewer
                        filePath={fileContent.path}
                        scale={pdfScale}
                        onLoadSuccess={setNumPages}
                        hideControls={true}
                      />
                    );
                  }

                  if (fileType === "image") {
                    return (
                      <ImageViewer
                        filePath={fileContent.path}
                        scale={imageScale}
                        rotation={imageRotation}
                        onImageLoad={(data, info) => {
                          setImageData(data);
                          setImageInfo(info);
                        }}
                        hideControls={true}
                      />
                    );
                  }

                  // Handle text files and binary files
                  if (fileContent.is_binary && !forceViewAsText) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>
                          This is a binary file and cannot be displayed as text.
                        </p>
                        <p className="text-sm mt-2 mb-4">
                          Size: {formatFileSize(fileContent.size)}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => setForceViewAsText(true)}
                          className="text-sm"
                        >
                          View anyway
                        </Button>
                      </div>
                    );
                  }

                  if (fileContent.content !== null) {
                    // Handle Markdown Preview
                    if (isMarkdown(fileContent.path) && !isEditing) {
                      return (
                        <div 
                          className="flex-1 overflow-y-auto p-4 bg-background"
                        >
                          <MarkdownRenderer fontSize={Math.round(14 * textScale)}>{fileContent.content}</MarkdownRenderer>
                        </div>
                      );
                    }

                    return (
                      <div className="flex-1 overflow-auto">
                        <CodeMirrorViewer
                          code={isEditing ? editedContent : fileContent.content}
                          language={getLanguageFromExtension(fileContent.path)}
                          readOnly={!isEditing}
                          onChange={isEditing ? setEditedContent : undefined}
                          fontSize={Math.round(14 * textScale)}
                        />
                      </div>
                    );
                  }

                  return (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>File is empty or content could not be read.</p>
                    </div>
                  );
                })()}
              </div>
            </>
          ) : null}
        </div>
        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center text-muted-foreground/50 hover:text-foreground z-50 resize-handle"
          onMouseDown={handleResizeStart}
        >
          <MoveDiagonal2 className="w-4 h-4" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
