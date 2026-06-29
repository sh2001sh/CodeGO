import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CodeGoAccountSummary } from "@/lib/api/codego";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "./codegoShared";

interface CodeGoRecentUsageCardProps {
  summary?: CodeGoAccountSummary;
  onOpenLogs: () => void;
}

export function CodeGoRecentUsageCard({
  summary,
  onOpenLogs,
}: CodeGoRecentUsageCardProps) {
  const { t } = useTranslation();

  return (
    <Card className="codego-panel shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {t("codego.recentUsage.title", "Recent usage")}
          </CardTitle>
        </div>
        <Button variant="outline" className="h-8" onClick={onOpenLogs}>
          {t("codego.recentUsage.openLogs", "Open full logs")}
        </Button>
      </CardHeader>
      <CardContent>
        {summary?.recent_logs?.length ? (
          <div className="space-y-3">
            {summary.recent_logs.slice(0, 4).map((item) => (
              <div
                key={`${item.id}-${item.created_at}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/60 px-4 py-3 dark:bg-background/30"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium">
                    {item.model_name ||
                      t("codego.recentUsage.unknownModel", "Unknown model")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.token_name ||
                      t("codego.recentUsage.unknownToken", "Unknown token")}{" "}
                    · {formatDateTime(item.created_at)}
                  </div>
                </div>
                <div className="text-sm font-medium">{item.quota ?? 0}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {t("codego.recentUsage.empty", "No recent usage logs.")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
