import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, ClipboardPaste, Copy, X } from "lucide-react";
import { api } from "../lib/api";
import { EnrichedProject } from "../lib/webApi";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
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
  const [importTargetProjectId, setImportTargetProjectId] = React.useState<string | null>(null);
  const [rightTab, setRightTab] = React.useState<"content" | "projects">("content");
  const [skillDoc, setSkillDoc] = React.useState<{ path: string; content: string } | null>(null);
  const [isSkillDocLoading, setIsSkillDocLoading] = React.useState(false);

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
    if (activeSkill && allSkills.includes(activeSkill)) return;
    setActiveSkill(allSkills.length > 0 ? allSkills[0] : null);
  }, [activeSkill, allSkills]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeSkill) {
        setSkillDoc(null);
        return;
      }
      setIsSkillDocLoading(true);
      try {
        const res = await api.get_skill_content({ skill: activeSkill });
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
  }, [activeSkill]);

  React.useEffect(() => {
    if (importTargetProjectId) {
      const exists = projects.some((p) => p.sha256 === importTargetProjectId);
      if (exists) return;
    }
    setImportTargetProjectId(projects.length > 0 ? projects[0].sha256 : null);
  }, [importTargetProjectId, projects]);

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
    const content = selectedSkills.join("\n");
    try {
      const ok = await api.set_clipboard_content({ type: "text", content });
      if (ok) {
        toast.success(t("skills.copied", "已复制到剪贴板"));
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

  const parseSkillsFromClipboardText = React.useCallback((text: string): string[] => {
    const items = (text || "")
      .split(/\r?\n|,|，|;|；/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return uniqSorted(items);
  }, []);

  const handleImportFromClipboard = React.useCallback(async () => {
    if (!importTargetProjectId) {
      toast.error(t("skills.noImportTarget", "请先选择要导入的项目"));
      return;
    }
    try {
      const clip = await api.get_clipboard_content();
      if (!clip || clip.type !== "text" || typeof clip.content !== "string") {
        toast.error(t("skills.clipboardEmpty", "剪贴板没有可用的文本"));
        return;
      }
      const skills = parseSkillsFromClipboardText(clip.content);
      if (skills.length === 0) {
        toast.error(t("skills.clipboardNoSkills", "剪贴板文本中未解析到 Skills"));
        return;
      }
      const result = await api.import_project_skills({
        projectId: importTargetProjectId,
        skills,
      });
      setProjects((prev) =>
        prev.map((p) =>
          p.sha256 === importTargetProjectId
            ? { ...p, skills: result.skills || [] }
            : p
        )
      );
      const latestGlobal = await api.get_skills();
      setGlobalSkills(latestGlobal || []);
      toast.success(
        t("skills.imported", { count: skills.length })
      );
    } catch (e) {
      console.error("Failed to import skills from clipboard", e);
      toast.error(t("skills.importFailed", "导入失败"));
    }
  }, [importTargetProjectId, parseSkillsFromClipboardText, t]);

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
              <Select
                value={importTargetProjectId || ""}
                onValueChange={(v) => setImportTargetProjectId(v || null)}
                disabled={projects.length === 0}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder={t("skills.selectProject", "选择要导入的项目")} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.sha256} value={p.sha256}>
                      {p.metadata?.friendly_name || p.metadata?.path || p.sha256}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="secondary"
                onClick={handleImportFromClipboard}
                disabled={projects.length === 0 || isLoading}
                className="flex items-center gap-2"
              >
                <ClipboardPaste className="h-4 w-4" />
                {t("skills.importFromClipboard", "从剪贴板导入到项目")}
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
                {allSkills.length}
              </div>
            </div>
            <div className="mt-3 flex-1 min-h-0">
              <ScrollArea className="h-full">
                {isLoading ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("common.loading")}
                  </div>
                ) : allSkills.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">
                    {t("skills.empty", "暂无 Skills")}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {allSkills.map((skill) => {
                      const checked = !!selected[skill];
                      const isActive = activeSkill === skill;
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => setActiveSkill(skill)}
                          className={cn(
                            "w-full flex items-center gap-3 px-2 py-2 rounded-md text-left hover:bg-accent transition",
                            isActive && "bg-accent"
                          )}
                        >
                          <span className="flex-1 truncate">{skill}</span>
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
                  {t("common.copy")}
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
