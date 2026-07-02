import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertCircle,
  KeyRound,
  ExternalLink,
  Loader2,
  Rocket,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CodeGoMark } from "@/components/codego/CodeGoMark";
import { CodeGoSecureStorageNotice } from "@/components/codego/CodeGoSecureStorageNotice";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { codegoApi, settingsApi } from "@/lib/api";
import type { CodeGoConfigTemplate, CodeGoToken } from "@/lib/api/codego";
import {
  codegoKeys,
  syncCodeGoDesktopAuthState,
  useCodeGoAuthQuery,
  useCodeGoPollAuthSessionMutation,
  useCodeGoStartAuthSessionMutation,
  useCodeGoSummaryQuery,
  useCodeGoTokensQuery,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";

const CODEGO_SERVER_URL = "https://shu26.cfd";
const CODEGO_DEVICE_NAME = "codego desktop";
const DEFAULT_MULTI_MODEL_COUNT = 3;
const TOKEN_QUERY = { p: 0, size: 100 } as const;

const normalizeModelList = (models: string[]): string[] =>
  Array.from(
    new Set(
      models.map((model) => model.trim()).filter((model) => model.length > 0),
    ),
  );

const findModelByKeywords = (
  models: string[],
  keywords: string[],
): string | undefined => {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  return models.find((model) => {
    const normalizedModel = model.toLowerCase();
    return normalizedKeywords.some((keyword) =>
      normalizedModel.includes(keyword),
    );
  });
};

const pickPreferredModel = (
  models: string[],
  keywords: string[],
  fallback = "",
): string => findModelByKeywords(models, keywords) ?? models[0] ?? fallback;

const pickClaudeModelDefaults = (models: string[]) => {
  const normalized = normalizeModelList(models);
  const primary = pickPreferredModel(normalized, ["claude", "sonnet"]);
  return {
    primary,
    sonnet: findModelByKeywords(normalized, ["sonnet"]) ?? primary,
    opus: findModelByKeywords(normalized, ["opus"]) ?? primary,
    haiku: findModelByKeywords(normalized, ["haiku"]) ?? primary,
    fable: findModelByKeywords(normalized, ["fable"]) ?? "",
  };
};

const normalizeTemplateEndpoint = (endpoint: string): string => {
  try {
    const current = new URL(endpoint);
    const official = new URL(CODEGO_SERVER_URL);
    current.protocol = official.protocol;
    current.host = official.host;
    return current.toString().replace(/\/$/, "");
  } catch {
    return endpoint;
  }
};

const normalizeTemplate = (
  template: CodeGoConfigTemplate,
): CodeGoConfigTemplate => ({
  ...template,
  server_address: CODEGO_SERVER_URL,
  endpoint: normalizeTemplateEndpoint(template.endpoint),
});

export interface CodeGoQuickFillResult {
  template: CodeGoConfigTemplate;
  fullKey: string;
  serverAddress: string;
  tokenId: number;
  tokenName: string;
  availableModels: string[];
  primaryModel?: string;
  selectedModels: string[];
  claudeModels?: {
    primary: string;
    sonnet: string;
    opus: string;
    haiku: string;
    fable?: string;
  };
  username?: string;
}

interface CodeGoQuickFillPanelProps {
  tool: CodeGoConfigTemplate["tool"];
  onApply: (result: CodeGoQuickFillResult) => Promise<void> | void;
}

export function CodeGoQuickFillPanel({
  tool,
  onApply,
}: Readonly<CodeGoQuickFillPanelProps>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const authQuery = useCodeGoAuthQuery();
  const startAuthMutation = useCodeGoStartAuthSessionMutation();
  const pollAuthMutation = useCodeGoPollAuthSessionMutation();
  const isAuthenticated = Boolean(authQuery.data?.authenticated);
  const summaryQuery = useCodeGoSummaryQuery(isAuthenticated, false);
  const [shouldLoadTokens, setShouldLoadTokens] = useState(false);
  const tokensQuery = useCodeGoTokensQuery(
    TOKEN_QUERY,
    isAuthenticated && shouldLoadTokens,
  );
  const summary = summaryQuery.data;

  const [authSession, setAuthSession] = useState<{
    sessionId: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isFetchingTokens, setIsFetchingTokens] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadedTokenId, setLoadedTokenId] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedPrimaryModel, setSelectedPrimaryModel] = useState("");
  const [selectedCatalogModels, setSelectedCatalogModels] = useState<string[]>(
    [],
  );
  const [selectedSharedModels, setSelectedSharedModels] = useState<string[]>(
    [],
  );
  const [claudeModels, setClaudeModels] = useState<{
    primary: string;
    sonnet: string;
    opus: string;
    haiku: string;
    fable: string;
  }>({
    primary: "",
    sonnet: "",
    opus: "",
    haiku: "",
    fable: "",
  });
  const authTimerRef = useRef<number | null>(null);
  const authExpireRef = useRef<number | null>(null);
  const serverAddress = CODEGO_SERVER_URL;
  const tokenItems = useMemo(
    () => tokensQuery.data?.items ?? [],
    [tokensQuery.data?.items],
  );

  const previewModels = useMemo(
    () => availableModels.slice(0, 4),
    [availableModels],
  );
  const selectedToken = useMemo(
    () =>
      tokenItems.find((token) => String(token.id) === selectedTokenId) ?? null,
    [selectedTokenId, tokenItems],
  );
  const isModelSelectionReady = useMemo(() => {
    if (!modelsLoaded) return false;
    if (tool === "claude") {
      return Boolean(
        claudeModels.primary &&
          claudeModels.sonnet &&
          claudeModels.opus &&
          claudeModels.haiku,
      );
    }
    if (tool === "codex") {
      return Boolean(selectedPrimaryModel && selectedCatalogModels.length > 0);
    }
    if (tool === "gemini") {
      return Boolean(selectedPrimaryModel);
    }
    return selectedSharedModels.length > 0;
  }, [
    claudeModels,
    modelsLoaded,
    selectedCatalogModels.length,
    selectedPrimaryModel,
    selectedSharedModels.length,
    tool,
  ]);
  const canApply =
    isAuthenticated && Boolean(selectedTokenId) && isModelSelectionReady;

  const stopAuthPolling = () => {
    if (authTimerRef.current !== null) {
      window.clearInterval(authTimerRef.current);
      authTimerRef.current = null;
    }
    authExpireRef.current = null;
  };

  const resetModelSelections = () => {
    setModelsLoaded(false);
    setLoadedTokenId("");
    setAvailableModels([]);
    setSelectedPrimaryModel("");
    setSelectedCatalogModels([]);
    setSelectedSharedModels([]);
    setClaudeModels({
      primary: "",
      sonnet: "",
      opus: "",
      haiku: "",
      fable: "",
    });
  };

  useEffect(() => {
    if (authQuery.data?.authenticated) {
      stopAuthPolling();
      setAuthSession(null);
      setAuthError(null);
      return;
    }
    setShouldLoadTokens(false);
    setSelectedTokenId("");
    resetModelSelections();
  }, [authQuery.data?.authenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (shouldLoadTokens) return;
    setShouldLoadTokens(true);
  }, [isAuthenticated, shouldLoadTokens]);

  useEffect(() => {
    return () => {
      stopAuthPolling();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !shouldLoadTokens) return;
    void (async () => {
      try {
        const tokensPage = await codegoApi.getTokens(TOKEN_QUERY);
        queryClient.setQueryData(codegoKeys.tokens(TOKEN_QUERY), tokensPage);
      } catch (error) {
        const message = extractErrorMessage(error);
        if (message) {
          toast.error(
            message ||
              t("providerForm.codego.loadKeysFailed", {
                defaultValue: "获取可用 Key 失败",
              }),
          );
        }
      }
    })();
  }, [isAuthenticated, queryClient, shouldLoadTokens, t]);

  useEffect(() => {
    if (!tokenItems.length) return;
    if (
      selectedTokenId &&
      tokenItems.some((token) => String(token.id) === selectedTokenId)
    ) {
      return;
    }
    const desktopTokenId = summary?.tokens.desktop_token?.id;
    const defaultToken =
      tokenItems.find((token) => token.id !== desktopTokenId) ?? tokenItems[0];
    if (defaultToken) {
      setSelectedTokenId(String(defaultToken.id));
    }
  }, [selectedTokenId, summary?.tokens.desktop_token?.id, tokenItems]);

  useEffect(() => {
    if (!selectedTokenId) {
      resetModelSelections();
      return;
    }
    if (selectedTokenId !== loadedTokenId) {
      resetModelSelections();
    }
  }, [loadedTokenId, selectedTokenId]);

  useEffect(() => {
    if (!modelsLoaded || availableModels.length === 0) return;

    if (tool === "claude" && !claudeModels.primary) {
      const defaults = pickClaudeModelDefaults(availableModels);
      setClaudeModels({
        primary: defaults.primary,
        sonnet: defaults.sonnet,
        opus: defaults.opus,
        haiku: defaults.haiku,
        fable: defaults.fable,
      });
      return;
    }

    if (tool === "codex" && !selectedPrimaryModel) {
      const primary = pickPreferredModel(availableModels, ["gpt", "codex"]);
      setSelectedPrimaryModel(primary);
      setSelectedCatalogModels(
        normalizeModelList([
          primary,
          ...availableModels.slice(
            0,
            Math.max(DEFAULT_MULTI_MODEL_COUNT - 1, 0),
          ),
        ]),
      );
      return;
    }

    if (tool === "gemini" && !selectedPrimaryModel) {
      setSelectedPrimaryModel(
        pickPreferredModel(availableModels, ["gemini"], "gemini-2.5-pro"),
      );
      return;
    }

    if (
      (tool === "opencode" || tool === "openclaw" || tool === "hermes") &&
      selectedSharedModels.length === 0
    ) {
      setSelectedSharedModels(
        availableModels.slice(0, DEFAULT_MULTI_MODEL_COUNT),
      );
    }
  }, [
    availableModels,
    claudeModels.primary,
    modelsLoaded,
    selectedPrimaryModel,
    selectedSharedModels.length,
    tool,
  ]);

  const toggleModel = (
    setList: (updater: string[] | ((current: string[]) => string[])) => void,
    model: string,
    checked: boolean,
  ) => {
    setList((current) => {
      if (checked) {
        if (current.includes(model)) return current;
        return [...current, model];
      }
      return current.filter((item) => item !== model);
    });
  };

  const tokenOptionLabel = (token: CodeGoToken): string => {
    const quotaLabel = token.unlimited_quota
      ? t("codego.tokens.unlimited", { defaultValue: "Unlimited" })
      : t("codego.tokens.remaining", {
          count: token.remain_quota ?? 0,
          defaultValue: `${token.remain_quota ?? 0} remaining`,
        });
    const desktopTokenId = summary?.tokens.desktop_token?.id;
    const suffix =
      token.id === desktopTokenId
        ? t("codego.tokens.desktop", { defaultValue: "Desktop" })
        : quotaLabel;
    return `${token.name} (${suffix})`;
  };

  const handleFetchTokens = async () => {
    setIsFetchingTokens(true);
    try {
      setShouldLoadTokens(true);
      const tokensPage = await codegoApi.getTokens(TOKEN_QUERY);
      queryClient.setQueryData(codegoKeys.tokens(TOKEN_QUERY), tokensPage);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("providerForm.codego.loadKeysFailed", {
            defaultValue: "获取可用 Key 失败",
          }),
      );
    } finally {
      setIsFetchingTokens(false);
    }
  };

  const handleFetchModels = async () => {
    if (!selectedTokenId) {
      toast.error(
        t("providerForm.codego.selectKeyFirst", {
          defaultValue: "请先获取并选择一个 API Key",
        }),
      );
      return;
    }

    setIsFetchingModels(true);
    try {
      const tokenId = Number(selectedTokenId);
      const [tokenKeyResult, rawTemplate] = await Promise.all([
        codegoApi.getTokenKey(tokenId),
        codegoApi.getConfigTemplate(tool),
      ]);
      const template = normalizeTemplate(rawTemplate);
      const fetchedModels = normalizeModelList(
        (
          await codegoApi.fetchModelsForToken({
            tool,
            endpoint: template.endpoint,
            apiKey: tokenKeyResult.key,
          })
        ).map((model) => model.id),
      );
      if (fetchedModels.length === 0) {
        toast.error(
          t("providerForm.codego.noModels", {
            defaultValue: "当前账号没有可用模型",
          }),
        );
        return;
      }
      setAvailableModels(fetchedModels);
      setModelsLoaded(true);
      setLoadedTokenId(selectedTokenId);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("providerForm.codego.loadModelsFailed", {
            defaultValue: "获取模型列表失败",
          }),
      );
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleOpenAuthorizationUrl = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
      setAuthError(null);
    } catch (error) {
      setAuthError(
        extractErrorMessage(error) ||
          t("codego.auth.openBrowserFailed", {
            defaultValue: "无法打开浏览器完成授权",
          }),
      );
    }
  };

  const handleStartAuth = async () => {
    try {
      stopAuthPolling();
      setAuthError(null);
      const session = await startAuthMutation.mutateAsync({
        serverAddress,
        deviceName: CODEGO_DEVICE_NAME,
      });
      setAuthSession(session);

      try {
        await navigator.clipboard.writeText(session.userCode);
      } catch {
        // ignore clipboard errors
      }

      await handleOpenAuthorizationUrl(session.verificationUri);

      authExpireRef.current = Date.now() + session.expiresIn * 1000;

      const pollOnce = async () => {
        if (!authExpireRef.current || Date.now() >= authExpireRef.current) {
          stopAuthPolling();
          setAuthError(
            t("codego.auth.sessionExpired", {
              defaultValue: "授权会话已过期，请重新开始。",
            }),
          );
          return;
        }

        try {
          const result = await pollAuthMutation.mutateAsync({
            serverAddress,
            sessionId: session.sessionId,
          });

          if (result.authenticated) {
            await syncCodeGoDesktopAuthState(queryClient, 4, {
              serverAddress: result.serverAddress || serverAddress,
              userId: result.userId,
              deviceId: result.deviceId,
              lastUsername: result.lastUsername,
            });
            stopAuthPolling();
            setAuthSession(null);
            setAuthError(null);
            toast.success(
              t("codego.dashboard.connected", {
                defaultValue: "codego 授权成功",
              }),
            );
            return;
          }

          if (result.status === "rejected") {
            stopAuthPolling();
            setAuthSession(null);
            setAuthError(
              t("codego.auth.sessionRejected", {
                defaultValue: "网页端已拒绝本次授权，请重新开始。",
              }),
            );
            return;
          }

          if (result.status === "expired") {
            stopAuthPolling();
            setAuthSession(null);
            setAuthError(
              t("codego.auth.sessionExpired", {
                defaultValue: "授权会话已过期，请重新开始。",
              }),
            );
          }
        } catch (error) {
          const message =
            extractErrorMessage(error) ||
            t("codego.auth.verifyFailed", {
              defaultValue: "桌面授权校验失败",
            });
          if (!message.toLowerCase().includes("pending")) {
            stopAuthPolling();
            setAuthError(message);
          }
        }
      };

      void pollOnce();
      authTimerRef.current = window.setInterval(
        () => void pollOnce(),
        Math.max(session.interval, 3) * 1000,
      );
    } catch (error) {
      setAuthError(
        extractErrorMessage(error) ||
          t("codego.auth.startFailed", {
            defaultValue: "无法启动 codego 授权",
          }),
      );
    }
  };

  const handleApply = async () => {
    if (!selectedTokenId) {
      toast.error(
        t("providerForm.codego.selectKeyFirst", {
          defaultValue: "请先获取并选择一个 API Key",
        }),
      );
      return;
    }
    if (!isModelSelectionReady) {
      toast.error(
        t("providerForm.codego.selectModelsFirst", {
          defaultValue: "请先获取模型列表并完成模型选择",
        }),
      );
      return;
    }

    setIsApplying(true);
    try {
      const tokenId = Number(selectedTokenId);
      const [tokenKeyResult, rawTemplate, nextSummary] = await Promise.all([
        codegoApi.getTokenKey(tokenId),
        codegoApi.getConfigTemplate(tool),
        codegoApi.getAccountSummary(),
      ]);
      const template = normalizeTemplate(rawTemplate);
      const normalizedAvailableModels = normalizeModelList(availableModels);
      const selectedModels =
        tool === "codex"
          ? selectedCatalogModels
          : tool === "gemini"
            ? selectedPrimaryModel
              ? [selectedPrimaryModel]
              : []
            : tool === "claude"
              ? normalizeModelList(
                  [
                    claudeModels.primary,
                    claudeModels.sonnet,
                    claudeModels.opus,
                    claudeModels.haiku,
                    claudeModels.fable,
                  ].filter(Boolean),
                )
              : selectedSharedModels;

      await onApply({
        template,
        fullKey: tokenKeyResult.key,
        serverAddress,
        tokenId,
        tokenName:
          selectedToken?.name ||
          summary?.tokens.desktop_token?.name ||
          `token-${tokenId}`,
        availableModels: normalizedAvailableModels,
        primaryModel:
          tool === "claude"
            ? claudeModels.primary
            : selectedPrimaryModel || selectedModels[0],
        selectedModels,
        claudeModels:
          tool === "claude"
            ? {
                primary: claudeModels.primary,
                sonnet: claudeModels.sonnet,
                opus: claudeModels.opus,
                haiku: claudeModels.haiku,
                ...(claudeModels.fable ? { fable: claudeModels.fable } : {}),
              }
            : undefined,
        username: nextSummary.account.username,
      });

      await summaryQuery.refetch();
      toast.success(
        t("providerForm.codego.applySuccess", {
          defaultValue: "已填入 codego 配置",
        }),
      );
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("providerForm.codego.applyFailed", {
            defaultValue: "填入 codego 配置失败",
          }),
      );
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-primary/15 bg-background/70 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
              <CodeGoMark size={20} className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">
                codego
              </div>
              <div className="text-xs text-muted-foreground">
                {t("providerForm.codego.panelHint", {
                  defaultValue:
                    "授权后按当前账号自动填入 API Key、模型和固定请求地址。",
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1">
              {serverAddress || CODEGO_SERVER_URL}
            </span>
            <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1">
              {t("providerForm.codego.browserAuth", {
                defaultValue: "浏览器授权",
              })}
            </span>
            <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-1">
              {t("providerForm.codego.autoFill", {
                defaultValue: "一键填入",
              })}
            </span>
          </div>
        </div>

        {isAuthenticated ? (
          <Button
            type="button"
            onClick={() => void handleApply()}
            disabled={isApplying || !canApply}
            className="shrink-0 gap-2"
          >
            {isApplying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WandSparkles className="h-4 w-4" />
            )}
            {t("providerForm.codego.applyButton", {
              defaultValue: "一键填入当前工具",
            })}
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => void handleStartAuth()}
            disabled={startAuthMutation.isPending || pollAuthMutation.isPending}
            className="shrink-0 gap-2"
          >
            {startAuthMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {t("providerForm.codego.authorizeButton", {
              defaultValue: "浏览器授权 codego",
            })}
          </Button>
        )}
      </div>

      <CodeGoSecureStorageNotice
        status={authQuery.data?.secureStorageStatus}
        message={authQuery.data?.secureStorageMessage}
      />

      {(authError || authQuery.error) && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {authError ||
              extractErrorMessage(authQuery.error) ||
              t("codego.auth.readStateFailed", {
                defaultValue: "无法读取本地授权状态",
              })}
          </span>
        </div>
      )}

      {authSession ? (
        <div className="space-y-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">
                {t("providerForm.codego.enterCodeTitle", {
                  defaultValue: "在浏览器中输入授权码",
                })}
              </div>
              <div className="mt-1 font-mono text-xl font-semibold tracking-[0.16em] text-foreground">
                {authSession.userCode}
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {t("providerForm.codego.codeCopiedHint", {
                defaultValue: "授权码已复制，等待网页端确认。",
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void handleOpenAuthorizationUrl(authSession.verificationUri)
              }
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {t("codego.auth.openBrowserAgain", {
                defaultValue: "重新打开浏览器",
              })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                stopAuthPolling();
                setAuthSession(null);
                setAuthError(null);
              }}
            >
              {t("common.cancel", { defaultValue: "取消" })}
            </Button>
          </div>
        </div>
      ) : null}

      {isAuthenticated && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">
                  {t("providerForm.codego.accountLabel", {
                    defaultValue: "当前账号",
                  })}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {summary?.account.display_name ||
                    summary?.account.username ||
                    authQuery.data?.lastUsername ||
                    "codego"}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">
                  {t("providerForm.codego.requestAddressLabel", {
                    defaultValue: "请求地址",
                  })}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {serverAddress}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <div className="text-xs text-muted-foreground">
                  {t("providerForm.codego.modelCountLabel", {
                    defaultValue: "已加载模型",
                  })}
                </div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {modelsLoaded ? availableModels.length : previewModels.length}
                </div>
              </div>
            </div>

            {previewModels.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {previewModels.map((model) => (
                  <span
                    key={model}
                    className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                  >
                    {model}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t("providerForm.codego.keySectionTitle", {
                      defaultValue: "选择 API Key",
                    })}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("providerForm.codego.keySectionHint", {
                      defaultValue:
                        "点击获取当前账号下的可用 Key，再选择一个用于填入当前工具。",
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleFetchTokens()}
                  disabled={isFetchingTokens}
                  className="gap-2"
                >
                  {isFetchingTokens ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  {t("providerForm.codego.fetchKeysButton", {
                    defaultValue: "获取 Key",
                  })}
                </Button>
              </div>

              {shouldLoadTokens ? (
                tokenItems.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      {t("providerForm.codego.keySelectLabel", {
                        defaultValue: "可用 Key",
                      })}
                    </Label>
                    <Select
                      value={selectedTokenId}
                      onValueChange={setSelectedTokenId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            "providerForm.codego.keySelectPlaceholder",
                            {
                              defaultValue: "选择一个 Key",
                            },
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {tokenItems.map((token) => (
                          <SelectItem key={token.id} value={String(token.id)}>
                            {tokenOptionLabel(token)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedToken ? (
                      <div className="rounded-md border border-border/70 bg-background px-2.5 py-2 text-xs text-muted-foreground">
                        <div>{selectedToken.name}</div>
                        <div className="mt-1 font-mono">
                          {selectedToken.key}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    {t("providerForm.codego.noKeys", {
                      defaultValue: "当前账号下没有可用 Key。",
                    })}
                  </div>
                )
              ) : null}
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {t("providerForm.codego.modelSectionTitle", {
                      defaultValue: "选择模型映射",
                    })}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("providerForm.codego.modelSectionHint", {
                      defaultValue:
                        "从当前账号的模型列表中选择要写入当前工具的模型配置。",
                    })}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleFetchModels()}
                  disabled={isFetchingModels}
                  className="gap-2"
                >
                  {isFetchingModels ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t("providerForm.codego.fetchModelsButton", {
                    defaultValue: "获取模型列表",
                  })}
                </Button>
              </div>

              {modelsLoaded ? (
                availableModels.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {tool === "claude" ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {[
                          [
                            "primary",
                            t("providerForm.codego.primaryModelLabel", {
                              defaultValue: "主模型",
                            }),
                          ],
                          [
                            "sonnet",
                            t("providerForm.codego.sonnetModelLabel", {
                              defaultValue: "Sonnet",
                            }),
                          ],
                          [
                            "opus",
                            t("providerForm.codego.opusModelLabel", {
                              defaultValue: "Opus",
                            }),
                          ],
                          [
                            "haiku",
                            t("providerForm.codego.haikuModelLabel", {
                              defaultValue: "Haiku",
                            }),
                          ],
                          [
                            "fable",
                            t("providerForm.codego.fableModelLabel", {
                              defaultValue: "Fable（可选）",
                            }),
                          ],
                        ].map(([key, label]) => (
                          <div key={key} className="space-y-2">
                            <Label className="text-xs text-muted-foreground">
                              {label}
                            </Label>
                            <Select
                              value={
                                claudeModels[key as keyof typeof claudeModels]
                              }
                              onValueChange={(value) =>
                                setClaudeModels((current) => ({
                                  ...current,
                                  [key]: value === "__empty__" ? "" : value,
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={label} />
                              </SelectTrigger>
                              <SelectContent>
                                {key === "fable" ? (
                                  <SelectItem value="__empty__">
                                    {t("common.notSet", {
                                      defaultValue: "不设置",
                                    })}
                                  </SelectItem>
                                ) : null}
                                {availableModels.map((model) => (
                                  <SelectItem
                                    key={`${key}-${model}`}
                                    value={model}
                                  >
                                    {model}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : tool === "gemini" ? (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          {t("providerForm.codego.primaryModelLabel", {
                            defaultValue: "主模型",
                          })}
                        </Label>
                        <Select
                          value={selectedPrimaryModel}
                          onValueChange={setSelectedPrimaryModel}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t(
                                "providerForm.codego.selectPrimaryModel",
                                {
                                  defaultValue: "选择一个默认模型",
                                },
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.map((model) => (
                              <SelectItem key={model} value={model}>
                                {model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : tool === "codex" ? (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            {t("providerForm.codego.primaryModelLabel", {
                              defaultValue: "主模型",
                            })}
                          </Label>
                          <Select
                            value={selectedPrimaryModel}
                            onValueChange={(value) => {
                              setSelectedPrimaryModel(value);
                              setSelectedCatalogModels((current) =>
                                current.includes(value)
                                  ? current
                                  : [value, ...current],
                              );
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue
                                placeholder={t(
                                  "providerForm.codego.selectPrimaryModel",
                                  {
                                    defaultValue: "选择一个默认模型",
                                  },
                                )}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {availableModels.map((model) => (
                                <SelectItem key={model} value={model}>
                                  {model}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            {t("providerForm.codego.catalogModelsLabel", {
                              defaultValue: "模型映射",
                            })}
                          </Label>
                          <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background px-3 py-2">
                            {availableModels.map((model) => (
                              <label
                                key={model}
                                className="flex items-center gap-2 text-sm text-foreground"
                              >
                                <Checkbox
                                  checked={selectedCatalogModels.includes(
                                    model,
                                  )}
                                  onCheckedChange={(checked) =>
                                    toggleModel(
                                      setSelectedCatalogModels,
                                      model,
                                      checked === true,
                                    )
                                  }
                                />
                                <span className="font-mono text-xs">
                                  {model}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          {t("providerForm.codego.catalogModelsLabel", {
                            defaultValue: "模型映射",
                          })}
                        </Label>
                        <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-border/70 bg-background px-3 py-2">
                          {availableModels.map((model) => (
                            <label
                              key={model}
                              className="flex items-center gap-2 text-sm text-foreground"
                            >
                              <Checkbox
                                checked={selectedSharedModels.includes(model)}
                                onCheckedChange={(checked) =>
                                  toggleModel(
                                    setSelectedSharedModels,
                                    model,
                                    checked === true,
                                  )
                                }
                              />
                              <span className="font-mono text-xs">{model}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    {t("providerForm.codego.noModels", {
                      defaultValue: "当前账号没有可用模型",
                    })}
                  </div>
                )
              ) : (
                <div className="mt-3 rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                  {t("providerForm.codego.modelsNotLoaded", {
                    defaultValue:
                      "请先点击“获取模型列表”，再选择要写入当前工具的模型。",
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
