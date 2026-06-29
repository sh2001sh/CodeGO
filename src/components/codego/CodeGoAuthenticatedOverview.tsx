import {
  Activity,
  CheckCircle2,
  FileClock,
  Info,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CodeGoAccountSummary, CodeGoAuthState } from "@/lib/api/codego";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { CodeGoAuthorizedDevicesCard } from "./CodeGoAuthorizedDevicesCard";
import { CodeGoDiagnosticReportCard } from "./CodeGoDiagnosticReportCard";
import { CodeGoDesktopTokenCard } from "./CodeGoDesktopTokenCard";
import { CodeGoLogsExplorer } from "./CodeGoLogsExplorer";
import { CodeGoRecentUsageCard } from "./CodeGoRecentUsageCard";
import { CodeGoSecureStorageNotice } from "./CodeGoSecureStorageNotice";
import { CodeGoTokenManager } from "./CodeGoTokenManager";
import { CodeGoToolConfigPanel } from "./CodeGoToolConfigPanel";
import { CodeGoUsageTrendCard } from "./CodeGoUsageTrendCard";
import { CodeGoMark } from "./CodeGoMark";
import { formatDateTime, formatUsd } from "./codegoShared";

interface CodeGoAuthenticatedOverviewProps {
  activeTab: string;
  summary?: CodeGoAccountSummary;
  authState?: CodeGoAuthState;
  usageModels: string[];
  isAuthenticated: boolean;
  summaryIsFetching: boolean;
  logoutPending: boolean;
  isEnsuringToken: boolean;
  onActiveTabChange: (value: string) => void;
  onRefresh: () => void;
  onOpenProviders: () => void;
  onLogout: () => void;
  onCopyToken: () => void;
  onEnsureToken: () => void;
  onOpenTopUp: () => void;
}

type ConsoleSection =
  | "overview"
  | "tools"
  | "tokens"
  | "logs"
  | "devices"
  | "diagnostics";

