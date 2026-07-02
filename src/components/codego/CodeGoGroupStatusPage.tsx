import { ExternalLink, Layers3, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { settingsApi } from "@/lib/api";
import type {
  CodeGoGroupAvailabilityStatus,
  CodeGoGroupModelStatusItem,
  CodeGoGroupStatusItem,
} from "@/lib/api/codego";
import {
  useCodeGoAuthQuery,
  useCodeGoGroupStatusQuery,
  useCodeGoSummaryQuery,
} from "@/lib/query";
import { useSettingsQuery } from "@/lib/query/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";

type StatusMeta = {
  label: string;
  className: string;
  dotClassName: string;
};

const STATUS_META: Record<CodeGoGroupAvailabilityStatus, StatusMeta> = {
  healthy: {
    label: "正常",
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
    dotClassName: "bg-emerald-500",
  },
  slow: {
    label: "缓慢",
    className:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200",
    dotClassName: "bg-amber-500",
  },
  degraded: {
    label: "故障",
    className: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-200",
    dotClassName: "bg-red-500",
  },
  unknown: {
    label: "观测中",
    className:
      "border-border bg-muted/40 text-muted-foreground dark:bg-white/[0.04]",
    dotClassName: "bg-muted-foreground",
  },
};

const statusWeight: Record<CodeGoGroupAvailabilityStatus, number> = {
  degraded: 0,
  slow: 1,
  unknown: 2,
  healthy: 3,
};

const formatWindowLabel = (hours?: number | null) => {
  if (!hours || hours <= 0) return "暂无采样窗口";
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `最近 ${minutes} 分钟`;
  if (minutes % 60 === 0) return `最近 ${minutes / 60} 小时`;
  return `最近 ${minutes} 分钟`;
};

const formatRate = (rate: number | null | undefined) =>
  rate == null ? "--" : `${rate.toFixed(rate >= 99.95 ? 2 : 1)}%`;

const formatGroupStatusError = (error: unknown): string => {
  const message = extractErrorMessage(error);
  if (
    message.includes("/api/desktop/group-status") &&
    (message.includes("404") || message.includes("Invalid URL"))
  ) {
    return "网站服务尚未更新桌面分组状态接口。请等待 shu26.cfd 部署最新版 new-api 后重试。";
  }
  return message || "分组状态读取失败";
};

const getStatusMeta = (status?: string): StatusMeta =>
  STATUS_META[(status as CodeGoGroupAvailabilityStatus) || "unknown"] ??
  STATUS_META.unknown;

const sortGroups = (items: CodeGoGroupStatusItem[]) =>
  [...items]
    .map((item) => ({
      ...item,
      models: [...(item.models ?? [])].sort((left, right) => {
        const requestDiff =
          (right.request_count ?? 0) - (left.request_count ?? 0);
        if (requestDiff !== 0) return requestDiff;
        const statusDiff =
          statusWeight[left.status] - statusWeight[right.status];
        if (statusDiff !== 0) return statusDiff;
        return left.model.localeCompare(right.model, "en");
      }),
    }))
    .sort((left, right) => {
      const requestDiff =
        (right.request_count ?? 0) - (left.request_count ?? 0);
      if (requestDiff !== 0) return requestDiff;
      return left.group.localeCompare(right.group, "zh-CN");
    });

const summarizeGroups = (items: CodeGoGroupStatusItem[]) => {
  const models = items.flatMap((item) => item.models ?? []);
  return {
    groups: items.length,
    models: models.length,
    healthy: models.filter((item) => item.status === "healthy").length,
    slow: models.filter((item) => item.status === "slow").length,
    degraded: models.filter((item) => item.status === "degraded").length,
    unknown: models.filter((item) => item.status === "unknown").length,
  };
};

const buildFallbackGroupStatus = (
  group: string,
  models: string[],
): CodeGoGroupStatusItem[] => {
  const uniqueModels = Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, "en"));
  if (uniqueModels.length === 0) return [];
  return [
    {
      group,
      status: "unknown",
      request_count: 0,
      models: uniqueModels.map((model) => ({
        model,
        status: "unknown",
        success_rate: null,
        sample_window: 0,
        series_window: 0,
        bucket_seconds: 3600,
        request_count: 0,
        series: [],
      })),
    },
  ];
};

