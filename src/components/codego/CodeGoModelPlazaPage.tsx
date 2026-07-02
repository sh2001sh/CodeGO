import { Boxes, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { settingsApi } from "@/lib/api";
import { useCodeGoAuthQuery, useCodeGoSummaryQuery } from "@/lib/query";
import { useSettingsQuery } from "@/lib/query/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { extractErrorMessage } from "@/utils/errorUtils";

export function CodeGoModelPlazaPage() {
  const { t } = useTranslation();
  const authQuery = useCodeGoAuthQuery();
  const settingsQuery = useSettingsQuery();
  const summaryQuery = useCodeGoSummaryQuery(
    Boolean(authQuery.data?.authenticated),
    settingsQuery.data?.codegoAutoRefreshEnabled ?? true,
  );
  const models = summaryQuery.data?.usage.available_models ?? [];
  const serverAddress = authQuery.data?.serverAddress || "https://shu26.cfd";

  const handleOpenWebsite = async () => {
    try {
      await settingsApi.openExternal(`${serverAddress}/models`);
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.modelPlaza.openFailed", "Failed to open model plaza"),
      );
    }
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
                  "根据当前授权账号同步可用模型。模型权限以网站账号和令牌配置为准。",
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                className="h-9 gap-2"
                onClick={() => void summaryQuery.refetch()}
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
                {t("codego.modelPlaza.openWebsite", "打开网站")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {models.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {models.map((model) => (
                  <div key={model} className="codego-panel px-4 py-3">
                    <div className="truncate text-sm font-medium text-foreground">
                      {model}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("codego.modelPlaza.available", "当前账号可用")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
                <div className="text-sm font-medium text-foreground">
                  {summaryQuery.isFetching
                    ? t("common.loading", "Loading...")
                    : t(
                        "codego.modelPlaza.empty",
                        "当前接口暂未返回模型列表。",
                      )}
                </div>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "codego.modelPlaza.emptyHint",
                    "可以刷新重试，或打开网站查看完整模型广场。",
                  )}
                </p>
              </div>
            )}
            {summaryQuery.data?.account.group ? (
              <div className="mt-4">
                <Badge variant="outline">
                  {t("codego.groups.current", "当前分组")}:{" "}
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
