import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCodeGoUsageTrendsQuery } from "@/lib/query";
import { useTranslation } from "react-i18next";
import { formatUsd } from "./codegoShared";

type TrendRange = 7 | 30;

interface CodeGoUsageTrendCardProps {
  enabled: boolean;
}

export function CodeGoUsageTrendCard({ enabled }: CodeGoUsageTrendCardProps) {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>(7);
  const trendQuery = useCodeGoUsageTrendsQuery(range, enabled);

  const chartData = useMemo(
    () =>
      trendQuery.data?.trend.map((item) => ({
        ...item,
        label: item.date.slice(5),
      })) ?? [],
    [trendQuery.data?.trend],
  );

  const totalQuotaUsd = useMemo(
    () =>
      chartData.reduce((sum, item) => {
        return sum + (Number.isFinite(item.quota_usd) ? item.quota_usd : 0);
      }, 0),
    [chartData],
  );

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">
            {t("codego.trends.title", "Usage trends")}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("codego.trends.description", {
              range,
              defaultValue: `Rolling usage across the last ${range} days.`,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30].map((value) => (
            <Button
              key={value}
              variant={range === value ? "default" : "outline"}
              size="sm"
              className="h-8"
              onClick={() => setRange(value as TrendRange)}
            >
              {value}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-xs text-muted-foreground">
              {t("codego.trends.quotaUsed", "Quota used")}
            </div>
            <div className="text-lg font-semibold">
              {formatUsd(totalQuotaUsd)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {t("codego.trends.requests", "Requests")}
            </div>
            <div className="text-lg font-semibold">
              {chartData.reduce((sum, item) => sum + item.requests, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">
              {t("codego.trends.tokens", "Tokens")}
            </div>
            <div className="text-lg font-semibold">
              {chartData.reduce((sum, item) => sum + item.token_used, 0)}
            </div>
          </div>
        </div>

        <div className="h-[280px]">
          {trendQuery.isLoading ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-muted/20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="codegoQuotaUsd"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient
                    id="codegoRequests"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.16} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.4}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <YAxis
                  yAxisId="usd"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                  tickFormatter={(value) => `$${value}`}
                />
                <YAxis
                  yAxisId="requests"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === t("codego.trends.chartQuota", "Quota")) {
                      return [formatUsd(value), name];
                    }
                    return [value, name];
                  }}
                />
                <Area
                  yAxisId="requests"
                  type="monotone"
                  dataKey="requests"
                  name={t("codego.trends.requests", "Requests")}
                  stroke="#3b82f6"
                  fill="url(#codegoRequests)"
                  strokeWidth={2}
                />
                <Area
                  yAxisId="usd"
                  type="monotone"
                  dataKey="quota_usd"
                  name={t("codego.trends.chartQuota", "Quota")}
                  stroke="#f97316"
                  fill="url(#codegoQuotaUsd)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
              {t("codego.trends.empty", "No recent trend data yet.")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
