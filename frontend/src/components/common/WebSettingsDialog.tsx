import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Copy, Globe, Shield, Server, CheckCircle2 } from "lucide-react";

interface WebSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const WebSettingsDialog: React.FC<WebSettingsDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const [webEnabled, setWebEnabled] = useState(false);
  const [webRemoteAccess, setWebRemoteAccess] = useState(false);
  const [webUsername, setWebUsername] = useState("lizhuang");
  const [webPassword, setWebPassword] = useState("lizhuang");
  const [webPort, setWebPort] = useState("1858");
  const [webAddress, setWebAddress] = useState("");

  // Re-calculate web address when port changes
  useEffect(() => {
    if (!open) return;
    
    // 始终使用 localhost
    const ip = "localhost";
    setWebAddress(`http://${ip}:${webPort}`);
  }, [webPort, open]);

  useEffect(() => {
    if (open) {
      // Load UI settings
      const loadSettings = async () => {
        try {
          const settings = await api.get_ui_settings();
          if (settings) {
            if (settings.webEnabled !== undefined) setWebEnabled(settings.webEnabled);
            if (settings.webRemoteAccess !== undefined) setWebRemoteAccess(settings.webRemoteAccess);
            if (settings.webUsername) setWebUsername(settings.webUsername);
            if (settings.webPassword) setWebPassword(settings.webPassword);
            if (settings.webPort) setWebPort(settings.webPort);
          }
        } catch (e) {
          console.error("Failed to load web settings:", e);
        }
      };
      
      loadSettings();
    }
  }, [open]);

  const handleSave = async () => {
    try {
      await api.save_ui_settings({
        webEnabled,
        webRemoteAccess,
        webUsername,
        webPassword,
        webPort
      });
      toast.success("Web 设置已保存");
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to save web settings:", e);
      toast.error("保存失败");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-slate-50 dark:bg-zinc-950 p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="px-6 py-4 bg-white dark:bg-zinc-900 border-b">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            Web 访问设置
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
          {/* Card 1: WebUI Control */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50/50 dark:bg-zinc-900/50 border-b">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                <Globe className="w-4 h-4" />
                启用 WebUI 后，你可以通过手机或远程浏览器访问应用。
              </div>
            </div>

            <div className="divide-y">
              {/* Enable WebUI */}
              <div className="flex items-center justify-between p-5 hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="font-medium">启用 WebUI</div>
                  {webEnabled && (
                    <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      运行中
                    </div>
                  )}
                </div>
                <Switch
                  checked={webEnabled}
                  onCheckedChange={setWebEnabled}
                />
              </div>

              {/* Access Address */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 gap-4 hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="font-medium whitespace-nowrap">访问地址</div>
                <div className="flex items-center justify-end w-full">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 rounded-md text-sm font-mono break-all max-w-full">
                    {webAddress}
                    <button
                      type="button"
                      className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-md transition-colors shrink-0"
                      onClick={() => {
                        navigator.clipboard.writeText(webAddress);
                        toast.success("已复制到剪贴板");
                      }}
                      title="复制地址"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Allow Remote Access */}
              <div className="flex items-center justify-between p-5 hover:bg-slate-50/50 dark:hover:bg-zinc-800/50 transition-colors">
                <div className="space-y-1">
                  <div className="font-medium">允许远程访问</div>
                  <div className="text-sm text-muted-foreground">
                    允许公网设备访问 (需自行配置内网穿透或端口映射)
                  </div>
                </div>
                <Switch
                  checked={webRemoteAccess}
                  onCheckedChange={setWebRemoteAccess}
                />
              </div>
            </div>
          </div>

          {/* Card 2: Login Information */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center gap-2 font-medium">
              <Shield className="w-4 h-4 text-slate-500" />
              登录信息与网络
            </div>
            
            <div className="p-5 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="web-username">登录名称</Label>
                  <Input
                    id="web-username"
                    value={webUsername}
                    onChange={(e) => setWebUsername(e.target.value)}
                    placeholder="请输入登录名称"
                    className="bg-slate-50 dark:bg-zinc-800"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="web-password">登录密码</Label>
                  <Input
                    id="web-password"
                    type="password"
                    value={webPassword}
                    onChange={(e) => setWebPassword(e.target.value)}
                    placeholder="请输入登录密码"
                    className="bg-slate-50 dark:bg-zinc-800"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-dashed">
                <div className="space-y-2 max-w-[240px]">
                  <Label htmlFor="web-port" className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-500" />
                    端口号
                  </Label>
                  <Input
                    id="web-port"
                    type="number"
                    min={1024}
                    max={65535}
                    value={webPort}
                    onChange={(e) => setWebPort(e.target.value)}
                    placeholder="默认 1858"
                    className="bg-slate-50 dark:bg-zinc-800 font-mono"
                  />
                  <p className="text-xs text-amber-600 dark:text-amber-500">修改端口号需要重启应用后生效</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-900 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            保存设置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
