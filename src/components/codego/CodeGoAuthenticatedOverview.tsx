import {
  Info,
  Loader2,
  LogOut,
  RefreshCw,
  WandSparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CodeGoAccountSummary, CodeGoAuthState } from "@/lib/api/codego";
import { CodeGoAuthorizedDevicesCard } from "./CodeGoAuthorizedDevicesCard";
import { CodeGoDiagnosticReportCard } from "./CodeGoDiagnosticReportCard";
import { CodeGoDesktopTokenCard } from "./CodeGoDesktopTokenCard";
import { CodeGoLogsExplorer } from "./CodeGoLogsExplorer";
import { CodeGoRecentUsageCard } from "./CodeGoRecentUsageCard";
import { CodeGoTokenManager } from "./CodeGoTokenManager";
import { CodeGoToolConfigPanel } from "./CodeGoToolConfigPanel";
import { CodeGoUsageTrendCard } from "./CodeGoUsageTrendCard";
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
  return (
    <section className="flex flex-1 flex-col px-6 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className="rounded-full bg-orange-500/10 text-orange-700 hover:bg-orange-500/10">
                Code Go Desktop
              </Badge>
              {summaryIsFetching ? (
                <Badge variant="outline" className="gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Refreshing
                </Badge>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {summary?.account.display_name || summary?.account.username}
            </h1>
            <p className="text-sm text-muted-foreground">
              {authState?.serverAddress || "https://shu26.cfd"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onRefresh} className="h-9 gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={onOpenProviders} className="h-9 gap-2">
              <WandSparkles className="h-4 w-4" />
              Providers
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
              Disconnect
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                General quota
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatUsd(summary?.account.quota_usd || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Claude quota
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatUsd(summary?.account.claude_quota_usd || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {formatUsd(summary?.account.used_quota_usd || 0)}
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">
                {summary?.account.request_count || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={onActiveTabChange}
          className="flex flex-1 flex-col gap-4"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tokens">Tokens</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <CodeGoDesktopTokenCard
                  summary={summary}
                  isEnsuringToken={isEnsuringToken}
                  onCopyToken={onCopyToken}
                  onEnsureToken={onEnsureToken}
                  onManageTokens={() => onActiveTabChange("tokens")}
                  onOpenTopUp={onOpenTopUp}
                />

                <CodeGoAuthorizedDevicesCard
                  enabled={isAuthenticated}
                  currentDeviceId={authState?.deviceId}
                />

                <CodeGoRecentUsageCard
                  summary={summary}
                  onOpenLogs={() => onActiveTabChange("logs")}
                />
              </div>

              <div className="space-y-6">
                <CodeGoUsageTrendCard enabled={isAuthenticated} />

                <CodeGoToolConfigPanel enabled={isAuthenticated} />

                <Card className="border-border/70 bg-card/90">
                  <CardHeader>
                    <CardTitle className="text-base">Service status</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
                      <Info className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="space-y-1">
                        <div className="text-sm font-medium capitalize">
                          {summary?.service.status || "ok"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {summary?.service.notice || "No active service notice."}
                        </div>
                      </div>
                    </div>
                    {summary?.service.recommended_action ? (
                      <div className="text-sm text-muted-foreground">
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

                <CodeGoDiagnosticReportCard enabled={isAuthenticated} />

                <Card className="border-border/70 bg-card/90">
                  <CardHeader>
                    <CardTitle className="text-base">Available models</CardTitle>
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
                          No model metadata available.
                        </span>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">Today</div>
                        <div className="text-sm font-medium">
                          {formatUsd(summary?.usage.today_usd || 0)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Last 7 days</div>
                        <div className="text-sm font-medium">
                          {formatUsd(summary?.usage.last_7_days_usd || 0)}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-xs text-muted-foreground">Last request</div>
                        <div className="text-sm font-medium">
                          {formatDateTime(summary?.usage.last_request_at)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tokens">
            <CodeGoTokenManager
              enabled={isAuthenticated}
              desktopTokenId={summary?.tokens.desktop_token?.id}
            />
          </TabsContent>

          <TabsContent value="logs">
            <CodeGoLogsExplorer enabled={isAuthenticated} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
