import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FolderTree, Settings as SettingsIcon, History, MessageSquarePlus, Play, Sparkles } from "lucide-react";
import { SmartLogo } from "../branding/SmartLogo";
import { DesktopText } from "../branding/DesktopText";
import { ModelContextProtocol } from "../common/ModelContextProtocol";
import { SidebarTrigger } from "../ui/sidebar";
import { Button } from "../ui/button";
import { api } from "../../lib/api";

interface AppHeaderProps {
  onDirectoryPanelToggle?: () => void;
  isDirectoryPanelOpen?: boolean;
  onVersionPanelToggle?: () => void;
  isVersionPanelOpen?: boolean;
  hasActiveConversation?: boolean;
  showDirectoryButton?: boolean;
  onReturnToDashboard?: () => void;
  onOpenSettings?: () => void;
  onNewChat?: () => void;
  currentProjectPath?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onDirectoryPanelToggle,
  isDirectoryPanelOpen = false,
  onVersionPanelToggle,
  isVersionPanelOpen = false,
  hasActiveConversation = false,
  showDirectoryButton,
  onReturnToDashboard,
  onOpenSettings,
  onNewChat,
  currentProjectPath,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const shouldShowDirectoryButton =
    showDirectoryButton !== undefined
      ? showDirectoryButton
      : hasActiveConversation;

  const handleLogoClick = () => {
    if (hasActiveConversation && onReturnToDashboard) {
      onReturnToDashboard();
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 flex-shrink-0">
      <div className="px-3 sm:px-6 py-2 sm:py-4">
        <div className="flex items-center w-full">
          {/* Left section - Sidebar trigger + Desktop Logo */}
          <div className="flex items-center gap-1 sm:gap-3">
            <SidebarTrigger />
            <div
              className={`flex items-center gap-1 ${
                hasActiveConversation
                  ? "cursor-pointer hover:opacity-80 transition-opacity"
                  : ""
              }`}
              onClick={handleLogoClick}
              title={
                hasActiveConversation
                  ? t("header.returnToDashboard")
                  : undefined
              }
            >
              <SmartLogo />
              <DesktopText size="small" />
              {hasActiveConversation && (
                <span className="text-xs text-muted-foreground ml-2 hidden sm:inline-block">
                  {t("header.clickToReturnHome")}
                </span>
              )}
            </div>
          </div>

          {/* Center section - Empty spacer */}
          <div className="flex-1"></div>

          {/* Right section - Settings + Directory Toggle */}
          <div className="flex items-center justify-end gap-1 sm:gap-2 ml-auto">
            {onNewChat && shouldShowDirectoryButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewChat}
                title={t("directoryPanel.newConversation", "New Conversation in this folder")}
              >
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            )}
            {onDirectoryPanelToggle && shouldShowDirectoryButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onDirectoryPanelToggle}
                className={`${isDirectoryPanelOpen ? "bg-muted" : ""}`}
                title={t("directoryPanel.title", "Files")}
              >
                <FolderTree className="h-4 w-4" />
              </Button>
            )}
            {onVersionPanelToggle && shouldShowDirectoryButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onVersionPanelToggle}
                className={`${isVersionPanelOpen ? "bg-muted" : ""}`}
                title="Version History"
              >
                <History className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (currentProjectPath) {
                  api.launch_qwen_mcp({ path: currentProjectPath });
                } else {
                  api.launch_qwen_mcp();
                }
              }}
              title={t("directoryPanel.launchQwen", "Launch Qwen MCP")}
            >
              <Play className="h-4 w-4" />
            </Button>
            {onOpenSettings && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                title={t("common.settings", "Settings")}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <SettingsIcon className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/mcp")}
              title={t("dashboard.mcpCard.title", "MCP Settings")}
            >
              <ModelContextProtocol className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/skills")}
              title={t("skills.title", "Skills 管理")}
            >
              <Sparkles className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
