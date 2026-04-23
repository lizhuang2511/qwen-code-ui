import React from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { api } from "../lib/api";
import { ArrowLeft, Plus, Trash2, Star, Tag as TagIcon, PanelRight, Layers, X, Download, Search } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "../components/ui/dialog";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { ScrollArea } from "../components/ui/scroll-area";
import { EnrichedProject } from "../lib/webApi";
import { useBackend } from "../contexts/BackendContext";
import { getBackendText } from "../utils/backendText";
import { generateSHA256, cn } from "../lib/utils";

type Project = EnrichedProject;

function truncatePath(path: string): string {
  if (!path) return "";
  return path.length > 50 ? "..." + path.slice(-47) : path;
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [projects, setProjects] = React.useState<Project[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isAddingProject, setIsAddingProject] = React.useState(false);
  const [tags, setTags] = React.useState<string[]>([]);
  const [selectedTag, setSelectedTag] = React.useState<string>("All");
  const [newTag, setNewTag] = React.useState("");
  const [showTagsPanel, setShowTagsPanel] = React.useState(false);
  const [showExportDialog, setShowExportDialog] = React.useState(false);
  const [exportContent, setExportContent] = React.useState("");
  const [isSavingExport, setIsSavingExport] = React.useState(false);
  const [searchKeyword, setSearchKeyword] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const navigate = useNavigate();
  const { workingDirectory } = useOutletContext<{ workingDirectory: string }>();
  const { selectedBackend } = useBackend();
  const backendText = getBackendText(selectedBackend);

  const joinPath = React.useCallback((dir: string, fileName: string) => {
    const normalized = (dir || "").replace(/[\\/]+$/, "");
    const sep = normalized.includes("\\") ? "\\" : "/";
    if (!normalized) return fileName;
    return `${normalized}${sep}${fileName}`;
  }, []);

  const downloadTextFile = React.useCallback((content: string, fileName: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const saveExportToPath = React.useCallback(
    async (path: string) => {
      await api.write_file_content({ path, content: exportContent });
      toast.success(t("projects.exportSavedTo", { path }));
    },
    [exportContent, t]
  );

  const handleSaveExportToCurrentDir = React.useCallback(async () => {
    const fileName = t("projects.exportDefaultFileName", "分类列表.txt");
    const targetPath = joinPath(workingDirectory, fileName);
    try {
      setIsSavingExport(true);
      await saveExportToPath(targetPath);
    } catch (e) {
      console.error("Failed to save export to current directory", e);
      toast.error(t("projects.exportSaveFailed", "保存失败"));
    } finally {
      setIsSavingExport(false);
    }
  }, [joinPath, saveExportToPath, t, workingDirectory]);

  const handleSaveExportAs = React.useCallback(async () => {
    const fileName = t("projects.exportDefaultFileName", "分类列表.txt");
    try {
      setIsSavingExport(true);
      const selectedPath = await api.select_save_file({
        directory: workingDirectory,
        defaultFilename: fileName,
      });
      if (selectedPath) {
        await saveExportToPath(selectedPath);
        return;
      }
      downloadTextFile(exportContent, fileName);
    } catch (e) {
      console.error("Failed to save export as", e);
      try {
        downloadTextFile(exportContent, fileName);
      } catch {
        toast.error(t("projects.exportSaveFailed", "保存失败"));
      }
    } finally {
      setIsSavingExport(false);
    }
  }, [downloadTextFile, exportContent, saveExportToPath, t, workingDirectory]);

  const refreshProjects = React.useCallback(async () => {
    try {
      const enrichedProjects = await api.list_enriched_projects();
      setProjects(enrichedProjects);
    } catch (e) {
      setError(t("projects.failedToLoad"));
      console.error(e);
    }
  }, [t]);

  const refreshTags = React.useCallback(async () => {
    try {
      const t = await api.get_tags();
      setTags(t);
    } catch (e) {
      console.error("Failed to fetch tags", e);
    }
  }, []);

  const handleDeleteProject = React.useCallback(
    async (projectId: string) => {
      try {
        await api.delete_project({ projectId });
        refreshProjects();
      } catch (e) {
        console.error("Failed to delete project:", e);
        setError(t("projects.failedToDelete"));
      }
    },
    [refreshProjects, t]
  );

  React.useEffect(() => {
    refreshProjects();
    refreshTags();
  }, [refreshProjects, refreshTags]);

  const handleAddProject = async (selectedPath: string) => {
    try {
      setIsAddingProject(true);
      setError(null);

      // Get canonical path from backend
      const canonicalPath = await api.get_canonical_path({
        path: selectedPath,
      });

      // Generate SHA256 hash of the canonical directory path
      const sha256 = await generateSHA256(canonicalPath);

      // Create or get the project (this will create metadata if it doesn't exist)
      const project = await api.get_project({
        sha256,
        externalRootPath: selectedPath, // Send original path here
      });

      // Refresh the projects list to include the new project
      await refreshProjects();

      // Navigate to the new project
      navigate(`/projects/${project.sha256}`);
    } catch (e) {
      console.error("Failed to add project:", e);
      setError(t("projects.failedToAdd"));
    } finally {
      setIsAddingProject(false);
    }
  };

  const handleAddProjectPy = async () => {
    try {
      setIsAddingProject(true);
      setError(null);
      const selectedPath = await api.select_directory();
      if (selectedPath) await handleAddProject(selectedPath);
    } catch (e) {
      console.error("Failed to open native file dialog:", e);
      setError(t("errors.failedToOpenDialog"));
    } finally {
      setIsAddingProject(false);
    }
  };

  const handleAddTag = async () => {
    if (!newTag.trim()) return;
    await api.add_tag({ tag: newTag.trim() });
    setNewTag("");
    refreshTags();
  };

  const handleDeleteTag = async (tag: string) => {
    await api.delete_tag({ tag });
    if (selectedTag === tag) setSelectedTag("All");
    refreshTags();
    refreshProjects();
  };

  const handleToggleProjectTag = async (projectId: string, tag: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    await api.toggle_project_tag({ projectId, tag });
    refreshProjects();
  };

  const handleExport = () => {
    if (!projects) return;

    const tagMap: Record<string, string[]> = {};
    const untagged: string[] = [];

    projects.forEach(p => {
      const path = p.metadata?.path || p.root_path;
      if (p.tags && p.tags.length > 0) {
        p.tags.forEach((tag: string) => {
          if (!tagMap[tag]) tagMap[tag] = [];
          tagMap[tag].push(path);
        });
      } else {
        untagged.push(path);
      }
    });

    let content = "";
    
    const sortedTags = Object.keys(tagMap).sort();
    
    sortedTags.forEach(tag => {
      content += `【${tag}】\n`;
      tagMap[tag].forEach(path => {
        content += `- ${path}\n`;
      });
      content += "\n";
    });

    if (untagged.length > 0) {
      content += `【无标签】\n`;
      untagged.forEach(path => {
        content += `- ${path}\n`;
      });
      content += "\n";
    }

    setExportContent(content);
    setShowExportDialog(true);

    navigator.clipboard.writeText(content).then(() => {
      toast.success(t("projects.exportSuccess", "复制到剪贴板成功"));
    }).catch((err) => {
      console.error("Failed to copy to clipboard", err);
      toast.error(t("projects.exportFailed", "复制到剪贴板失败"));
    });
  };

  const filteredProjects = React.useMemo(() => {
    if (!projects) return null;
    let filtered = projects;
    
    if (selectedTag !== "All") {
      filtered = filtered.filter(p => p.tags && p.tags.includes(selectedTag));
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.metadata.friendly_name.toLowerCase().includes(query) || 
        (p.metadata.path && p.metadata.path.toLowerCase().includes(query))
      );
    }
    
    return filtered;
  }, [projects, selectedTag, searchQuery]);

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="flex-none p-6 pb-0">
          <div className="mb-4 flex justify-between items-center">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition cursor-pointer"
              aria-label={t("projects.backToHome")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              <span>{t("projects.backToHome")}</span>
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {t("projects.title")}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {backendText.projectsDescription}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 mr-2">
                <Input
                  placeholder={t("search.filterItems")}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setSearchQuery(searchKeyword);
                  }}
                  className="w-48 h-9"
                />
                <Button 
                  variant="outline" 
                  className="h-9 px-3"
                  onClick={() => setSearchQuery(searchKeyword)}
                >
                  <Search className="h-4 w-4 mr-2" />
                  {t("common.search")}
                </Button>
              </div>

              <Button 
                 variant="outline"
                 className="flex items-center gap-2"
                 onClick={handleExport}
              >
                 <Download className="h-4 w-4" />
                 {t("projects.export")}
              </Button>

              <Button 
                 variant={showTagsPanel ? "secondary" : "outline"} 
                 className="flex items-center gap-2"
                 onClick={() => setShowTagsPanel(!showTagsPanel)}
              >
                 <PanelRight className="h-4 w-4" />
                 {t("projects.categoryTags")}
              </Button>

              <Button
                onClick={handleAddProjectPy}
                disabled={isAddingProject}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {isAddingProject
                  ? t("projects.addingProject")
                  : t("projects.addProject")}
              </Button>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 pt-4">
          <div className="mt-6">
            {error ? (
              <p className="text-sm text-muted-foreground">{error}</p>
            ) : filteredProjects === null ? (
              <p className="text-sm text-muted-foreground">
                {t("projects.loadingProjects")}
              </p>
            ) : filteredProjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("projects.noProjectsFound")}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProjects.map((p) => (
                  <Card
                    key={p.sha256}
                    className="cursor-pointer transition hover:shadow relative group"
                  >
                    <div
                      className="p-4"
                      onClick={() => navigate(`/projects/${p.sha256}`)}
                    >
                      <div
                        className="font-medium text-sm truncate"
                        title={p.metadata.path}
                      >
                        {truncatePath(p.metadata.path)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground flex flex-col gap-0.5">
                        <span>
                          {t("projects.sha256Label")} {p.sha256.slice(0, 12)}...
                        </span>
                        <span>
                          {t("projects.nameLabel")} {p.metadata.friendly_name}
                        </span>
                        {p.metadata.first_used && (
                          <span>
                            {t("projects.firstUsedLabel")}{" "}
                            {new Date(p.metadata.first_used).toLocaleDateString()}
                          </span>
                        )}
                        {p.metadata.updated_at && (
                          <span>
                            {t("projects.lastUpdatedLabel")}{" "}
                            {new Date(p.metadata.updated_at).toLocaleDateString()}
                          </span>
                        )}
                        {p.tags && p.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {p.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs px-1 py-0">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {selectedTag === "All" ? (
                         <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-200 hover:text-yellow-500"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Star className={`h-4 w-4 ${p.tags && p.tags.length > 0 ? "fill-yellow-500 text-yellow-500" : ""}`} />
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                             {tags.length === 0 ? (
                               <DropdownMenuItem disabled>{t("projects.noTagsAvailable")}</DropdownMenuItem>
                             ) : (
                               tags.map(tag => (
                                 <DropdownMenuItem 
                                   key={tag} 
                                   onClick={(e) => handleToggleProjectTag(p.sha256, tag, e as any)}
                                 >
                                   <div className="flex items-center gap-2 w-full">
                                     <div className={`w-2 h-2 rounded-full ${p.tags?.includes(tag) ? "bg-primary" : "bg-transparent border border-gray-300"}`} />
                                     {tag}
                                   </div>
                                 </DropdownMenuItem>
                               ))
                             )}
                           </DropdownMenuContent>
                         </DropdownMenu>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-200 hover:text-yellow-500"
                          onClick={(e) => handleToggleProjectTag(p.sha256, selectedTag, e)}
                          title={t("projects.toggleTag")}
                        >
                           <Star className={`h-4 w-4 ${p.tags?.includes(selectedTag) ? "fill-yellow-500 text-yellow-500" : ""}`} />
                        </Button>
                      )}
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-400 hover:bg-gray-200 hover:text-red-500"
                            onClick={(e) => e.stopPropagation()}
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{t("common.delete")}</DialogTitle>
                            <DialogDescription>
                              {t("projects.deleteProjectConfirm", {
                                name: p.metadata.friendly_name,
                              })}
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <DialogClose asChild>
                              <Button variant="outline">
                                {t("common.cancel")}
                              </Button>
                            </DialogClose>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeleteProject(p.sha256)}
                            >
                              {t("common.delete")}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Tags Panel */}
      {showTagsPanel && (
        <div className="w-64 flex flex-col border-l border-border bg-background transition-all duration-300">
           {/* Header */}
           <div className="flex items-center justify-between p-4 border-b border-border h-14">
              <span className="font-semibold">{t("projects.categoryTags")}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowTagsPanel(false)}>
                 <X className="h-4 w-4" />
              </Button>
           </div>
           
           {/* Tags List */}
           <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                 {/* "All" Tag */}
                 <div 
                    className={cn("flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm", selectedTag === "All" ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
                    onClick={() => setSelectedTag("All")}
                 >
                    <Layers className="h-4 w-4" />
                    <span>{t("projects.all")}</span>
                 </div>
                 
                 {/* Dynamic Tags */}
                 {tags.map(tag => (
                    <ContextMenu key={tag}>
                      <ContextMenuTrigger>
                        <div 
                          className={cn("flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors text-sm", selectedTag === tag ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")}
                          onClick={() => setSelectedTag(tag)}
                        >
                          <TagIcon className="h-4 w-4" />
                          <span className="flex-1 truncate">{tag}</span>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onClick={() => handleDeleteTag(tag)} className="text-red-500">
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t("common.delete")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                 ))}
              </div>
           </ScrollArea>

           {/* Add Tag Footer */}
           <div className="p-2 border-t border-border">
              <div className="flex gap-2">
                 <Input 
                   placeholder={t("projects.newTagName")} 
                   value={newTag} 
                   onChange={(e) => setNewTag(e.target.value)}
                   onKeyDown={(e) => {
                     if (e.key === 'Enter') handleAddTag();
                   }}
                   className="h-8 text-xs"
                 />
                 <Button onClick={handleAddTag} size="sm" className="h-8 w-8 p-0">
                   <Plus className="h-4 w-4" />
                 </Button>
              </div>
           </div>
        </div>
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("projects.export")}</DialogTitle>
            <DialogDescription>
              {t("projects.exportSuccess", "复制到剪贴板成功")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto mt-4 bg-muted/50 p-4 rounded-md font-mono text-sm whitespace-pre-wrap">
            {exportContent}
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleSaveExportToCurrentDir} disabled={isSavingExport}>
              {t("projects.saveToCurrentDir", "保存到当前目录")}
            </Button>
            <Button variant="outline" onClick={handleSaveExportAs} disabled={isSavingExport}>
              {t("projects.saveAs", "另存为")}
            </Button>
            <Button
              onClick={() => {
                navigator.clipboard.writeText(exportContent).then(() => {
                  toast.success(t("projects.exportSuccess", "复制到剪贴板成功"));
                }).catch((err) => {
                  console.error("Failed to copy to clipboard", err);
                  toast.error(t("projects.exportFailed", "复制到剪贴板失败"));
                });
              }}
            >
              {t("common.copy", "复制")}
            </Button>
            <DialogClose asChild>
              <Button variant="outline">{t("common.close", "关闭")}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
