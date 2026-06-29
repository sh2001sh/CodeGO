import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Settings,
  ArrowLeft,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Book,
  Brain,
  Wrench,
  History,
  BarChart2,
  Download,
  FolderArchive,
  Search,
  FolderOpen,
  KeyRound,
  Shield,
  Cpu,
  LayoutDashboard,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Provider, VisibleApps } from "@/types";
import type { EnvConflict } from "@/types/env";
import { useProvidersQuery, useSettingsQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import { openclawKeys, useOpenClawHealth } from "@/hooks/useOpenClaw";
import { hermesKeys, useOpenHermesWebUI } from "@/hooks/useHermes";
import { hermesApi } from "@/lib/api/hermes";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import { useAutoCompact } from "@/hooks/useAutoCompact";
import { useUsageCacheBridge } from "@/hooks/useUsageCacheBridge";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useLastValidValue } from "@/hooks/useLastValidValue";
import { useScanUnmanagedSkills } from "@/hooks/useSkills";
import { extractErrorMessage } from "@/utils/errorUtils";
import { isTextEditableTarget } from "@/utils/domUtils";
import { deepClone } from "@/utils/deepClone";
import { cn } from "@/lib/utils";
import {
  isWindows,
  isLinux,
  DRAG_REGION_ATTR,
  DRAG_REGION_STYLE,
} from "@/lib/platform";
import { AppSwitcher } from "@/components/AppSwitcher";
import { ProviderList } from "@/components/providers/ProviderList";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import { ProxyToggle } from "@/components/proxy/ProxyToggle";
import { ClaudeDesktopRouteToggle } from "@/components/proxy/ClaudeDesktopRouteToggle";
import { FailoverToggle } from "@/components/proxy/FailoverToggle";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import {
  SkillsPage,
  getSkillsPageHeaderActions,
  type SkillsPageSource,
} from "@/components/skills/SkillsPage";
import UnifiedSkillsPanel from "@/components/skills/UnifiedSkillsPanel";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import { FirstRunNoticeDialog } from "@/components/FirstRunNoticeDialog";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import { CodeGoDashboard } from "@/components/codego/CodeGoDashboard";
import { CodeGoMark } from "@/components/codego/CodeGoMark";
import { UniversalProviderPanel } from "@/components/universal";
import { McpIcon } from "@/components/BrandIcons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionManagerPage } from "@/components/sessions/SessionManagerPage";
import {
  useDisableCurrentOmo,
  useDisableCurrentOmoSlim,
} from "@/lib/query/omo";
import WorkspaceFilesPanel from "@/components/workspace/WorkspaceFilesPanel";
import EnvPanel from "@/components/openclaw/EnvPanel";
import ToolsPanel from "@/components/openclaw/ToolsPanel";
import AgentsDefaultsPanel from "@/components/openclaw/AgentsDefaultsPanel";
import OpenClawHealthBanner from "@/components/openclaw/OpenClawHealthBanner";
import HermesMemoryPanel from "@/components/hermes/HermesMemoryPanel";

type View =
  | "codego"
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "skillsDiscovery"
  | "mcp"
  | "agents"
  | "universal"
  | "sessions"
  | "workspace"
  | "openclawEnv"
  | "openclawTools"
  | "openclawAgents"
  | "hermesMemory";

interface SyncStatusUpdatedPayload {
  source?: string;
  status?: string;
  error?: string;
}

const DEFAULT_DRAG_BAR_HEIGHT = isWindows() || isLinux() ? 0 : 28; // px

const STORAGE_KEY = "cc-switch-last-app";
const VALID_APPS: AppId[] = [
  "claude",
  "claude-desktop",
  "codex",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
];

const getInitialApp = (): AppId => {
  const saved = localStorage.getItem(STORAGE_KEY) as AppId | null;
  if (saved && VALID_APPS.includes(saved)) {
    return saved;
  }
  return "claude";
};

const VIEW_STORAGE_KEY = "codego-last-view";
const LEGACY_VIEW_STORAGE_KEY = "cc-switch-last-view";
const VALID_VIEWS: View[] = [
  "codego",
  "providers",
  "settings",
  "prompts",
  "skills",
  "skillsDiscovery",
  "mcp",
  "agents",
  "universal",
  "sessions",
  "workspace",
  "openclawEnv",
  "openclawTools",
  "openclawAgents",
  "hermesMemory",
];

const readStoredView = (storageKey: string): View | null => {
  const saved = localStorage.getItem(storageKey) as View | null;
  if (saved && VALID_VIEWS.includes(saved)) {
    return saved;
  }
  return null;
};

const getInitialView = (): View => {
  const saved = readStoredView(VIEW_STORAGE_KEY);
  if (saved) {
    return saved;
  }
  const legacySaved = readStoredView(LEGACY_VIEW_STORAGE_KEY);
  if (legacySaved) {
    return legacySaved;
  }
  return "codego";
};

