import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Copy, FolderOpen, X } from "lucide-react";
import { api } from "../lib/api";
import { EnrichedProject, SkillSearchHit } from "../lib/webApi";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { MarkdownRenderer } from "../components/common/MarkdownRenderer";
import { cn } from "../lib/utils";

function normalizeSkillName(value: string): string {
  return (value || "").trim();
}

function uniqSorted(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = normalizeSkillName(v);
    if (s) set.add(s);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export default function SkillsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);
  const [globalSkills, setGlobalSkills] = React.useState<string[]>([]);
  const [projects, setProjects] = React.useState<EnrichedProject[]>([]);
  const [activeSkill, setActiveSkill] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [rightTab, setRightTab] = React.useState<"content" | "projects">("content");
  const [skillDoc, setSkillDoc] = React.useState<{ path: string; content: string } | null>(null);
  const [isSkillDocLoading, setIsSkillDocLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchMode, setSearchMode] = React.useState<"name" | "content" | "all">("name");
  const [searchHits, setSearchHits] = React.useState<SkillSearchHit[] | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);

  const allSkills = React.useMemo(() => {
    const projectSkills: string[] = [];
    for (const p of projects) {
      for (const s of p.skills || []) {
        projectSkills.push(s);
      }
    }
    return uniqSorted([...globalSkills, ...projectSkills]);
  }, [globalSkills, projects]);

  const activeProjects = React.useMemo(() => {
    if (!activeSkill) return [];
    return projects.filter((p) => (p.skills || []).includes(activeSkill));
  }, [activeSkill, projects]);

  const activeProjectPath = React.useMemo(() => {
    const p = activeProjects[0];
    return p?.root_path || p?.metadata?.path || "";
  }, [activeProjects]);

  const hitIndex = React.useMemo(() => {
    const m = new Map<string, SkillSearchHit>();
    for (const h of searchHits || []) {
      if (!h?.skill) continue;
      m.set(h.skill, h);
    }
    return m;
  }, [searchHits]);

  const displaySkills = React.useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return allSkills;
    if (searchMode === "name") {
      const qFold = q.toLocaleLowerCase();
      return allSkills.filter((s) => s.toLocaleLowerCase().includes(qFold));
    }
    const out: string[] = [];
    const seen = new Set<string>();
    for (const h of searchHits || []) {
      const s = normalizeSkillName(h.skill);
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }, [allSkills, searchHits, searchMode, searchQuery]);

  const selectedSkills = React.useMemo(() => {
    return Object.entries(selected)
      .filter(([, v]) => !!v)
      .map(([k]) => k)
      .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  }, [selected]);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [skills, enrichedProjects] = await Promise.all([
        api.get_skills(),
        api.list_enriched_projects(),
      ]);
      setGlobalSkills(skills || []);
      setProjects(enrichedProjects || []);
    } catch (e) {
      console.error("Failed to load skills/projects", e);
      toast.error(t("skills.failedToLoad", "加载 Skills 失败"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (activeSkill && displaySkills.includes(activeSkill)) return;
    setActiveSkill(displaySkills.length > 0 ? displaySkills[0] : null);
  }, [activeSkill, displaySkills]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeSkill) {
        setSkillDoc(null);
        return;
      }
      setIsSkillDocLoading(true);
      try {
        const res = await api.get_skill_content({
          skill: activeSkill,
          projectPath: activeProjectPath || undefined,
        });
        if (!cancelled) {
          setSkillDoc(res || null);
        }
      } catch (e) {
        if (!cancelled) setSkillDoc(null);
      } finally {
        if (!cancelled) setIsSkillDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectPath, activeSkill]);

  React.useEffect(() => {
    const q = searchQuery.trim();
    if (!q || searchMode === "name") {
      setSearchHits(null);
      setIsSearching(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await api.search_skills({ q, mode: searchMode });
        if (!cancelled) {
          setSearchHits(res || []);
        }
      } catch (e) {
        if (!cancelled) setSearchHits([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [searchMode, searchQuery]);

  const handleToggleSelected = React.useCallback((skill: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      const current = !!next[skill];
      if (current) {
        delete next[skill];
      } else {
        next[skill] = true;
      }
      return next;
    });
  }, []);

  const handleCopySelected = React.useCallback(async () => {
    if (selectedSkills.length === 0) {
      toast.error(t("skills.noSkillsSelected", "请先勾选 Skills"));
      return;
    }
    try {
      const folders = await api.resolve_skill_folders({ skills: selectedSkills });
      if (!folders || folders.length === 0) {
        toast.error(t("skills.copyFolderNotFound", "未找到可复制的 Skill 文件夹"));
        return;
      }
      const ok = await api.set_clipboard_content({ type: "files", content: folders });
      if (ok) {
        toast.success(t("skills.copiedFolders", "已复制 Skill 文件夹到剪贴板"));
        return;
      }
      const textOk = await api.set_clipboard_content({
        type: "text",
        content: folders.join("\n"),
      });
      if (textOk) {
        toast.success(t("skills.copiedFolderPaths", "已复制 Skill 文件夹路径到剪贴板"));
      } else {
        toast.error(t("skills.copyFailed", "复制失败"));
      }
    } catch (e) {
      console.error("Failed to copy skills", e);
      toast.error(t("skills.copyFailed", "复制失败"));
    }
  }, [selectedSkills, t]);

  const handleClearSelected = React.useCallback(() => {
    setSelected({});
  }, []);

  const handleOpenGlobalSkillsFolder = React.useCallback(async () => {
    try {
      const res = await api.open_global_skills_folder();
      if (!res.ok) {
        toast.error(t("skills.openGlobalFolderFailed", "打开全局 Skill 文件夹失败"));
      }
    } catch (e) {
      console.error("Failed to open global skills folder", e);
      toast.error(t("skills.openGlobalFolderFailed", "打开全局 Skill 文件夹失败"));
    }
  }, [t]);

  const handleRemoveSkillFromProject = React.useCallback(
    async (projectId: string, skill: string) => {
      try {
        const result = await api.remove_project_skill({ projectId, skill });
        setProjects((prev) =>
          prev.map((p) =>
            p.sha256 === projectId ? { ...p, skills: result.skills || [] } : p
          )
        );
        toast.success(t("skills.removedFromProject", "已从项目移除"));
      } catch (e) {
        console.error("Failed to remove skill from project", e);
        toast.error(t("skills.removeFailed", "移除失败"));
      }
    },
    [t]
  );

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mx-auto w-full max-w-6xl px-6 py-8 flex-1 flex flex-col overflow-hidden">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition cursor-pointer"
            aria-label={t("navigation.backToHome")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>{t("navigation.backToHome")}</span>
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold mb-2">
                {t("skills.title", "Skills 管理")}
              </h1>
              <p className="text-muted-foreground">
                {t(
                  "skills.description",
                  "抽取全局与各项目的 Skills，去重展示；右侧查看对应项目，项目可右键移除。"
                )}
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("skills.searchPlaceholder", "搜索 Skills")}
                className="w-72"
              />
              <Select
                value={searchMode}
                onValueChange={(v) =>
                  setSearchMode((v as "name" | "content" | "all") || "name")
                }
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">
                    {t("skills.searchModeName", "名称")}
                  </SelectItem>
                  <SelectItem value="content">
                    {t("skills.searchModeContent", "内容")}
                  </SelectItem>
                  <SelectItem value="all">{t("skills.searchModeAll", "全部")}</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleOpenGlobalSkillsFolder}
                className="flex items-center gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                {t("skills.openGlobalFolder", "打开全局 Skill 文件夹")}
              </Button>
              <Button variant="outline" onClick={refresh} disabled={isLoading}>
                {t("common.refresh", "刷新")}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 min-h-0 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {t("skills.allSkills", "全部 Skills")}
              </div>
              <div className="text-sm text-muted-foreground">
                {displaySkills.length}
              </div>
            </div>
            <div className="mt-3 flex-1 min-h-0">
              <ScrollArea className="h-full">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("common.loading")}
                  </div>
                ) : isSearching ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("common.loading")}
                  </div>
                ) : displaySkills.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("skills.empty", "暂无 Skills")}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {displaySkills.map((skill) => {
                      const checked = !!selected[skill];
                      const isActive = activeSkill === skill;
                      const hit = hitIndex.get(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => setActiveSkill(skill)}
                          className={cn(
                            "w-full flex items-start gap-3 px-2 py-2 rounded-md text-left hover:bg-accent transition",
                            isActive && "bg-accent"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="truncate">{skill}</div>
                            {hit?.snippet ? (
                              <div className="text-xs text-muted-foreground truncate">
                                {hit.snippet}
                              </div>
                            ) : null}
                          </div>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => handleToggleSelected(skill)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={t("skills.selectSkill", "选择 Skill")}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="pt-3 mt-3 border-t flex items-center justify-between gap-2">
              <div className="text-sm text-muted-foreground truncate">
                {selectedSkills.length > 0
                  ? t("skills.selectedCount", { count: selectedSkills.length })
                  : t("skills.selectedNone", "未选择")}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearSelected}
                  disabled={selectedSkills.length === 0}
                  title={t("common.clear")}
                >
                  <X className="h-4 w-4" />
                </Button>
                <Button
                  onClick={handleCopySelected}
                  disabled={selectedSkills.length === 0}
                  className="flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  {t("skills.copyFolders", "复制文件夹")}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-4 min-h-0 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-md bg-muted p-1">
                <Button
                  type="button"
                  variant={rightTab === "content" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setRightTab("content")}
                >
                  {t("skills.tabContent", "内容")}
                </Button>
                <Button
                  type="button"
                  variant={rightTab === "projects" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setRightTab("projects")}
                >
                  {t("skills.tabProjects", "对应项目")}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground truncate">
                {rightTab === "projects"
                  ? (activeSkill ? activeProjects.length : 0)
                  : ""}
              </div>
            </div>
            <div className="mt-3 flex-1 min-h-0">
              <ScrollArea className="h-full">
                {rightTab === "content" ? (
                  !activeSkill ? (
                    <div className="text-sm text-muted-foreground p-2">
                      {t("skills.pickOne", "请选择一个 Skill")}
                    </div>
                  ) : isSkillDocLoading ? (
                    <div className="text-sm text-muted-foreground p-2">
                      {t("common.loading")}
                    </div>
                  ) : !skillDoc?.content ? (
                    <div className="text-sm text-muted-foreground p-2">
                      {t("skills.noContent", "未找到该 Skill 的内容")}
                    </div>
                  ) : (
                    <div className="space-y-3 p-2">
                      {skillDoc.path ? (
                        <div className="text-xs text-muted-foreground font-mono break-all">
                          {skillDoc.path}
                        </div>
                      ) : null}
                      <MarkdownRenderer>{skillDoc.content}</MarkdownRenderer>
                    </div>
                  )
                ) : !activeSkill ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("skills.pickOne", "请选择一个 Skill")}
                  </div>
                ) : activeProjects.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("skills.noProjects", "暂无项目使用该 Skill")}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeProjects.map((p) => {
                      const title =
                        p.metadata?.friendly_name || p.metadata?.path || p.sha256;
                      const path = p.metadata?.path || p.root_path;
                      return (
                        <ContextMenu key={p.sha256}>
                          <ContextMenuTrigger asChild>
                            <div className="rounded-md border px-3 py-2 hover:bg-accent transition cursor-default">
                              <div
                                className="text-sm font-medium truncate"
                                title={title}
                              >
                                {title}
                              </div>
                              <div
                                className="text-xs text-muted-foreground font-mono truncate"
                                title={path}
                              >
                                {path}
                              </div>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuItem
                              onClick={() =>
                                handleRemoveSkillFromProject(p.sha256, activeSkill)
                              }
                            >
                              {t("skills.removeFromProject", "从该项目移除")}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
