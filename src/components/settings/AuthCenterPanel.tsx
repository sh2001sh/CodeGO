import { useEffect, useState } from "react";
import {
  Activity,
  BellRing,
  Github,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { CodexIcon } from "@/components/BrandIcons";
import { CopilotAuthSection } from "@/components/providers/forms/CopilotAuthSection";
import { CodexOAuthSection } from "@/components/providers/forms/CodexOAuthSection";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import type { SettingsFormState } from "@/hooks/useSettings";

interface AuthCenterPanelProps {
  settings: SettingsFormState;
  onChange: (updates: Partial<SettingsFormState>) => Promise<boolean>;
}

export function AuthCenterPanel({ settings, onChange }: AuthCenterPanelProps) {
  const { t } = useTranslation();
  const [thresholdDraft, setThresholdDraft] = useState(
    String(settings.codegoLowBalanceThresholdUsd ?? 10),
  );

  useEffect(() => {
    setThresholdDraft(String(settings.codegoLowBalanceThresholdUsd ?? 10));
  }, [settings.codegoLowBalanceThresholdUsd]);

  const commitThreshold = async () => {
    const trimmed = thresholdDraft.trim();
    const nextValue = Number(trimmed);
    const fallback = settings.codegoLowBalanceThresholdUsd ?? 10;

    if (!trimmed || !Number.isFinite(nextValue) || nextValue < 0) {
      setThresholdDraft(String(fallback));
      return;
    }

    if (nextValue === fallback) {
      setThresholdDraft(String(nextValue));
      return;
    }

    const saved = await onChange({ codegoLowBalanceThresholdUsd: nextValue });
    if (!saved) {
      setThresholdDraft(String(fallback));
      return;
    }

    setThresholdDraft(String(nextValue));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">
                {t("settings.authCenter.title", {
                  defaultValue: "OAuth 认证中心",
                })}
              </h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("settings.authCenter.description", {
                defaultValue:
                  "在 Claude Code 中使用您的其他订阅，请注意合规风险。",
              })}
            </p>
          </div>
          <Badge variant="secondary">
            {t("settings.authCenter.beta", { defaultValue: "Beta" })}
          </Badge>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <h4 className="font-medium">GitHub Copilot</h4>
            <p className="text-sm text-muted-foreground">
              {t("settings.authCenter.copilotDescription", {
                defaultValue: "管理 GitHub Copilot 账号",
              })}
            </p>
          </div>
        </div>

        <CopilotAuthSection />
      </section>

      <section className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <CodexIcon size={20} />
          </div>
          <div>
            <h4 className="font-medium">ChatGPT (Codex OAuth)</h4>
            <p className="text-sm text-muted-foreground">
              {t("settings.authCenter.codexOauthDescription", {
                defaultValue: "管理 ChatGPT 账号",
              })}
            </p>
          </div>
        </div>

        <CodexOAuthSection />
      </section>

      <section className="rounded-xl border border-border/60 bg-card/60 p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
            <WalletCards className="h-5 w-5 text-amber-500" />
          </div>
          <div className="space-y-1">
            <h4 className="font-medium">codego desktop reminders</h4>
            <p className="text-sm text-muted-foreground">
              Keep the tray balance fresh and surface a desktop alert before the
              account runs out of quota.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="space-y-1">
              <Label
                htmlFor="codego-auto-refresh-enabled"
                className="text-sm font-medium"
              >
                Automatic balance refresh
              </Label>
              <p className="text-xs text-muted-foreground">
                Refresh codego balance in the background every 3 minutes for
                the dashboard, tray summary, and low-balance checks.
              </p>
            </div>
            <Switch
              id="codego-auto-refresh-enabled"
              aria-label="codego automatic balance refresh"
              checked={settings.codegoAutoRefreshEnabled ?? true}
              onCheckedChange={(checked) =>
                void onChange({ codegoAutoRefreshEnabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="space-y-1">
              <Label
                htmlFor="codego-tray-enabled"
                className="text-sm font-medium"
              >
                Tray balance summary
              </Label>
              <p className="text-xs text-muted-foreground">
                Show the latest codego balance and quick actions in the system
                tray.
              </p>
            </div>
            <Switch
              id="codego-tray-enabled"
              aria-label="codego tray balance summary"
              checked={settings.codegoTrayEnabled ?? true}
              onCheckedChange={(checked) =>
                void onChange({ codegoTrayEnabled: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="codego-low-balance-enabled"
                  className="text-sm font-medium"
                >
                  Low-balance notifications
                </Label>
                <BellRing className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Send a desktop reminder when the remaining codego balance drops
                below the threshold.
              </p>
            </div>
            <Switch
              id="codego-low-balance-enabled"
              aria-label="codego low balance notifications"
              checked={settings.codegoLowBalanceNotificationsEnabled ?? true}
              onCheckedChange={(checked) =>
                void onChange({ codegoLowBalanceNotificationsEnabled: checked })
              }
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Label
                  htmlFor="codego-low-balance-threshold"
                  className="text-sm font-medium"
                >
                  Notification threshold
                </Label>
                <p className="text-xs text-muted-foreground">
                  Enter the remaining USD balance that should trigger the next
                  desktop alert.
                </p>
              </div>
              <div className="w-full sm:w-40">
                <Input
                  id="codego-low-balance-threshold"
                  aria-label="codego low balance threshold in USD"
                  type="number"
                  min={0}
                  step="0.5"
                  inputMode="decimal"
                  value={thresholdDraft}
                  disabled={
                    !(settings.codegoLowBalanceNotificationsEnabled ?? true)
                  }
                  onChange={(event) => setThresholdDraft(event.target.value)}
                  onBlur={() => void commitThreshold()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.currentTarget.blur();
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="codego-telemetry-enabled"
                  className="text-sm font-medium"
                >
                  Privacy-safe telemetry
                </Label>
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Send opt-in desktop lifecycle events such as successful sign-in,
                summary refreshes, and diagnostic submissions. Tokens, request
                bodies, and local absolute paths are excluded.
              </p>
            </div>
            <Switch
              id="codego-telemetry-enabled"
              aria-label="codego privacy-safe telemetry"
              checked={settings.codegoTelemetryEnabled ?? false}
              onCheckedChange={(checked) =>
                void onChange({ codegoTelemetryEnabled: checked })
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