export function CodeGoAuthenticatedOverview({
  activeTab,
  summary,
  authState,
  usageModels,
  isAuthenticated,
  summaryIsFetching,
  logoutPending,
  isEnsuringToken,
  onActiveTabChange,
  onRefresh,
  onOpenProviders,
  onLogout,
  onCopyToken,
  onEnsureToken,
  onOpenTopUp,
}: CodeGoAuthenticatedOverviewProps) {
  const { t } = useTranslation();
  const summaryMetrics = [
    [
      t("codego.overview.metrics.generalQuota", "General quota"),
      formatUsd(summary?.account.quota_usd || 0),
    ],
    [
      t("codego.overview.metrics.claudeQuota", "Claude quota"),
      formatUsd(summary?.account.claude_quota_usd || 0),
    ],
    [
      t("codego.overview.metrics.used", "Used"),
      formatUsd(summary?.account.used_quota_usd || 0),
    ],
    [
      t("codego.overview.metrics.requests", "Requests"),
      String(summary?.account.request_count || 0),
    ],
  ] as const;

  const overviewHighlights = [
    [
      t("codego.overview.highlights.connectedServer", "Connected server"),
      authState?.serverAddress || "https://shu26.cfd",
    ],
    [
      t("codego.overview.highlights.desktopToken", "Desktop token"),
      summary?.tokens.desktop_token?.name ||
        t(
          "codego.overview.highlights.desktopTokenEmpty",
          "Create or refresh from Tokens",
        ),
    ],
    [
      t("codego.overview.highlights.lastRequest", "Last request"),
      formatDateTime(summary?.usage.last_request_at),
    ],
  ] as const;

  const navItems: Array<{
    id: ConsoleSection;
    icon: typeof Activity;
    label: string;
    description: string;
  }> = [
    {
      id: "overview",
      icon: Activity,
      label: t("codego.console.nav.overview", "Overview"),
      description: t(
        "codego.console.nav.overviewDesc",
        "额度、最近请求和服务状态",
      ),
    },
    {
      id: "tools",
      icon: Wrench,
      label: t("codego.console.nav.tools", "Tool setup"),
      description: t(
        "codego.console.nav.toolsDesc",
        "配置 Codex、Claude Code、Gemini 等工具",
      ),
    },
    {
      id: "tokens",
      icon: KeyRound,
      label: t("codego.console.nav.tokens", "Tokens"),
      description: t(
        "codego.console.nav.tokensDesc",
        "创建、复制和应用桌面令牌",
      ),
    },
    {
      id: "logs",
      icon: FileClock,
      label: t("codego.console.nav.logs", "Logs"),
      description: t(
        "codego.console.nav.logsDesc",
        "按模型、令牌和请求筛选日志",
      ),
    },
    {
      id: "devices",
      icon: Laptop,
      label: t("codego.console.nav.devices", "Devices"),
      description: t("codego.console.nav.devicesDesc", "查看和撤销已授权设备"),
    },
    {
      id: "diagnostics",
      icon: ShieldAlert,
      label: t("codego.console.nav.diagnostics", "Diagnostics"),
      description: t(
        "codego.console.nav.diagnosticsDesc",
        "审阅脱敏崩溃报告并上报",
      ),
    },
  ];

  const renderServiceStatus = () => (
    <Card className="codego-panel shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          {t("codego.overview.serviceStatus", "Service status")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={
            summary?.service.maintenance
              ? "flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3"
              : summary?.service.status === "ok"
                ? "flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
                : "flex items-start gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
          }
        >
          {summary?.service.maintenance ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 text-amber-700" />
          ) : summary?.service.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
          )}
          <div className="space-y-1">
            <div className="text-sm font-medium capitalize">
              {summary?.service.status || "ok"}
            </div>
            <div className="text-xs text-muted-foreground">
              {summary?.service.notice ||
                t(
                  "codego.overview.noServiceNotice",
                  "No active service notice.",
                )}
            </div>
          </div>
        </div>
        {summary?.service.recommended_action ? (
          <div
            className={
              summary.service.maintenance
                ? "text-sm text-amber-700 dark:text-amber-300"
                : "text-sm text-muted-foreground"
            }
          >
            {summary.service.recommended_action}
          </div>
        ) : null}
        {summary?.service.affected_scopes?.length ? (
          <div className="flex flex-wrap gap-2">
            {summary.service.affected_scopes.map((scope) => (
              <Badge key={scope} variant="outline">
                {scope}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );

  const renderModelsCard = () => (
    <Card className="codego-panel shadow-none">
      <CardHeader>
        <CardTitle className="text-base">
          {t("codego.overview.availableModels", "Available models")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {usageModels.length > 0 ? (
            usageModels.map((model) => (
              <Badge key={model} variant="outline">
                {model}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              {t(
                "codego.overview.noModelMetadata",
                "No model metadata available.",
              )}
            </span>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">
              {t("codego.overview.today", "Today")}
            </div>
            <div className="text-sm font-medium">
              {formatUsd(summary?.usage.today_usd || 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {t("codego.overview.last7Days", "Last 7 days")}
            </div>
            <div className="text-sm font-medium">
              {formatUsd(summary?.usage.last_7_days_usd || 0)}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-muted-foreground">
              {t("codego.overview.highlights.lastRequest", "Last request")}
            </div>
            <div className="text-sm font-medium">
              {formatDateTime(summary?.usage.last_request_at)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderSection = () => {
    switch (activeTab as ConsoleSection) {
      case "tools":
        return <CodeGoToolConfigPanel enabled={isAuthenticated} />;
      case "tokens":
        return (
          <CodeGoTokenManager
            enabled={isAuthenticated}
            desktopTokenId={summary?.tokens.desktop_token?.id}
          />
        );
      case "logs":
        return <CodeGoLogsExplorer enabled={isAuthenticated} />;
      case "devices":
        return (
          <CodeGoAuthorizedDevicesCard
            enabled={isAuthenticated}
            currentDeviceId={authState?.deviceId}
          />
        );
      case "diagnostics":
        return <CodeGoDiagnosticReportCard enabled={isAuthenticated} />;
      case "overview":
      default:
        return (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
              <div className="space-y-6">
                <CodeGoDesktopTokenCard
                  summary={summary}
                  isEnsuringToken={isEnsuringToken}
                  onCopyToken={onCopyToken}
                  onEnsureToken={onEnsureToken}
                  onManageTokens={() => onActiveTabChange("tokens")}
                  onOpenTopUp={onOpenTopUp}
                />
                <CodeGoRecentUsageCard
                  summary={summary}
                  onOpenLogs={() => onActiveTabChange("logs")}
                />
              </div>
              <div className="space-y-6">
                <CodeGoUsageTrendCard enabled={isAuthenticated} />
                {renderServiceStatus()}
              </div>
            </div>
            <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
              {renderModelsCard()}
              <CodeGoToolConfigPanel enabled={isAuthenticated} />
            </div>
          </div>
        );
    }
  };

  return (
    <section className="flex flex-1 flex-col px-6 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
        <div className="codego-shell overflow-hidden">
          <div className="grid xl:grid-cols-[1.08fr_0.92fr]">
            <div className="border-b border-white/60 p-6 dark:border-white/10 xl:border-b-0 xl:border-r">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 dark:border-white/10 dark:bg-white/[0.05]">
                    <CodeGoMark size={40} className="h-10 w-10" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="codego-chip-warm">
                        {t("codego.shell.desktopTitle", {
                          defaultValue: "CodeGo desktop",
                        })}
                      </Badge>
                      {summaryIsFetching ? (
                        <Badge variant="outline" className="gap-1.5">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          {t("common.refreshing", "Refreshing")}
                        </Badge>
                      ) : null}
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                      {summary?.account.display_name ||
                        summary?.account.username}
                    </h1>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      {t(
                        "codego.overview.heroDescription",
                        "Browser-approved desktop access with token rotation, quota checks, and log visibility in one place.",
                      )}
                    </p>
                  </div>
                </div>
                <div className="hidden rounded-full border border-white/70 bg-white/72 px-3 py-1 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.04] sm:block">
                  {t("codego.overview.sessionLive", "Session live")}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {overviewHighlights.map(([label, value]) => (
                  <div key={label} className="codego-metric-card">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-2 text-sm font-medium leading-6 text-foreground">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onRefresh}
                  className="h-9 gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("common.refresh", "Refresh")}
                </Button>
                <Button
                  variant="outline"
                  onClick={onOpenProviders}
                  className="h-9 gap-2"
                >
                  <Wrench className="h-4 w-4" />
                  {t("codego.overview.providers", "Providers")}
                </Button>
                <Button
                  variant="outline"
                  onClick={onLogout}
                  disabled={logoutPending}
                  className="h-9 gap-2"
                >
                  {logoutPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  {t("codego.overview.disconnect", "Disconnect")}
                </Button>
              </div>
            </div>

            <div className="bg-white/44 p-6 dark:bg-white/[0.015]">
              <CodeGoSecureStorageNotice
                status={authState?.secureStorageStatus}
                message={authState?.secureStorageMessage}
              />

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {summaryMetrics.map(([label, value]) => (
                  <Card key={label} className="codego-panel shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-semibold">{value}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="codego-shell h-fit p-3">
            <div className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onActiveTabChange(item.id)}
                    className={cn(
                      "codego-nav-item w-full items-start px-3.5 py-3",
                      active && "codego-nav-item-active",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">{renderSection()}</div>
        </div>
      </div>
    </section>
  );
}