function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [activeApp, setActiveApp] = useState<AppId>(getInitialApp);
  const sharedFeatureApp: AppId =
    activeApp === "claude-desktop" ? "claude" : activeApp;
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [skillsDiscoverySource, setSkillsDiscoverySource] =
    useState<SkillsPageSource>("repos");
  const [settingsDefaultTab, setSettingsDefaultTab] = useState("general");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState(false);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, currentView);
    localStorage.removeItem(LEGACY_VIEW_STORAGE_KEY);
  }, [currentView]);

  const { data: settingsData } = useSettingsQuery();
  const useAppWindowControls =
    isLinux() && (settingsData?.useAppWindowControls ?? false);
  const dragBarHeight = useAppWindowControls ? 32 : DEFAULT_DRAG_BAR_HEIGHT;
  const visibleApps: VisibleApps = settingsData?.visibleApps ?? {
    claude: true,
    "claude-desktop": true,
    codex: true,
    gemini: true,
    opencode: true,
    openclaw: true,
    hermes: true,
  };

  const getFirstVisibleApp = (): AppId => {
    if (visibleApps.claude) return "claude";
    if (visibleApps["claude-desktop"]) return "claude-desktop";
    if (visibleApps.codex) return "codex";
    if (visibleApps.gemini) return "gemini";
    if (visibleApps.opencode) return "opencode";
    if (visibleApps.openclaw) return "openclaw";
    if (visibleApps.hermes) return "hermes";
    return "claude"; // fallback
  };

  useEffect(() => {
    if (!visibleApps[activeApp]) {
      setActiveApp(getFirstVisibleApp());
    }
  }, [visibleApps, activeApp]);

  // Fallback from sessions view when switching to an app without session support
  useEffect(() => {
    if (
      currentView === "sessions" &&
      sharedFeatureApp !== "claude" &&
      sharedFeatureApp !== "codex" &&
      sharedFeatureApp !== "opencode" &&
      sharedFeatureApp !== "openclaw" &&
      sharedFeatureApp !== "gemini" &&
      sharedFeatureApp !== "hermes"
    ) {
      setCurrentView("providers");
    }
  }, [sharedFeatureApp, currentView]);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    provider: Provider;
    action: "remove" | "delete";
  } | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const effectiveEditingProvider = useLastValidValue(editingProvider);
  const effectiveUsageProvider = useLastValidValue(usageProvider);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const isToolbarCompact = useAutoCompact(toolbarRef);

  useUsageCacheBridge();

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const unifiedSkillsPanelRef = useRef<any>(null);
  // 订阅未管理 Skill 的共享缓存（实际扫描由 UnifiedSkillsPanel 进入页面时触发）。
  // 这里 enabled 默认 false，仅用于「导入」按钮的绿点提示，不主动发起扫描。
  const { data: unmanagedSkills } = useScanUnmanagedSkills();
  const hasUnmanagedSkills = (unmanagedSkills?.length ?? 0) > 0;
  const addActionButtonClass =
    "h-9 w-9 rounded-[14px] bg-orange-600 text-white shadow-[0_6px_12px_rgba(217,106,57,0.24)] hover:bg-orange-700 dark:bg-orange-500 dark:hover:bg-orange-400";

  const {
    isRunning: isProxyRunning,
    takeoverStatus,
    status: proxyStatus,
  } = useProxyStatus();
  const isCurrentAppTakeoverActive = takeoverStatus?.[activeApp] || false;
  const activeProviderId = useMemo(() => {
    const target = proxyStatus?.active_targets?.find(
      (t) => t.app_type === activeApp,
    );
    return target?.provider_id;
  }, [proxyStatus?.active_targets, activeApp]);

  const { data, isLoading, refetch } = useProvidersQuery(activeApp, {
    isProxyRunning,
  });
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const isOpenClawView =
    activeApp === "openclaw" &&
    (currentView === "providers" ||
      currentView === "workspace" ||
      currentView === "sessions" ||
      currentView === "openclawEnv" ||
      currentView === "openclawTools" ||
      currentView === "openclawAgents");
  const { data: openclawHealthWarnings = [] } =
    useOpenClawHealth(isOpenClawView);
  const hasSkillsSupport = sharedFeatureApp !== "openclaw";
  const hasSessionSupport =
    sharedFeatureApp === "claude" ||
    sharedFeatureApp === "codex" ||
    sharedFeatureApp === "opencode" ||
    sharedFeatureApp === "openclaw" ||
    sharedFeatureApp === "gemini" ||
    sharedFeatureApp === "hermes";

  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
    setAsDefaultModel,
  } = useProviderActions(
    activeApp,
    isProxyRunning,
    isProxyRunning && isCurrentAppTakeoverActive,
  );

  const disableOmoMutation = useDisableCurrentOmo();
  const handleDisableOmo = () => {
    disableOmoMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  const disableOmoSlimMutation = useDisableCurrentOmoSlim();
  const handleDisableOmoSlim = () => {
    disableOmoSlimMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("omo.disabled", { defaultValue: "OMO 已停用" }));
      },
      onError: (error: Error) => {
        toast.error(
          t("omo.disableFailed", {
            defaultValue: "停用 OMO 失败: {{error}}",
            error: extractErrorMessage(error),
          }),
        );
      },
    });
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const setupListener = async () => {
      try {
        const off = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
        if (!active) {
          off();
          return;
        }
        unsubscribe = off;
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    void setupListener();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  useTauriEvent("universal-provider-synced", async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to update tray menu", error);
    }
  });

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "webdav-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.webdavSync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<SyncStatusUpdatedPayload | null | undefined>(
    "s3-sync-status-updated",
    async (payload) => {
      const statusPayload = payload ?? {};
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      if (statusPayload.source !== "auto" || statusPayload.status !== "error") {
        return;
      }
      toast.error(
        t("settings.s3Sync.autoSyncFailedToast", {
          error: statusPayload.error || t("common.unknown"),
        }),
      );
    },
  );

  useTauriEvent<{ appType: string; providerName: string }>(
    "proxy-official-warning",
    (payload) => {
      toast.warning(
        t("notifications.proxyOfficialWarning", {
          name: payload.providerName,
          defaultValue: `当前供应商 ${payload.providerName} 是官方供应商，建议切换到第三方供应商后再使用代理接管`,
        }),
        { duration: 8000 },
      );
    },
  );

  useEffect(() => {
    let active = true;
    let unlistenResize: (() => void) | undefined;

    const setupWindowStateSync = async () => {
      try {
        const currentWindow = getCurrentWindow();
        const syncWindowMaximizedState = async () => {
          const maximized = await currentWindow.isMaximized();
          if (active) {
            setIsWindowMaximized(maximized);
          }
        };

        await syncWindowMaximizedState();
        unlistenResize = await currentWindow.onResized(() => {
          void syncWindowMaximizedState();
        });
      } catch (error) {
        console.error("[App] Failed to sync window maximized state", error);
      }
    };

    void setupWindowStateSync();
    return () => {
      active = false;
      unlistenResize?.();
    };
  }, []);

  useEffect(() => {
    // settingsData 未加载时跳过，避免用 fallback false 覆盖 Rust 侧已设好的装饰状态
    if (!settingsData) return;

    const syncWindowDecorations = async () => {
      try {
        await getCurrentWindow().setDecorations(!useAppWindowControls);
      } catch (error) {
        console.error("[App] Failed to update window decorations", error);
      }
    };

    void syncWindowDecorations();
  }, [useAppWindowControls, settingsData]);

  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
            { closeButton: true },
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  useEffect(() => {
    const checkSkillsMigration = async () => {
      try {
        const result = await invoke<{ count: number; error?: string } | null>(
          "get_skills_migration_result",
        );
        if (result?.error) {
          toast.error(t("migration.skillsFailed"), {
            description: t("migration.skillsFailedDescription"),
            closeButton: true,
          });
          console.error("[App] Skills SSOT migration failed:", result.error);
          return;
        }
        if (result && result.count > 0) {
          toast.success(t("migration.skillsSuccess", { count: result.count }), {
            closeButton: true,
          });
          await queryClient.invalidateQueries({ queryKey: ["skills"] });
        }
      } catch (error) {
        console.error("[App] Failed to check skills migration result:", error);
      }
    };

    checkSkillsMigration();
  }, [t, queryClient]);

  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const currentViewRef = useRef(currentView);

  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "," && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCurrentView("settings");
        return;
      }

      if (event.key !== "Escape" || event.defaultPrevented) return;

      if (document.body.style.overflow === "hidden") return;

      const view = currentViewRef.current;
      if (view === "providers" || view === "codego") return;

      if (isTextEditableTarget(event.target)) return;

      event.preventDefault();
      setCurrentView(view === "skillsDiscovery" ? "skills" : "codego");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [launchDashboardOpen, setLaunchDashboardOpen] = useState(false);
  const openHermesWebUI = useOpenHermesWebUI(() =>
    setLaunchDashboardOpen(true),
  );

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async ({
    provider,
    originalId,
  }: {
    provider: Provider;
    originalId?: string;
  }) => {
    await updateProvider(provider, originalId);
    setEditingProvider(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    const { provider, action } = confirmAction;

    if (action === "remove") {
      // Remove from live config only (for additive mode apps like OpenCode/OpenClaw)
      // Does NOT delete from database - provider remains in the list
      await providersApi.removeFromLiveConfig(provider.id, activeApp);
      // Invalidate queries to refresh the isInConfig state
      if (activeApp === "opencode") {
        await queryClient.invalidateQueries({
          queryKey: ["opencodeLiveProviderIds"],
        });
      } else if (activeApp === "openclaw") {
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.liveProviderIds,
        });
        await queryClient.invalidateQueries({
          queryKey: openclawKeys.health,
        });
      } else if (activeApp === "hermes") {
        await queryClient.invalidateQueries({
          queryKey: hermesKeys.liveProviderIds,
        });
      }
      toast.success(
        t("notifications.removeFromConfigSuccess", {
          defaultValue: "已从配置移除",
        }),
        { closeButton: true },
      );
    } else {
      await deleteProvider(provider.id);
    }
    setConfirmAction(null);
  };

  const generateUniqueProviderCopyKey = (
    originalKey: string,
    existingKeys: string[],
  ): string => {
    const baseKey = `${originalKey}-copy`;

    if (!existingKeys.includes(baseKey)) {
      return baseKey;
    }

    let counter = 2;
    while (existingKeys.includes(`${baseKey}-${counter}`)) {
      counter++;
    }
    return `${baseKey}-${counter}`;
  };

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> & {
      providerKey?: string;
      addToLive?: boolean;
    } = {
      name: `${provider.name} copy`,
      settingsConfig: deepClone(provider.settingsConfig),
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex, // 复制原 sortIndex + 1
      meta: provider.meta ? deepClone(provider.meta) : undefined,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (
      activeApp === "opencode" ||
      activeApp === "openclaw" ||
      activeApp === "hermes"
    ) {
      let liveProviderIds: string[] = [];
      try {
        liveProviderIds =
          activeApp === "opencode"
            ? await queryClient.ensureQueryData({
                queryKey: ["opencodeLiveProviderIds"],
                queryFn: () => providersApi.getOpenCodeLiveProviderIds(),
              })
            : activeApp === "openclaw"
              ? await queryClient.ensureQueryData({
                  queryKey: openclawKeys.liveProviderIds,
                  queryFn: () => providersApi.getOpenClawLiveProviderIds(),
                })
              : await queryClient.ensureQueryData({
                  queryKey: hermesKeys.liveProviderIds,
                  queryFn: () => providersApi.getHermesLiveProviderIds(),
                });
      } catch (error) {
        console.error(
          "[App] Failed to load live provider IDs for duplication",
          error,
        );
        const errorMessage = extractErrorMessage(error);
        toast.error(
          t("provider.duplicateLiveIdsLoadFailed", {
            defaultValue: "读取配置中的供应商标识失败，请先修复配置后再试",
          }) + (errorMessage ? `: ${errorMessage}` : ""),
        );
        return;
      }
      const existingKeys = Array.from(
        new Set([...Object.keys(providers), ...liveProviderIds]),
      );
      duplicatedProvider.providerKey = generateUniqueProviderCopyKey(
        provider.id,
        existingKeys,
      );
      duplicatedProvider.addToLive = false;
    }

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return; // 如果排序更新失败，不继续添加
        }
      }
    }

    await addProvider(duplicatedProvider);
  };

  const handleOpenTerminal = async (provider: Provider) => {
    try {
      const selectedDir = await settingsApi.pickDirectory();
      if (!selectedDir) {
        return;
      }

      await providersApi.openTerminal(provider.id, activeApp, {
        cwd: selectedDir,
      });
      toast.success(
        t("provider.terminalOpened", {
          defaultValue: "终端已打开",
        }),
      );
    } catch (error) {
      console.error("[App] Failed to open terminal", error);
      const errorMessage = extractErrorMessage(error);
      toast.error(
        t("provider.terminalOpenFailed", {
          defaultValue: "打开终端失败",
        }) + (errorMessage ? `: ${errorMessage}` : ""),
      );
    }
  };

  const handleImportSuccess = async () => {
    try {
      await queryClient.invalidateQueries({
        queryKey: ["providers"],
        refetchType: "all",
      });
      await queryClient.refetchQueries({
        queryKey: ["providers"],
        type: "all",
      });
    } catch (error) {
      console.error("[App] Failed to refresh providers after import", error);
      await refetch();
    }
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const notifyWindowControlError = (error: unknown) => {
    toast.error(
      t("notifications.windowControlFailed", {
        defaultValue: "窗口控制失败：{{error}}",
        error: extractErrorMessage(error),
      }),
    );
  };

  const handleWindowMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (error) {
      console.error("[App] Failed to minimize window", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowToggleMaximize = async () => {
    try {
      const currentWindow = getCurrentWindow();
      await currentWindow.toggleMaximize();
      setIsWindowMaximized(await currentWindow.isMaximized());
    } catch (error) {
      console.error("[App] Failed to toggle maximize", error);
      notifyWindowControlError(error);
    }
  };

  const handleWindowClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window", error);
      notifyWindowControlError(error);
    }
  };

  const handleOpenSkillsDiscovery = () => {
    setSkillsDiscoverySource("repos");
    setCurrentView("skillsDiscovery");
  };

  const isPrimaryConsoleView =
    currentView === "codego" || currentView === "providers";
  const currentViewTitle = (() => {
    switch (currentView) {
      case "codego":
        return t("codego.shell.desktopTitle", {
          defaultValue: "CodeGo desktop",
        });
      case "providers":
        return t("apps." + activeApp);
      case "settings":
        return t("settings.title");
      case "prompts":
        return t("prompts.title", {
          appName: t(`apps.${sharedFeatureApp}`),
        });
      case "skills":
      case "skillsDiscovery":
        return t("skills.title");
      case "mcp":
        return t("mcp.unifiedPanel.title");
      case "agents":
        return t("agents.title");
      case "universal":
        return t("universalProvider.title", {
          defaultValue: "统一供应商",
        });
      case "sessions":
        return t("sessionManager.title");
      case "workspace":
        return t("workspace.title");
      case "openclawEnv":
        return t("openclaw.env.title");
      case "openclawTools":
        return t("openclaw.tools.title");
      case "openclawAgents":
        return t("openclaw.agents.title");
      case "hermesMemory":
        return t("hermes.memory.title");
      default:
        return t("codego.shell.desktopTitle", {
          defaultValue: "CodeGo desktop",
        });
    }
  })();
  const currentViewSubtitle =
    currentView === "codego"
      ? t("codego.shell.desktopSubtitle", {
          defaultValue: "Account, tokens, diagnostics, and local tool setup.",
        })
      : currentView === "providers"
        ? t("codego.shell.providersSubtitle", {
            defaultValue:
              "Switch providers and keep every CLI workspace aligned.",
          })
        : t("codego.shell.workspaceSubtitle", {
            defaultValue: "Focused operational view for the active workflow.",
          });

  const renderContent = () => {
    const content = (() => {
      switch (currentView) {
        case "codego":
          return (
            <CodeGoDashboard
              onOpenSettings={() => {
                setSettingsDefaultTab("general");
                setCurrentView("settings");
              }}
              onOpenProviders={() => setCurrentView("providers")}
            />
          );
        case "settings":
          return (
            <SettingsPage
              open={true}
              onOpenChange={() => setCurrentView("codego")}
              onImportSuccess={handleImportSuccess}
              defaultTab={settingsDefaultTab}
            />
          );
        case "prompts":
          return (
            <PromptPanel
              ref={promptPanelRef}
              open={true}
              onOpenChange={() => setCurrentView("codego")}
              appId={sharedFeatureApp}
            />
          );
        case "hermesMemory":
          return <HermesMemoryPanel />;
        case "skills":
          return (
            <UnifiedSkillsPanel
              ref={unifiedSkillsPanelRef}
              onOpenDiscovery={handleOpenSkillsDiscovery}
              currentApp={
                sharedFeatureApp === "openclaw" ? "claude" : sharedFeatureApp
              }
            />
          );
        case "skillsDiscovery":
          return (
            <SkillsPage
              ref={skillsPageRef}
              initialApp={
                sharedFeatureApp === "openclaw" ? "claude" : sharedFeatureApp
              }
              onSourceChange={setSkillsDiscoverySource}
            />
          );
        case "mcp":
          return (
            <UnifiedMcpPanel
              ref={mcpPanelRef}
              onOpenChange={() => setCurrentView("codego")}
            />
          );
        case "agents":
          return <AgentsPanel onOpenChange={() => setCurrentView("codego")} />;
        case "universal":
          return (
            <div className="px-6 pt-4">
              <UniversalProviderPanel />
            </div>
          );

        case "sessions":
          return (
            <SessionManagerPage
              key={sharedFeatureApp}
              appId={sharedFeatureApp}
            />
          );
        case "workspace":
          return <WorkspaceFilesPanel />;
        case "openclawEnv":
          return <EnvPanel />;
        case "openclawTools":
          return <ToolsPanel />;
        case "openclawAgents":
          return <AgentsDefaultsPanel />;
        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeApp}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="space-y-4"
                  >
                    <ProviderList
                      providers={providers}
                      currentProviderId={currentProviderId}
                      appId={activeApp}
                      isLoading={isLoading}
                      isProxyRunning={isProxyRunning}
                      isProxyTakeover={
                        isProxyRunning && isCurrentAppTakeoverActive
                      }
                      activeProviderId={activeProviderId}
                      onSwitch={switchProvider}
                      onEdit={(provider) => {
                        setEditingProvider(provider);
                      }}
                      onDelete={(provider) =>
                        setConfirmAction({ provider, action: "delete" })
                      }
                      onRemoveFromConfig={
                        activeApp === "opencode" ||
                        activeApp === "openclaw" ||
                        activeApp === "hermes"
                          ? (provider) =>
                              setConfirmAction({ provider, action: "remove" })
                          : undefined
                      }
                      onDisableOmo={
                        activeApp === "opencode" ? handleDisableOmo : undefined
                      }
                      onDisableOmoSlim={
                        activeApp === "opencode"
                          ? handleDisableOmoSlim
                          : undefined
                      }
                      onDuplicate={handleDuplicateProvider}
                      onConfigureUsage={setUsageProvider}
                      onOpenWebsite={handleOpenWebsite}
                      onOpenTerminal={
                        activeApp === "claude" ? handleOpenTerminal : undefined
                      }
                      onCreate={() => setIsAddOpen(true)}
                      onSetAsDefault={
                        activeApp === "openclaw"
                          ? setAsDefaultModel
                          : activeApp === "hermes"
                            ? switchProvider
                            : undefined
                      }
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
      }
    })();

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          className="flex-1 min-h-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    );
  };

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground selection:bg-primary/30"
      style={{ overflowX: "hidden" }}
    >
      {(dragBarHeight > 0 || useAppWindowControls) && (
        <div
          className="flex items-center justify-end px-2"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag", height: dragBarHeight } as any}
        >
          {useAppWindowControls && (
            <div
              className="flex items-center gap-1"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowMinimize()}
                title={t("header.windowMinimize")}
                className="h-7 w-7"
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowToggleMaximize()}
                title={
                  isWindowMaximized
                    ? t("header.windowRestore")
                    : t("header.windowMaximize")
                }
                className="h-7 w-7"
              >
                {isWindowMaximized ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void handleWindowClose()}
                title={t("header.windowClose")}
                className="h-7 w-7 hover:bg-red-500/15 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {showEnvBanner && envConflicts.length > 0 && (
        <EnvWarningBanner
          conflicts={envConflicts}
          onDismiss={() => {
            setShowEnvBanner(false);
            sessionStorage.setItem("env_banner_dismissed", "true");
          }}
          onDeleted={async () => {
            try {
              const allConflicts = await checkAllEnvConflicts();
              const flatConflicts = Object.values(allConflicts).flat();
              setEnvConflicts(flatConflicts);
              if (flatConflicts.length === 0) {
                setShowEnvBanner(false);
              }
            } catch (error) {
              console.error(
                "[App] Failed to re-check conflicts after deletion:",
                error,
              );
            }
          }}
        />
      )}

      <div className="min-h-0 flex-1 p-3 pb-4 lg:p-4">
        <div className="codego-shell flex h-full min-h-0 overflow-hidden">
          <aside
            className={cn(
              "codego-sidebar-surface w-[292px] shrink-0 px-4 py-4 lg:flex lg:flex-col",
              currentView === "codego" ? "hidden xl:flex" : "hidden lg:flex",
            )}
          >
            <div className="codego-panel p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/82 dark:border-white/10 dark:bg-white/[0.05]">
                  <CodeGoMark size={34} className="h-8 w-8" />
                </div>
                <div className="min-w-0">
                  <a
                    href="https://shu26.cfd"
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-semibold text-foreground"
                  >
                    codego
                  </a>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("codego.shell.desktopSurface", {
                      defaultValue: "Desktop control surface",
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    isProxyRunning && isCurrentAppTakeoverActive
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "codego-chip-cool",
                  )}
                >
                  {isProxyRunning && isCurrentAppTakeoverActive
                    ? t("codego.shell.routeActive", {
                        defaultValue: "route active",
                      })
                    : t("codego.shell.desktopReady", {
                        defaultValue: "desktop ready",
                      })}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full px-2.5 py-1 text-[11px]"
                >
                  {t(`apps.${activeApp}`)}
                </Badge>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                onClick={() => setCurrentView("codego")}
                className={cn(
                  "codego-nav-item w-full",
                  currentView === "codego" && "codego-nav-item-active",
                )}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                <span>
                  {t("codego.shell.dashboard", {
                    defaultValue: "Dashboard",
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView("providers")}
                className={cn(
                  "codego-nav-item w-full",
                  currentView === "providers" && "codego-nav-item-active",
                )}
              >
                <Wrench className="h-4 w-4 shrink-0" />
                <span>
                  {t("codego.shell.providers", {
                    defaultValue: "Providers",
                  })}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsDefaultTab("general");
                  setCurrentView("settings");
                }}
                className={cn(
                  "codego-nav-item w-full",
                  currentView === "settings" && "codego-nav-item-active",
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span>{t("settings.title")}</span>
              </button>
            </div>

            <div className="mt-6">
              <div className="codego-kicker px-3">
                {t("codego.shell.workspace", {
                  defaultValue: "Workspace",
                })}
              </div>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentView("prompts")}
                  className={cn(
                    "codego-nav-item py-2.5",
                    currentView === "prompts" && "codego-nav-item-active",
                  )}
                >
                  <Book className="h-4 w-4 shrink-0" />
                  <span>
                    {t("prompts.title", {
                      appName: t(`apps.${sharedFeatureApp}`),
                    })}
                  </span>
                </button>
                {hasSkillsSupport && (
                  <button
                    type="button"
                    onClick={() => setCurrentView("skills")}
                    className={cn(
                      "codego-nav-item py-2.5",
                      (currentView === "skills" ||
                        currentView === "skillsDiscovery") &&
                        "codego-nav-item-active",
                    )}
                  >
                    <Wrench className="h-4 w-4 shrink-0" />
                    <span>{t("skills.title")}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentView("mcp")}
                  className={cn(
                    "codego-nav-item py-2.5",
                    currentView === "mcp" && "codego-nav-item-active",
                  )}
                >
                  <McpIcon size={16} />
                  <span>{t("mcp.title")}</span>
                </button>
                {hasSessionSupport && (
                  <button
                    type="button"
                    onClick={() => setCurrentView("sessions")}
                    className={cn(
                      "codego-nav-item py-2.5",
                      currentView === "sessions" && "codego-nav-item-active",
                    )}
                  >
                    <History className="h-4 w-4 shrink-0" />
                    <span>{t("sessionManager.title")}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentView("agents")}
                  className={cn(
                    "codego-nav-item py-2.5",
                    currentView === "agents" && "codego-nav-item-active",
                  )}
                >
                  <Cpu className="h-4 w-4 shrink-0" />
                  <span>{t("agents.title")}</span>
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="codego-kicker px-3">
                {t("codego.shell.activeApp", {
                  defaultValue: "Active app",
                })}
              </div>
              <div className="mt-2 codego-panel p-3">
                <AppSwitcher
                  activeApp={activeApp}
                  onSwitch={setActiveApp}
                  visibleApps={visibleApps}
                  compact={false}
                />
              </div>
            </div>

            <div className="mt-auto space-y-3 pt-6">
              {currentView === "providers" && (
                <Button
                  onClick={() => setIsAddOpen(true)}
                  size="icon"
                  className={`h-11 w-full rounded-2xl ${addActionButtonClass}`}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              )}
              <div className="flex items-center justify-between rounded-2xl border border-white/60 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSettingsDefaultTab("about");
                    setCurrentView("settings");
                  }}
                  title={t("common.settings")}
                  className="h-8 w-8"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                <UpdateBadge
                  onClick={() => {
                    setSettingsDefaultTab("about");
                    setCurrentView("settings");
                  }}
                />
                {isCurrentAppTakeoverActive ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSettingsDefaultTab("usage");
                      setCurrentView("settings");
                    }}
                    title={t("usage.title", {
                      defaultValue: "使用统计",
                    })}
                    className="h-8 w-8"
                  >
                    <BarChart2 className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="h-8 w-8" />
                )}
              </div>
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className="codego-toolbar-surface px-4 py-4 lg:px-6"
              {...DRAG_REGION_ATTR}
              style={{ ...DRAG_REGION_STYLE } as any}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div
                  className="min-w-0"
                  style={{ WebkitAppRegion: "no-drag" } as any}
                >
                  {!isPrimaryConsoleView && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setCurrentView(
                          currentView === "skillsDiscovery"
                            ? "skills"
                            : "codego",
                        )
                      }
                      className="mb-3 h-9 w-9 rounded-[12px]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/75 dark:border-white/10 dark:bg-white/[0.05] lg:hidden">
                      <CodeGoMark size={24} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="codego-kicker">
                        {isPrimaryConsoleView
                          ? t("codego.shell.controlCenter", {
                              defaultValue: "Control center",
                            })
                          : t("codego.shell.workspaceView", {
                              defaultValue: "Workspace view",
                            })}
                      </div>
                      <h1 className="truncate text-xl font-semibold text-foreground">
                        {currentViewTitle}
                      </h1>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {currentViewSubtitle}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col gap-3">
                  {currentView === "providers" &&
                    activeApp !== "opencode" &&
                    activeApp !== "openclaw" &&
                    activeApp !== "hermes" && (
                      <div
                        className="flex flex-wrap items-center justify-end gap-1.5"
                        style={{ WebkitAppRegion: "no-drag" } as any}
                      >
                        {activeApp === "claude-desktop" ? (
                          <ClaudeDesktopRouteToggle />
                        ) : (
                          settingsData?.enableLocalProxy && (
                            <ProxyToggle activeApp={activeApp} />
                          )
                        )}
                        {activeApp !== "claude-desktop" &&
                          settingsData?.enableFailoverToggle && (
                            <FailoverToggle activeApp={activeApp} />
                          )}
                      </div>
                    )}

                  <div
                    ref={toolbarRef}
                    className="flex min-w-0 justify-end overflow-x-hidden"
                  >
                    <div
                      className="flex shrink-0 flex-wrap items-center justify-end gap-1.5"
                      style={{ WebkitAppRegion: "no-drag" } as any}
                    >
                      {currentView === "prompts" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => promptPanelRef.current?.openAdd()}
                          className="hover:bg-black/5 dark:hover:bg-white/5"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          {t("prompts.add")}
                        </Button>
                      )}
                      {currentView === "mcp" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mcpPanelRef.current?.openImport()}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {t("mcp.importExisting")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => mcpPanelRef.current?.openAdd()}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {t("mcp.addMcp")}
                          </Button>
                        </>
                      )}
                      {currentView === "skills" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openRestoreFromBackup()
                            }
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <History className="mr-2 h-4 w-4" />
                            {t("skills.restoreFromBackup.button")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openInstallFromZip()
                            }
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <FolderArchive className="mr-2 h-4 w-4" />
                            {t("skills.installFromZip.button")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              unifiedSkillsPanelRef.current?.openImport()
                            }
                            className="relative hover:bg-black/5 dark:hover:bg-white/5"
                            title={
                              hasUnmanagedSkills
                                ? t("skills.unmanagedAvailable")
                                : undefined
                            }
                          >
                            <Download className="mr-2 h-4 w-4" />
                            {t("skills.import")}
                            {hasUnmanagedSkills && (
                              <span
                                className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500"
                                aria-hidden="true"
                              />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleOpenSkillsDiscovery}
                            className="hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <Search className="mr-2 h-4 w-4" />
                            {t("skills.discover")}
                          </Button>
                        </>
                      )}
                      {currentView === "skillsDiscovery" && (
                        <>
                          {getSkillsPageHeaderActions(
                            skillsDiscoverySource,
                          ).map(({ key, labelKey, Icon, execute }) => (
                            <Button
                              key={key}
                              variant="ghost"
                              size="sm"
                              onClick={() => execute(skillsPageRef.current)}
                              className="hover:bg-black/5 dark:hover:bg-white/5"
                            >
                              <Icon className="mr-2 h-4 w-4" />
                              {t(labelKey)}
                            </Button>
                          ))}
                        </>
                      )}
                      {currentView === "providers" && (
                        <>
                          <div className="lg:hidden">
                            <AppSwitcher
                              activeApp={activeApp}
                              onSwitch={setActiveApp}
                              visibleApps={visibleApps}
                              compact={isToolbarCompact}
                            />
                          </div>

                          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={
                                  activeApp === "openclaw"
                                    ? "openclaw"
                                    : activeApp === "hermes"
                                      ? "hermes"
                                      : "default"
                                }
                                className="flex items-center gap-1"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                              >
                                {activeApp === "hermes" ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("skills")}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("skills.manage")}
                                    >
                                      <Wrench className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setCurrentView("hermesMemory")
                                      }
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("hermes.memory.title")}
                                    >
                                      <Brain className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => void openHermesWebUI()}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("hermes.webui.open")}
                                    >
                                      <LayoutDashboard className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("mcp")}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("mcp.title")}
                                    >
                                      <McpIcon size={16} />
                                    </Button>
                                  </>
                                ) : activeApp === "openclaw" ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setCurrentView("workspace")
                                      }
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("workspace.manage")}
                                    >
                                      <FolderOpen className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setCurrentView("openclawEnv")
                                      }
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("openclaw.env.title")}
                                    >
                                      <KeyRound className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setCurrentView("openclawTools")
                                      }
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("openclaw.tools.title")}
                                    >
                                      <Shield className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setCurrentView("openclawAgents")
                                      }
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("openclaw.agents.title")}
                                    >
                                      <Cpu className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("sessions")}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("sessionManager.title")}
                                    >
                                      <History className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("skills")}
                                      className={cn(
                                        "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                        "transition-all duration-200 ease-in-out overflow-hidden",
                                        hasSkillsSupport
                                          ? "opacity-100 w-8 scale-100 px-2"
                                          : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                      )}
                                      title={t("skills.manage")}
                                    >
                                      <Wrench className="h-4 w-4 flex-shrink-0" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("prompts")}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("prompts.manage")}
                                    >
                                      <Book className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("sessions")}
                                      className={cn(
                                        "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
                                        "transition-all duration-200 ease-in-out overflow-hidden",
                                        hasSessionSupport
                                          ? "opacity-100 w-8 scale-100 px-2"
                                          : "opacity-0 w-0 scale-75 pointer-events-none px-0 -ml-1",
                                      )}
                                      title={t("sessionManager.title")}
                                    >
                                      <History className="h-4 w-4 flex-shrink-0" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setCurrentView("mcp")}
                                      className="h-8 w-8 px-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
                                      title={t("mcp.title")}
                                    >
                                      <McpIcon size={16} />
                                    </Button>
                                  </>
                                )}
                              </motion.div>
                            </AnimatePresence>
                          </div>

                          <Button
                            onClick={() => setIsAddOpen(true)}
                            size="icon"
                            className={`ml-2 ${addActionButtonClass}`}
                          >
                            <Plus className="h-5 w-5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto animate-fade-in">
              {isOpenClawView && openclawHealthWarnings.length > 0 && (
                <OpenClawHealthBanner warnings={openclawHealthWarnings} />
              )}
              {renderContent()}
            </main>
          </div>
        </div>
      </div>

      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        appId={activeApp}
        onSubmit={addProvider}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={effectiveEditingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
        isProxyTakeover={isCurrentAppTakeoverActive}
      />

      {effectiveUsageProvider && (
        <UsageScriptModal
          key={effectiveUsageProvider.id}
          provider={effectiveUsageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            if (usageProvider) {
              void saveUsageScript(usageProvider, script);
            }
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmAction)}
        title={
          confirmAction?.action === "remove"
            ? t("confirm.removeProvider")
            : t("confirm.deleteProvider")
        }
        message={
          confirmAction
            ? confirmAction.action === "remove"
              ? t("confirm.removeProviderMessage", {
                  name: confirmAction.provider.name,
                })
              : t("confirm.deleteProviderMessage", {
                  name: confirmAction.provider.name,
                })
            : ""
        }
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        isOpen={launchDashboardOpen}
        title={t("hermes.webui.launchConfirmTitle")}
        message={t("hermes.webui.launchConfirmMessage")}
        confirmText={t("hermes.webui.launchConfirmAction")}
        variant="info"
        onConfirm={() => {
          setLaunchDashboardOpen(false);
          void (async () => {
            try {
              await hermesApi.launchDashboard();
              toast.success(t("hermes.webui.launching"));
            } catch (error) {
              toast.error(t("hermes.webui.launchFailed"), {
                description: extractErrorMessage(error) || undefined,
              });
            }
          })();
        }}
        onCancel={() => setLaunchDashboardOpen(false)}
      />

      <DeepLinkImportDialog />
      <FirstRunNoticeDialog />
    </div>
  );
}

export default App;
