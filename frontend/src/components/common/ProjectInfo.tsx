import { FolderOpen } from "lucide-react";
import { Card, CardContent } from "../ui/card";

interface ProjectInfoProps {
  directory: string;
  className?: string;
  compact?: boolean;
}

export function ProjectInfo({
  directory,
  className = "",
  compact = false,
}: ProjectInfoProps) {
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 text-xs text-gray-600 ${className}`}
        title={directory}
      >
        <FolderOpen className="h-3 w-3 text-gray-500" />
        <span className="font-mono truncate max-w-24">
          {directory.split("/").pop() || directory.split("\\").pop()}
        </span>
      </div>
    );
  }

  return (
    <Card className={`border-none shadow-sm ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-sm">
          <FolderOpen className="h-4 w-4 text-gray-500" />
          <span className="font-medium truncate" title={directory}>
            {directory}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
