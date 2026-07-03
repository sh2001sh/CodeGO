import { Boxes, ExternalLink, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { settingsApi } from "@/lib/api";
import {
  useCodeGoAuthQuery,
  useCodeGoPricingQuery,
  useCodeGoSummaryQuery,
} from "@/lib/query";
import { useSettingsQuery } from "@/lib/query/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errorUtils";
import type { CodeGoPricingModel } from "@/lib/api/codego";

function formatRatio(value: number) {
  if (!Number.isFinite(value)) return "--";
  return value >= 10 ? value.toFixed(0) : value.toFixed(2);
}

function formatDetail(item: CodeGoPricingModel) {
  const parts: string[] = [];
  parts.push(item.quota_type === 1 ? "按次计费" : "Token 计费");
  if (item.quota_type !== 1) {
    parts.push(`补全 x${formatRatio(item.completion_ratio)}`);
  }
  if (item.cache_ratio != null) {
    parts.push(`缓存 x${formatRatio(item.cache_ratio)}`);
  }
  if (item.create_cache_ratio != null) {
    parts.push(`写入 x${formatRatio(item.create_cache_ratio)}`);
  }
  return parts.join(" · ");
}

function normalizeGroups(groups: string[]) {
  return [...new Set(groups.map((group) => group.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right, "zh-CN"),
  );
}

export function CodeGoModelPlazaPage() {
  const { t } = useTranslation();
  const authQuery = useCodeGoAuthQuery();
  const settingsQuery = useSettingsQuery();
  const enabled = Boolean(authQuery.data?.authenticated);
  const summaryQuery = useCodeGoSummaryQuery(
    enabled,
    settingsQuery.data?.codegoAutoRefreshEnabled ?? true,
  );
  const pricingQuery = useCodeGoPricingQuery(enabled);
  const serverAddress = authQuery.data?.serverAddress || "https://shu26.cfd";
  const currentGroup = summaryQuery.data?.account.group || "default";

  const models = useMemo(
    () =>
      [...(pricingQuery.data?.data ?? [])].sort((left, right) => {
        const leftGroups = left.enable_groups?.length ?? 0;
        const rightGroups = right.enable_groups?.length ?? 0;
        if (leftGroups !== rightGroups) return rightGroups - leftGroups;
        return left.model_name.localeCompare(right.model_name, "en");
      }),
    [pricingQuery.data?.data],
  );

  const groupCount = useMemo(() => {
    const groups = new Set<string>();
    for (const item of models) {
      for (const group of item.enable_groups ?? []) {
        if (group && group !== "auto" && group !== "all") {
          groups.add(group);
        }
      }
    }
    return groups.size;
  }, [models]);

  const handleOpenWebsite = async () => {
    try {
      await settingsApi.openExternal(`${serverAddress}/pricing`);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.modelPlaza.openFailed", "Failed to open model plaza"),
      );
    }
  };

  const handleRefresh = () => {
    void pricingQuery.refetch();
    void summaryQuery.refetch();
  };

  return (
    <section className="flex flex-1 flex-col px-6 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5">
        <Card className="codego-shell shadow-none">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-muted-foreground" />
                {t("codego.modelPlaza.title", "模型广场")}
              </CardTitle>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t(
                  "codego.modelPlaza.description",
                  "根据当前授权账号同步可用模型、分组和计费信息。",
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
                    pricingQuery.isFetching && "animate-spin",
                  )}
                />
                {t("common.refresh", "Refresh")}
              </Button>
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={() => void handleOpenWebsite()}
              >
                <ExternalLink className="h-4 w-4" />
                {t("codego.modelPlaza.openWebsite", "打开网站")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["当前分组", currentGroup],
                ["模型", String(models.length)],
                ["分组", String(groupCount)],
              ].map(([label, value]) => (
                <div key={label} className="codego-metric-card">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums text-foreground">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {pricingQuery.isError ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {extractErrorMessage(pricingQuery.error) ||
                  t("codego.modelPlaza.loadFailed", "模型广场加载失败")}
              </div>
            ) : null}

            {models.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border bg-background/80">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">模型</TableHead>
                      <TableHead className="w-[35%]">分组</TableHead>
                      <TableHead>说明</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {models.map((item) => {
                      const groups = normalizeGroups(item.enable_groups ?? []);
                      return (
                        <TableRow key={item.model_name}>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <div className="break-all font-mono text-sm font-medium text-foreground">
                                {item.model_name}
                              </div>
                              {item.description ? (
                                <div className="text-xs text-muted-foreground">
                                  {item.description}
                                </div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex flex-wrap gap-1.5">
                              {groups.length > 0 ? (
                                groups.map((group) => (
                                  <Badge
                                    key={`${item.model_name}-${group}`}
                                    variant="outline"
                                    className="border-border bg-muted/40 text-muted-foreground"
                                  >
                                    {group === "all" ? "全部" : group}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  未配置
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-muted-foreground">
                            {formatDetail(item) || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <div className="text-sm font-medium text-foreground">
                  {pricingQuery.isFetching
                    ? t("common.loading", "Loading...")
                    : t(
                        "codego.modelPlaza.empty",
                        "当前接口暂未返回模型列表。",
                      )}
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "codego.modelPlaza.emptyHint",
                    "请刷新重试，或打开网站查看完整模型广场。",
                  )}
                </p>
              </div>
            )}

            {summaryQuery.data?.account.group ? (
              <div>
                <Badge variant="outline">
                  {t("codego.groups.current", "当前分组")}: {" "}
                  {summaryQuery.data.account.group}
                </Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