function ModelStatusCard({ item }: { item: CodeGoGroupModelStatusItem }) {
  const meta = getStatusMeta(item.status);
  const series = item.series ?? [];
  const sampleWindow = formatWindowLabel(item.sample_window);
  const seriesWindow = formatWindowLabel(
    item.series_window ?? item.sample_window,
  );

  return (
    <div className="rounded-lg border border-border bg-background/80 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn("h-2 w-2 rounded-full", meta.dotClassName)}
              aria-hidden
            />
            <div className="break-all font-mono text-xs font-medium text-foreground">
              {item.model}
            </div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {sampleWindow}
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0", meta.className)}>
          {meta.label}
        </Badge>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="text-xs text-muted-foreground">请求成功率</div>
        <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {formatRate(item.success_rate)}
        </div>
      </div>

      <div
        className="mt-3 grid gap-0.5"
        style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
        title={seriesWindow}
      >
        {Array.from({ length: 24 }).map((_, index) => {
          const bucket = series[index];
          const rate = bucket?.success_rate;
          const tone =
            !bucket || bucket.request_count <= 0 || rate == null
              ? "bg-muted"
              : rate >= 85
                ? "bg-emerald-500"
                : rate >= 30
                  ? "bg-amber-500"
                  : "bg-red-500";
          return (
            <span
              key={`${item.model}-${index}`}
              className={cn("h-2 rounded-sm", tone)}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}

export function CodeGoGroupStatusPage() {
  const { t } = useTranslation();
  const authQuery = useCodeGoAuthQuery();
  const settingsQuery = useSettingsQuery();
  const enabled = Boolean(authQuery.data?.authenticated);
  const groupStatusQuery = useCodeGoGroupStatusQuery(enabled);
  const summaryQuery = useCodeGoSummaryQuery(
    enabled,
    settingsQuery.data?.codegoAutoRefreshEnabled ?? true,
  );
  const serverAddress = authQuery.data?.serverAddress || "https://shu26.cfd";
  const currentGroup = summaryQuery.data?.account.group || "default";
  const fallbackGroups = useMemo(
    () =>
      buildFallbackGroupStatus(
        currentGroup,
        summaryQuery.data?.usage.available_models ?? [],
      ),
    [currentGroup, summaryQuery.data?.usage.available_models],
  );
  const groups = useMemo(
    () =>
      sortGroups(
        groupStatusQuery.data?.data?.length
          ? groupStatusQuery.data.data
          : fallbackGroups,
      ),
    [fallbackGroups, groupStatusQuery.data?.data],
  );
  const summary = useMemo(() => summarizeGroups(groups), [groups]);

  const handleOpenWebsite = async () => {
    try {
      await settingsApi.openExternal(`${serverAddress}/group-status`);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.groups.openFailed", "打开分组状态失败"),
      );
    }
  };

  const handleRefresh = () => {
    void groupStatusQuery.refetch();
    void summaryQuery.refetch();
  };

  return (
    <section className="flex flex-1 flex-col px-6 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5">
        <Card className="codego-shell shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="h-4 w-4 text-muted-foreground" />
                {t("codego.groups.title", "分组状态")}
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t(
                  "codego.groups.description",
                  "同步网站分组下的模型状态，用于确认各分组模型是否正常、缓慢或故障。",
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={handleRefresh}
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    groupStatusQuery.isFetching && "animate-spin",
                  )}
                />
                {t("common.refresh", "刷新")}
              </Button>
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={() => void handleOpenWebsite()}
              >
                <ExternalLink className="h-4 w-4" />
                {t("codego.groups.openWebsite", "打开网页")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {[
                ["当前分组", currentGroup],
                ["分组", summary.groups],
                ["模型", summary.models],
                ["正常", summary.healthy],
                ["缓慢", summary.slow],
                ["故障", summary.degraded],
              ].map(([label, value]) => (
                <div key={label} className="codego-metric-card">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {groupStatusQuery.isError ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formatGroupStatusError(groupStatusQuery.error)}
              </div>
            ) : null}

            {groups.length > 0 ? (
              <div className="space-y-4">
                {groups.map((group) => {
                  const meta = getStatusMeta(group.status);
                  return (
                    <div key={group.group} className="codego-panel px-4 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                meta.dotClassName,
                              )}
                              aria-hidden
                            />
                            <h3 className="text-sm font-semibold text-foreground">
                              {group.group}
                            </h3>
                            {group.group === currentGroup ? (
                              <Badge className="codego-chip-warm">当前</Badge>
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {group.models.length} 个模型 ·{" "}
                            {group.request_count ?? 0} 次请求
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("w-fit", meta.className)}
                        >
                          {meta.label}
                        </Badge>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        {group.models.map((model) => (
                          <ModelStatusCard
                            key={`${group.group}-${model.model}`}
                            item={model}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <div className="text-sm font-medium text-foreground">
                  {groupStatusQuery.isFetching
                    ? t("common.loading", "加载中...")
                    : t("codego.groups.empty", "暂无可展示的模型状态")}
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "codego.groups.emptyHint",
                    "当前账号还没有可用模型，或网站暂未产生用于监测的请求样本。",
                  )}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
