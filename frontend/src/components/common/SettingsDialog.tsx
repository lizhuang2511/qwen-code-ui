import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ChevronsUpDown, Check, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useBackend, useBackendConfig } from "@/contexts/BackendContext";
import { useSettings } from "@/contexts/SettingsContext";
import { GeminiAuthMethod, LLxprtProvider } from "@/types/backend";

interface ModelProvider {
  id: string;
  name: string;
  url: string;
  env_key?: string;
  models: string[];
}

// Add global type definition for pywebview
declare global {
  interface Window {
    pywebview?: {
      api: {
        get_model_providers: () => Promise<{ providers: ModelProvider[] }>;
        get_qwen_settings: () => Promise<any>;
        update_qwen_settings: (params: {
          provider_id: string;
          provider_name?: string;
          base_url: string;
          api_key: string;
          env_key?: string;
          use_oauth?: boolean;
          enable_thinking?: boolean;
        }) => Promise<{ ok: boolean; error?: string }>;
        open_qwen_settings_in_editor: () => Promise<{ ok: boolean; error?: string }>;
        open_qwen_folder: () => Promise<{ ok: boolean; error?: string }>;
        open_model_providers_json: () => Promise<{ ok: boolean; error?: string }>;
        test_connection: (params: { base_url: string; api_key: string; model: string }) => Promise<{ ok: boolean; data?: any; error?: string }>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      };
    };
  }
}

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelChange?: (model: string) => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onOpenChange,
  onModelChange,
}) => {
  const { t, i18n } = useTranslation();
  const { replyFontSize, setReplyFontSize } = useSettings();
  const { selectedBackend, switchBackend } = useBackend();
  const { config: qwenConfig, updateConfig: updateQwenConfig } =
    useBackendConfig("qwen");
  const { config: geminiConfig, updateConfig: updateGeminiConfig } =
    useBackendConfig("gemini");
  const { config: llxprtConfig, updateConfig: updateLLxprtConfig } =
    useBackendConfig("llxprt");

  const [jsonProviders, setJsonProviders] = useState<ModelProvider[]>([]);
  const [showQwenApiKey, setShowQwenApiKey] = useState(false);
  const [showLlxprtApiKey, setShowLlxprtApiKey] = useState(false);
  
  // Store full settings file content to look up keys when switching providers
  const [qwenSettingsFile, setQwenSettingsFile] = useState<any>(null);

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        // 1. Fetch Providers
        try {
          if (window.pywebview?.api?.get_model_providers) {
            console.log("Fetching model providers via pywebview API");
            const data = await window.pywebview.api.get_model_providers();
            if (data.providers) {
              setJsonProviders(data.providers);
            }
          } else {
             // Fallback fetch
             const baseUrl = "http://127.0.0.1:1858";
             const res = await fetch(`${baseUrl}/api/model-providers`);
             const data = await res.json();
             if (data.providers) setJsonProviders(data.providers);
          }
        } catch (e) {
          console.error("Failed to load model providers", e);
        }

        // 2. Fetch Qwen Settings
        try {
          if (window.pywebview?.api?.get_qwen_settings) {
            const settings = await window.pywebview.api.get_qwen_settings();
            console.log("Loaded Qwen Settings:", settings);
            setQwenSettingsFile(settings);
            
            // Sync current config with settings file if applicable
            if (settings && settings.security?.auth?.selectedType) {
              const authType = settings.security.auth.selectedType;
              const isOAuth = authType === "qwen-oauth";
              
              if (isOAuth) {
                updateQwenConfig({
                  useOAuth: true,
                  model: "coder-model"
                });
              } else if (settings.model && settings.model.name) {
                const providers = settings.modelProviders?.openai || [];
                const activeProviderId = settings.model.name;
                const activeProviderConfig = providers.find((p: any) => p.id === activeProviderId);
                
                if (activeProviderConfig) {
                  const envKey = activeProviderConfig.envKey;
                  const apiKey = settings.env?.[envKey] || "";
                  const isThinking = activeProviderConfig.generationConfig?.extra_body?.enable_thinking === true;
                  
                  updateQwenConfig({
                    baseUrl: activeProviderConfig.baseUrl,
                    apiKey: apiKey,
                    model: activeProviderId,
                    useOAuth: false,
                    enableThinking: isThinking
                  });
                } else {
                  // Fallback if we have a model name but no specific provider match
                  updateQwenConfig({
                    model: activeProviderId,
                    useOAuth: false
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to load qwen settings", e);
        }
      };
      
      fetchData();
    }
  }, [open]);

  const saveSettingsToQwenConfig = async () => {
    // Determine current provider info
    // If custom, we use "custom" as ID?
    // We need to find the provider ID corresponding to current URL
    const currentProvider = jsonProviders.find(p => p.url === qwenConfig.baseUrl);
    const providerName = currentProvider ? currentProvider.name : "Custom";
    // Let backend generate the envKey to ensure uniqueness
    const envKey = currentProvider && currentProvider.env_key ? currentProvider.env_key : undefined;
    
    // Use the specific model selected if possible, or the provider ID if it's a "presets" style
    // The provider_id passed to backend should be `qwenConfig.model`.
    
    const targetModelId = qwenConfig.useOAuth ? "coder-model" : (qwenConfig.model || "custom-model");
    
    try {
      if (window.pywebview?.api?.update_qwen_settings) {
        const res = await window.pywebview.api.update_qwen_settings({
          provider_id: targetModelId,
          provider_name: providerName, 
          base_url: qwenConfig.baseUrl,
          api_key: qwenConfig.apiKey,
          env_key: envKey, // Undefined if custom, triggering backend auto-generation
          use_oauth: qwenConfig.useOAuth,
          enable_thinking: qwenConfig.enableThinking
        });
        
        if (res.ok) {
          toast.success(`Settings saved to ~/.qwen/settings.json`);
        } else {
          toast.error(`Failed to save: ${res.error || "Unknown error"}`);
        }
      } else {
        toast.error("Native settings API not available");
      }
    } catch (e) {
      console.error("Failed to save settings", e);
      toast.error("Failed to save settings");
    }
  };


  const testConnection = async (baseUrl: string, apiKey: string, model: string) => {
    if (!baseUrl || !apiKey) {
      toast.error("Please provide both Base URL and API Key");
      return;
    }
    
    // Strip trailing slash if present
    const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    
    const toastId = toast.loading("Testing connection...");
    try {
      if (window.pywebview?.api?.test_connection) {
        const res = await window.pywebview.api.test_connection({
          base_url: url,
          api_key: apiKey,
          model: model || "test-model"
        });
        
        if (res.ok) {
          toast.success("Connection successful!", { id: toastId });
        } else {
          toast.error(`Connection failed: ${res.error || "Unknown error"}`, { id: toastId });
        }
        return;
      }

      // Use local proxy to avoid CORS issues from browser/pywebview
      const localBaseUrl = "http://127.0.0.1:1858";
      const res = await fetch(`${localBaseUrl}/api/test-connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          base_url: url,
          api_key: apiKey,
          model: model || "test-model"
        })
      });
      
      const data = await res.json();
      
      if (res.ok && data.ok) {
        toast.success("Connection successful!", { id: toastId });
      } else {
        const errorMsg = data.error || `${res.status} ${res.statusText}`;
        toast.error(`Connection failed: ${errorMsg}`, { id: toastId });
        console.error("Test connection failed:", data);
      }
    } catch (e) {
      toast.error(`Connection error: ${e instanceof Error ? e.message : String(e)}`, { id: toastId });
    }
  };

  // State for OpenRouter model fetching
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>(
    []
  );
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const comboboxRef = useRef<HTMLDivElement>(null);

  // New function to manually reload Qwen Settings from disk
  const reloadCurrentModel = async () => {
    try {
      if (window.pywebview?.api?.get_qwen_settings) {
        const toastId = toast.loading("Loading current model...");
        const settings = await window.pywebview.api.get_qwen_settings();
        setQwenSettingsFile(settings);
        
        if (settings && settings.security?.auth?.selectedType) {
          const authType = settings.security.auth.selectedType;
          const isOAuth = authType === "qwen-oauth";
          
          if (isOAuth) {
            updateQwenConfig({
              useOAuth: true,
              model: "coder-model"
            });
            toast.success("Loaded: OAuth (coder-model)", { id: toastId });
          } else if (settings.model && settings.model.name) {
            const providers = settings.modelProviders?.openai || [];
            const activeProviderId = settings.model.name;
            const activeProviderConfig = providers.find((p: any) => p.id === activeProviderId);
            
            if (activeProviderConfig) {
              const envKey = activeProviderConfig.envKey;
              const apiKey = settings.env?.[envKey] || "";
              const isThinking = activeProviderConfig.generationConfig?.extra_body?.enable_thinking === true;
              
              updateQwenConfig({
                baseUrl: activeProviderConfig.baseUrl,
                apiKey: apiKey,
                model: activeProviderId,
                useOAuth: false,
                enableThinking: isThinking
              });
              toast.success(`Loaded: ${activeProviderId}`, { id: toastId });
            } else {
              updateQwenConfig({
                model: activeProviderId,
                useOAuth: false
              });
              toast.success(`Loaded: ${activeProviderId} (Custom)`, { id: toastId });
            }
          } else {
             toast.info("No specific model found in settings", { id: toastId });
          }
        } else {
          toast.info("Could not read auth type from settings", { id: toastId });
        }
      } else {
         toast.error("Native API not available");
      }
    } catch (e) {
      console.error("Failed to load current model", e);
      toast.error("Failed to load current model");
    }
  };

  const openSettingsFile = async () => {
    try {
      if (window.pywebview?.api?.open_qwen_settings_in_editor) {
        const res = await window.pywebview.api.open_qwen_settings_in_editor();
        if (!res.ok) {
          toast.error(`Failed to open file: ${res.error}`);
        }
      } else {
        toast.error("Native API not available");
      }
    } catch (e) {
      console.error("Failed to open settings file", e);
      toast.error("Failed to open settings file");
    }
  };

  const openQwenFolder = async () => {
    try {
      if (window.pywebview?.api?.open_qwen_folder) {
        const res = await window.pywebview.api.open_qwen_folder();
        if (!res.ok) {
          toast.error(`Failed to open folder: ${res.error}`);
        }
      } else {
        toast.error("Native API not available");
      }
    } catch (e) {
      console.error("Failed to open folder", e);
      toast.error("Failed to open folder");
    }
  };

  const openModelProvidersJson = async () => {
    try {
      if (window.pywebview?.api?.open_model_providers_json) {
        const res = await window.pywebview.api.open_model_providers_json();
        if (!res.ok) {
          toast.error(`Failed to open file: ${res.error}`);
        }
      } else {
        toast.error("Native API not available");
      }
    } catch (e) {
      console.error("Failed to open model providers file", e);
      toast.error("Failed to open file");
    }
  };

  // Close combobox when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        comboboxRef.current &&
        !comboboxRef.current.contains(event.target as Node)
      ) {
        setComboboxOpen(false);
      }
    };

    if (comboboxOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [comboboxOpen]);

  // Model cache with timestamp
  const [modelCache, setModelCache] = useState<
    Record<
      string,
      {
        models: OpenRouterModel[];
        fetchedAt: number;
      }
    >
  >({});

  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const REQUEST_TIMEOUT = 10000; // 10 seconds

  // Fetch models from OpenRouter API with enhanced error handling and caching
  const fetchOpenRouterModels = useCallback(async () => {
    if (!llxprtConfig.apiKey) {
      toast.error("Please enter your OpenRouter API key first");
      return;
    }

    // Check cache first (use key prefix to avoid exposing full key)
    const cacheKey = llxprtConfig.apiKey.substring(0, 10);
    const cached = modelCache[cacheKey];
    if (cached && Date.now() - cached.fetchedAt < CACHE_DURATION) {
      setOpenRouterModels(cached.models);
      toast.success(`Loaded ${cached.models.length} models from cache`);
      return;
    }

    setIsFetchingModels(true);

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${llxprtConfig.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Invalid API key. Please check your OpenRouter API key."
          );
        } else if (response.status === 429) {
          throw new Error(
            "Rate limit exceeded. Please try again in a few minutes."
          );
        } else {
          throw new Error(`Failed to fetch models: ${response.statusText}`);
        }
      }

      const data = await response.json();
      const modelArray = Array.isArray(data) ? data : data.data || [];

      if (modelArray.length === 0) {
        toast.warning("No models found. This may be a temporary issue.");
        return;
      }

      const models: OpenRouterModel[] = modelArray.map(
        (
          model: OpenRouterModel & {
            id: string;
            name?: string;
            description?: string;
          }
        ) => ({
          id: model.id,
          name: model.name || model.id,
          description: model.description || "",
        })
      );

      setOpenRouterModels(models);

      // Update cache
      setModelCache((prev) => ({
        ...prev,
        [cacheKey]: {
          models,
          fetchedAt: Date.now(),
        },
      }));

      toast.success(`Loaded ${models.length} models from OpenRouter`);
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          toast.error(
            "Request timed out. Please check your internet connection."
          );
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Failed to fetch models. Please try again.");
      }
    } finally {
      setIsFetchingModels(false);
    }
  }, [llxprtConfig.apiKey, modelCache, CACHE_DURATION, REQUEST_TIMEOUT]);

  // Debounce to prevent spam clicking
  const debouncedFetchModels = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fetchOpenRouterModels();
      }, 300);
    };
  }, [fetchOpenRouterModels]);

  // Derive translations directly where needed; remove unused variable to satisfy TS

  return (
    <Dialog open={!!open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{t("common.settingsTab")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Language Selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {t("conversations.language")}
            </label>
            <Select
              value={i18n.language}
              onValueChange={(value) => {
                i18n.changeLanguage(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("conversations.selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="zh-CN">简体中文</SelectItem>
                <SelectItem value="zh-TW">繁體中文</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reply Font Size Input */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {t("conversations.replyFontSize")}
            </label>
            <Input
              type="number"
              min={10}
              max={40}
              value={replyFontSize}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  setReplyFontSize(val);
                }
              }}
              className="w-full"
            />
          </div>

          {/* Backend Selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              {t("conversations.backend")}
            </label>
            <Select
              value={selectedBackend}
              onValueChange={(value) => {
                switchBackend(value as "gemini" | "qwen" | "llxprt");
                // No-op for model change here; model is handled below
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("conversations.selectBackend")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">{t("backend.geminiCli")}</SelectItem>
                <SelectItem value="qwen">{t("backend.qwenCode")}</SelectItem>
                <SelectItem value="llxprt">LLxprt Code</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Qwen Code Configuration */}
          {selectedBackend === "qwen" && (
            <div className="space-y-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("backend.qwenConfiguration")}
              </h4>

              {/* OAuth Checkbox */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="oauth-checkbox"
                  checked={qwenConfig.useOAuth}
                  onCheckedChange={(checked) =>
                    updateQwenConfig({ useOAuth: checked === true })
                  }
                />
                <label
                  htmlFor="oauth-checkbox"
                  className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  {t("conversations.oauth")}
                </label>
              </div>

              {!qwenConfig.useOAuth && (
                <>
                  {/* Provider Selector for Qwen */}
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {t("conversations.provider")}
                    </label>
                    <Select
                      value={
                        jsonProviders.find((p) => p.url === qwenConfig.baseUrl)
                          ?.id || "custom"
                      }
                      onValueChange={async (value) => {
                        if (value === "custom") {
                          // keep current base url or clear? let's keep it
                          updateQwenConfig({ baseUrl: "", apiKey: "" });
                        } else {
                          const provider = jsonProviders.find(
                            (p) => p.id === value
                          );
                          if (provider) {
                            const updates: any = { baseUrl: provider.url, apiKey: "" }; // default to empty
                            if (
                              provider.models &&
                              provider.models.length > 0
                            ) {
                              updates.model = provider.models[0];
                            }
                            
                            // Try to find API Key in loaded Qwen Settings
                            if (qwenSettingsFile && provider.env_key) {
                                const key = qwenSettingsFile.env?.[provider.env_key];
                                if (key) {
                                    updates.apiKey = key;
                                }
                            }
                            
                            updateQwenConfig(updates);
                            if (updates.model) {
                              onModelChange?.(updates.model);
                            }
                          }
                        }
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {jsonProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {t("conversations.apiKey")}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showQwenApiKey ? "text" : "password"}
                          className="w-full pr-10"
                          value={qwenConfig.apiKey}
                          onChange={(e) =>
                            updateQwenConfig({
                              apiKey: e.target.value,
                            })
                          }
                          placeholder={t("conversations.apiKey")}
                        />
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                          onClick={() => setShowQwenApiKey(!showQwenApiKey)}
                        >
                          {showQwenApiKey ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={saveSettingsToQwenConfig}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          testConnection(qwenConfig.baseUrl, qwenConfig.apiKey, qwenConfig.model || "");
                        }}
                      >
                        Test
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {t("conversations.baseUrl")}
                    </label>
                    <Input
                      type="text"
                      value={qwenConfig.baseUrl}
                      onChange={(e) =>
                        updateQwenConfig({
                          baseUrl: e.target.value,
                        })
                      }
                      placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                      {t("conversations.model")}
                    </label>
                    <Select
                      value={
                        (
                          jsonProviders.find(
                            (p) => p.url === qwenConfig.baseUrl
                          )?.models || [
                            "qwen-max",
                            "qwen-plus",
                            "qwen-turbo",
                            "qwen-coder-plus",
                            "qwen-coder-turbo",
                          ]
                        ).includes(qwenConfig.model || "")
                          ? qwenConfig.model
                          : "custom"
                      }
                      onValueChange={(value) => {
                        if (value !== "custom") {
                          updateQwenConfig({ model: value });
                          onModelChange?.(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full mb-2">
                        <SelectValue placeholder="Select Model" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          jsonProviders.find(
                            (p) => p.url === qwenConfig.baseUrl
                          )?.models || [
                            "qwen-max",
                            "qwen-plus",
                            "qwen-turbo",
                            "qwen-coder-plus",
                            "qwen-coder-turbo",
                          ]
                        ).map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                        <SelectItem value="custom">Custom...</SelectItem>
                      </SelectContent>
                    </Select>

                    {(!(
                      jsonProviders.find((p) => p.url === qwenConfig.baseUrl)
                        ?.models || [
                        "qwen-max",
                        "qwen-plus",
                        "qwen-turbo",
                        "qwen-coder-plus",
                        "qwen-coder-turbo",
                      ]
                    ).includes(qwenConfig.model || "") ||
                      qwenConfig.model === "custom") && (
                      <Input
                        type="text"
                        value={qwenConfig.model}
                        onChange={(e) => {
                          const value = e.target.value;
                          updateQwenConfig({ model: value });
                          onModelChange?.(value || "qwen-max");
                        }}
                        placeholder="qwen-max"
                      />
                    )}
                  </div>

                  {/* YOLO Mode Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="qwen-yolo-checkbox"
                      checked={qwenConfig.yolo || false}
                      onCheckedChange={(checked) => {
                        updateQwenConfig({ yolo: checked === true });
                      }}
                    />
                    <label
                      htmlFor="qwen-yolo-checkbox"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      {t("conversations.yoloMode")}
                    </label>
                  </div>

                  {/* Thinking Mode Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="qwen-thinking-checkbox"
                      checked={qwenConfig.enableThinking || false}
                      onCheckedChange={(checked) => {
                        updateQwenConfig({ enableThinking: checked === true });
                      }}
                    />
                    <label
                      htmlFor="qwen-thinking-checkbox"
                      className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                    >
                      Enable Thinking Mode (e.g. for DeepSeek-R1)
                    </label>
                  </div>
                </>
              )}

              {/* YOLO Mode Checkbox for OAuth */}
              {qwenConfig.useOAuth && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="qwen-oauth-yolo-checkbox"
                    checked={qwenConfig.yolo || false}
                    onCheckedChange={(checked) => {
                      updateQwenConfig({ yolo: checked === true });
                    }}
                  />
                  <label
                    htmlFor="qwen-oauth-yolo-checkbox"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {t("conversations.yoloMode")}
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Gemini Configuration */}
          {selectedBackend === "gemini" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  {t("conversations.model")}
                </label>
                <Select
                  value={geminiConfig.defaultModel || "gemini-2.5-flash"}
                  onValueChange={(value) => {
                    updateGeminiConfig({ defaultModel: value });
                    onModelChange?.(value);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("conversations.selectModel")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-2.5-pro">
                      {t("backend.geminiModels.pro")}
                    </SelectItem>
                    <SelectItem value="gemini-2.5-flash">
                      {t("backend.geminiModels.flash")}
                    </SelectItem>
                    <SelectItem value="gemini-2.5-flash-lite">
                      <div className="flex items-center gap-2">
                        <span>{t("backend.geminiModels.flashLite")}</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t("backend.stillWaiting")}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gemini Authentication Configuration */}
              <div className="space-y-3 mt-2">
                {/* Authentication Method Selector */}
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                    {t("conversations.authMethod")}
                  </label>
                  <Select
                    value={geminiConfig.authMethod}
                    onValueChange={(value) =>
                      updateGeminiConfig({
                        authMethod: value as GeminiAuthMethod,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={t("conversations.selectAuthMethod")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oauth-personal">
                        <div className="flex flex-col">
                          <span>{t("backend.googleOAuth")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini-api-key">
                        <div className="flex flex-col">
                          <span>{t("backend.apiKey")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="vertex-ai">
                        <div className="flex flex-col">
                          <span>{t("backend.vertexAi")}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="cloud-shell">
                        <div className="flex flex-col">
                          <span>{t("backend.cloudShell")}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* API Key input - only show for API Key auth */}
                {geminiConfig.authMethod === "gemini-api-key" && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                      {t("conversations.apiKey")}
                    </label>
                    <Input
                      type="password"
                      value={geminiConfig.apiKey || ""}
                      onChange={(e) =>
                        updateGeminiConfig({ apiKey: e.target.value })
                      }
                      placeholder={t("backend.enterApiKey")}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {t("conversations.getApiKeyFrom")}{" "}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        {t("backend.googleAiStudio")}
                      </a>
                    </p>
                  </div>
                )}

                {/* Vertex AI configuration - only show for Vertex AI auth */}
                {geminiConfig.authMethod === "vertex-ai" && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        {t("conversations.gcpProjectId")}
                      </label>
                      <Input
                        type="text"
                        value={geminiConfig.vertexProject || ""}
                        onChange={(e) =>
                          updateGeminiConfig({
                            vertexProject: e.target.value,
                          })
                        }
                        placeholder={t("backend.enterProjectId")}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                        {t("conversations.locationRegion")}
                      </label>
                      <Input
                        type="text"
                        value={geminiConfig.vertexLocation || ""}
                        onChange={(e) =>
                          updateGeminiConfig({
                            vertexLocation: e.target.value,
                          })
                        }
                        placeholder={t("backend.enterLocation")}
                      />
                    </div>
                  </>
                )}

                {/* OAuth information */}
                {geminiConfig.authMethod === "oauth-personal" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("conversations.oauthLimits")}
                  </p>
                )}

                {/* Cloud Shell information */}
                {geminiConfig.authMethod === "cloud-shell" && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("conversations.cloudShellInfo")}
                  </p>
                )}

                {/* YOLO Mode Checkbox */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="yolo-checkbox"
                    checked={geminiConfig.yolo || false}
                    onCheckedChange={(checked) => {
                      updateGeminiConfig({ yolo: checked === true });
                    }}
                  />
                  <label
                    htmlFor="yolo-checkbox"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {t("conversations.yoloMode")}
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* LLxprt Code Configuration */}
          {selectedBackend === "llxprt" && (
            <div className="space-y-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                LLxprt Code Configuration
              </h4>

              {/* Provider Selector */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  {t("conversations.provider")}
                </label>
                <Select
                  value={llxprtConfig.provider}
                  onValueChange={async (value) => {
                    // Check if it's a JSON provider
                    const jsonProvider = jsonProviders.find(
                      (p) => p.id === value
                    );

                    const updates: Partial<typeof llxprtConfig> = {
                      provider: value as LLxprtProvider,
                    };

                    if (jsonProvider) {
                      updates.baseUrl = jsonProvider.url;
                      // Default to first model if available
                      if (
                        jsonProvider.models &&
                        jsonProvider.models.length > 0
                      ) {
                        updates.model = jsonProvider.models[0];
                      }
                      
                      // Fetch API key from settings if available
                      if (jsonProvider.env_key && qwenSettingsFile?.env) {
                        const envValue = qwenSettingsFile.env[jsonProvider.env_key];
                        if (envValue) {
                          updates.apiKey = envValue;
                        }
                      }
                    } else if (value === "openrouter") {
                      updates.baseUrl = "https://openrouter.ai/api/v1";
                    } else if (
                      [
                        "anthropic",
                        "openai",
                        "gemini",
                        "qwen",
                        "groq",
                        "together",
                        "xai",
                      ].includes(value)
                    ) {
                      // Clear base URL for providers that don't need it
                      updates.baseUrl = "";
                    }

                    updateLLxprtConfig(updates);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">
                      Anthropic (Claude)
                    </SelectItem>
                    <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                    <SelectItem value="openrouter">
                      OpenRouter (Multi-provider)
                    </SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="qwen">Qwen/Alibaba Cloud</SelectItem>
                    <SelectItem value="groq">Groq</SelectItem>
                    <SelectItem value="together">Together AI</SelectItem>
                    <SelectItem value="xai">xAI (Grok)</SelectItem>
                    {/* JSON Providers */}
                    {jsonProviders
                      .filter(
                        (p) =>
                          ![
                            "anthropic",
                            "openai",
                            "openrouter",
                            "gemini",
                            "qwen",
                            "groq",
                            "together",
                            "xai",
                          ].includes(p.id)
                      )
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    <SelectItem value="custom">
                      Custom OpenAI-compatible
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* API Key */}
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                  {t("conversations.apiKey")}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showLlxprtApiKey ? "text" : "password"}
                      className="w-full pr-10"
                      value={llxprtConfig.apiKey}
                      onChange={(e) =>
                        updateLLxprtConfig({
                          apiKey: e.target.value,
                        })
                      }
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                      onClick={() => setShowLlxprtApiKey(!showLlxprtApiKey)}
                    >
                      {showLlxprtApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // LLxprt save logic - keeping local for now or TODO implement generic saving
                      // For now just notify user it's not implemented for LLxprt file saving yet
                      toast.info("Saving to config file is currently optimized for Qwen backend.");
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      // Determine base URL
                      let url = llxprtConfig.baseUrl;
                      if (!url) {
                        if (llxprtConfig.provider === "openai") url = "https://api.openai.com/v1";
                        else if (llxprtConfig.provider === "anthropic") url = "https://api.anthropic.com/v1";
                        // add more defaults if needed
                      }
                      if (!url) {
                        toast.error("Base URL is required to test connection");
                        return;
                      }
                      testConnection(url, llxprtConfig.apiKey, llxprtConfig.model || "");
                    }}
                  >
                    Test
                  </Button>
                </div>
              </div>

              {/* Model */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    {t("conversations.model")}
                  </label>
                  {llxprtConfig.provider === "openrouter" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={debouncedFetchModels}
                      disabled={isFetchingModels || !llxprtConfig.apiKey}
                      className="h-6 text-xs"
                    >
                      <RefreshCw
                        className={`h-3 w-3 mr-1 ${isFetchingModels ? "animate-spin" : ""}`}
                      />
                      {isFetchingModels ? "Loading..." : "Fetch Models"}
                    </Button>
                  )}
                </div>

                {llxprtConfig.provider === "openrouter" &&
                openRouterModels.length > 0 ? (
                  <div className="relative" ref={comboboxRef}>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboboxOpen}
                      className="w-full justify-between"
                      onClick={() => setComboboxOpen(!comboboxOpen)}
                    >
                      {llxprtConfig.model
                        ? openRouterModels.find(
                            (m) => m.id === llxprtConfig.model
                          )?.name || llxprtConfig.model
                        : "Select a model..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                    {comboboxOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
                        <Command>
                          <CommandInput placeholder="Search models..." />
                          <CommandList>
                            <CommandEmpty>No model found.</CommandEmpty>
                            <CommandGroup>
                              {openRouterModels.map((model) => (
                                <CommandItem
                                  key={model.id}
                                  value={model.name}
                                  onSelect={() => {
                                    updateLLxprtConfig({ model: model.id });
                                    onModelChange?.(model.id);
                                    setComboboxOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      llxprtConfig.model === model.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  <div className="flex flex-col gap-1">
                                    <span className="font-medium text-sm">
                                      {model.name}
                                    </span>
                                    {model.description && (
                                      <span className="text-xs text-muted-foreground leading-tight">
                                        {model.description.slice(0, 100)}
                                        {model.description.length > 100
                                          ? "..."
                                          : ""}
                                      </span>
                                    )}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </div>
                    )}
                  </div>
                ) : jsonProviders.some(
                    (p) => p.id === llxprtConfig.provider
                  ) ? (
                  <Select
                    value={llxprtConfig.model}
                    onValueChange={(value) => {
                      updateLLxprtConfig({ model: value });
                      onModelChange?.(value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Model" />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        jsonProviders.find(
                          (p) => p.id === llxprtConfig.provider
                        )?.models || []
                      ).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="text"
                    value={llxprtConfig.model}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateLLxprtConfig({ model: value });
                      onModelChange?.(value || "claude-3-5-sonnet-20241022");
                    }}
                    placeholder={
                      llxprtConfig.provider === "anthropic"
                        ? "claude-3-5-sonnet-20241022"
                        : llxprtConfig.provider === "openai"
                          ? "gpt-4o"
                          : llxprtConfig.provider === "openrouter"
                            ? "anthropic/claude-sonnet-4.5"
                            : llxprtConfig.provider === "gemini"
                              ? "gemini-2.0-flash-exp"
                              : llxprtConfig.provider === "qwen"
                                ? "qwen-max"
                                : llxprtConfig.provider === "groq"
                                  ? "llama-3.3-70b-versatile"
                                  : llxprtConfig.provider === "together"
                                    ? "meta-llama/Llama-3-70b-chat-hf"
                                    : llxprtConfig.provider === "xai"
                                      ? "grok-beta"
                                      : "model-name"
                    }
                  />
                )}
              </div>

              {/* Base URL (only show for custom provider) */}
              {llxprtConfig.provider === "custom" && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">
                    {t("conversations.baseUrl")}
                  </label>
                  <Input
                    type="text"
                    value={llxprtConfig.baseUrl}
                    onChange={(e) =>
                      updateLLxprtConfig({
                        baseUrl: e.target.value,
                      })
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              )}

              {/* Info text */}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                LLxprt Code supports multiple AI providers. Most providers are
                pre-configured - just add your API key and model. Select
                &quot;Custom&quot; for self-hosted or other OpenAI-compatible
                endpoints.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t border-gray-200 dark:border-gray-800 mt-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={reloadCurrentModel}
              className="flex items-center gap-2"
              title="Load current configuration from disk"
            >
              <RefreshCw className="h-4 w-4" />
              Current Model
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openSettingsFile}
              title="Open ~/.qwen/settings.json"
            >
              Config File
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openQwenFolder}
              title="Open ~/.qwen folder"
            >
              .qwen Folder
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={openModelProvidersJson}
              title="Edit the dropdown model list"
            >
              Edit Model List
            </Button>
          </div>
          
          <Button
            onClick={async () => {
              // 1. Trigger model change event to inform the rest of the app
              let modelToUse = "";
              if (selectedBackend === "qwen") {
                if (qwenConfig.useOAuth) {
                  modelToUse = "coder-model";
                } else {
                  modelToUse = qwenConfig.model || "qwen-max";
                }
                // Save settings to Qwen config file
                await saveSettingsToQwenConfig();
              } else if (selectedBackend === "gemini") {
                modelToUse = geminiConfig.defaultModel || "gemini-2.5-flash";
              } else if (selectedBackend === "llxprt") {
                modelToUse = llxprtConfig.model || "";
              }
              
              if (onModelChange && modelToUse) {
                onModelChange(modelToUse);
              }
              
              // 2. Save state via Context (handled automatically by useEffect in BackendProvider)
              
              // 3. Close dialog
              onOpenChange(false);
            }}
          >
            Confirm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
