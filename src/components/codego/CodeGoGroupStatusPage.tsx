import { ExternalLink, Layers3, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { settingsApi } from "@/lib/api";
import {
  useCodeGoAuthQuery,
  useCodeGoGroupsQuery,
  useCodeGoSummaryQuery,
} from "@/lib/query";
import { useSettingsQuery } from "@/lib/query/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { extractErrorMessage } from "@/utils/errorUtils";

export function CodeGoGroupStatusPage() {
  const { t } = useTranslation();
  const authQuery = useCodeGoAuthQuery();
  const settingsQuery = useSettingsQuery();
  const enabled = Boolean(authQuery.data?.authenticated);
  const groupsQuery = useCodeGoGroupsQuery(enabled);
  const summaryQuery = useCodeGoSummaryQuery(
    enabled,
    settingsQuery.data?.codegoAutoRefreshEnabled ?? true,
  );
  const serverAddress = authQuery.data?.serverAddress || "https://shu26.cfd";
  const currentGroup =
    groupsQuery.data?.current || summaryQuery.data?.account.group || "default";
  const groupItems = groupsQuery.data?.items ?? [];

  const handleOpenWebsite = async () => {
    try {
      await settingsApi.openExternal(`${serverAddress}/group-status`);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.groups.openFailed", "Failed to open group status"),
      );
    }
  };

  const handleRefresh = () => {
    void groupsQuery.refetch();
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
                  "同步网站分组状态，用于创建令牌、调整 Key 分组和确认当前账号权限。",
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.refresh", "Refresh")}
              </Button>
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={() => void handleOpenWebsite()}
              >
                <ExternalLink className="h-4 w-4" />
                {t("codego.groups.openWebsite", "打开网站")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="codego-panel px-4 py-3">
              <div className="text-xs text-muted-foreground">
                {t("codego.groups.current", "当前分组")}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {currentGroup}
              </div>
            </div>

            {groupItems.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {groupItems.map((group) => (
                  <div key={group.name} className="codego-panel px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-medium text-foreground">
                        {group.name}
                      </div>
                      {group.current || group.name === currentGroup ? (
                        <Badge className="codego-chip-cool">
                          {t("codego.groups.active", "当前")}
                        </Badge>
                      ) : null}
                    </div>
                    {group.desc ? (
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        {group.desc}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {group.ratio !== undefined ? (
                        <Badge variant="outline">
                          {t("codego.groups.ratio", "倍率")}: {group.ratio}
                        </Badge>
                      ) : null}
                      {group.available_models_count !== undefined ? (
                        <Badge variant="outline">
                          {t("codego.groups.models", "模型")}:{" "}
                          {group.available_models_count}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <div className="text-sm font-medium text-foreground">
                  {groupsQuery.isFetching
                    ? t("common.loading", "Loading...")
                    : t("codego.groups.empty", "网站分组接口暂未返回列表。")}
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "codego.groups.emptyHint",
                    "当前账号分组已从概览同步；如果需要完整分组状态，请打开网站分组状态页。",
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
