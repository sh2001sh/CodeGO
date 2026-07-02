import { AlertCircle, ExternalLink, Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CodeGoAuthState } from "@/lib/api/codego";
import { useTranslation } from "react-i18next";
import { CodeGoSecureStorageNotice } from "./CodeGoSecureStorageNotice";
import { CodeGoMark } from "./CodeGoMark";

interface CodeGoDesktopAuthViewProps {
  serverAddress: string;
  deviceName: string;
  secureStorageStatus?: CodeGoAuthState["secureStorageStatus"];
  secureStorageMessage?: string;
  authError?: string | null;
  authQueryError?: string | null;
  authSession: {
    sessionId: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
  } | null;
  startPending: boolean;
  pollPending: boolean;
  onServerAddressChange: (value: string) => void;
  onDeviceNameChange: (value: string) => void;
  onStartAuth: () => void;
  onOpenSettings: () => void;
  onOpenExternal: (url: string) => void;
  onCancelSession: () => void;
}

export function CodeGoDesktopAuthView({
  serverAddress,
  deviceName,
  secureStorageStatus,
  secureStorageMessage,
  authError,
  authQueryError,
  authSession,
  startPending,
  pollPending,
  onServerAddressChange,
  onDeviceNameChange,
  onStartAuth,
  onOpenSettings,
  onOpenExternal,
  onCancelSession,
}: CodeGoDesktopAuthViewProps) {
  const { t } = useTranslation();
  const setupSteps = [
    {
      title: t("codego.auth.steps.approve.title", "Approve in browser"),
      detail: t(
        "codego.auth.steps.approve.detail",
        "Keep account passwords on the website and issue a revocable desktop session.",
      ),
    },
    {
      title: t("codego.auth.steps.store.title", "Store local secrets safely"),
      detail: t(
        "codego.auth.steps.store.detail",
        "Desktop tokens and session data stay tied to secure local storage when available.",
      ),
    },
    {
      title: t(
        "codego.auth.steps.control.title",
        "Work from one control surface",
      ),
      detail: t(
        "codego.auth.steps.control.detail",
        "Quota, logs, tool routing, and token rotation stay in the same workflow.",
      ),
    },
  ];

  const setupSummary = [
    [
      t("codego.auth.summary.server", "Server"),
      serverAddress || "https://shu26.cfd",
    ],
    [t("codego.auth.summary.device", "Device"), deviceName || "codego desktop"],
    [
      t("codego.auth.summary.sessionModel", "Session model"),
      t(
        "codego.auth.summary.sessionModelValue",
        "Browser approval + local token",
      ),
    ],
  ] as const;

  return (
    <section className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
      <div className="codego-shell overflow-hidden">
        <div className="grid">
          <div className="codego-grid border-b border-white/50 px-6 py-6 dark:border-white/10">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white/80 dark:border-white/10 dark:bg-white/[0.06]">
                <CodeGoMark size={40} className="h-10 w-10" />
              </div>
              <div className="min-w-0 space-y-3">
                <Badge className="codego-chip-warm">
                  {t("codego.shell.desktopTitle", {
                    defaultValue: "CodeGo desktop",
                  })}
                </Badge>
                <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground">
                  {t(
                    "codego.auth.heroTitle",
                    "Approve this desktop from the website, then keep control here.",
                  )}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t(
                    "codego.auth.heroDescription",
                    "The browser handles account approval. Desktop stays focused on local tokens, quota visibility, logs, and routing changes.",
                  )}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {setupSteps.map((item) => (
                <div key={item.title} className="codego-metric-card">
                  <div className="text-sm font-semibold text-foreground">
                    {item.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button
                onClick={onStartAuth}
                disabled={startPending || pollPending}
                className="h-10 gap-2"
              >
                {startPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                {t("codego.auth.authorizeButton", "Authorize in browser")}
              </Button>
              <Button
                variant="outline"
                onClick={onOpenSettings}
                className="h-10 gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                {t("common.settings", "Settings")}
              </Button>
            </div>
          </div>

          <div className="bg-white/46 px-6 py-6 dark:bg-white/[0.015]">
            <div className="text-sm font-semibold text-foreground">
              {t("codego.auth.setupFlow", "Setup flow")}
            </div>
            <div className="mt-4 grid gap-3">
              {setupSummary.map(([label, value]) => (
                <div key={label} className="codego-panel px-4 py-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {value}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-orange-500/12 bg-orange-500/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground dark:border-orange-400/18 dark:bg-orange-400/[0.08]">
              {t(
                "codego.auth.setupHint",
                "Start the session in the browser first. The desktop app will keep polling until approval succeeds, expires, or gets revoked.",
              )}
            </div>
          </div>
        </div>
      </div>

      <Card className="codego-shell shadow-none">
        <CardHeader className="space-y-1 border-b border-white/60 pb-4 dark:border-white/10">
          <CardTitle className="text-base">
            {t("codego.auth.sessionSetupTitle", "Session setup")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(
              "codego.auth.sessionSetupDescription",
              "Connect the desktop app to the account and device you want to use.",
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <CodeGoSecureStorageNotice
            status={secureStorageStatus}
            message={secureStorageMessage}
          />

          <div className="space-y-2">
            <Label htmlFor="codego-server">
              {t("codego.auth.server", "Server")}
            </Label>
            <Input
              id="codego-server"
              value={serverAddress}
              onChange={(event) => onServerAddressChange(event.target.value)}
              placeholder="https://shu26.cfd"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codego-device-name">
              {t("codego.auth.deviceName", "Device name")}
            </Label>
            <Input
              id="codego-device-name"
              value={deviceName}
              onChange={(event) => onDeviceNameChange(event.target.value)}
              placeholder={t(
                "codego.auth.deviceNamePlaceholder",
                "My workstation",
              )}
            />
          </div>

          {(authError || authQueryError) && (
            <div className="flex items-start gap-2 rounded-[16px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {authError ||
                  authQueryError ||
                  t(
                    "codego.auth.readStateFailed",
                    "Failed to read local auth state",
                  )}
              </span>
            </div>
          )}

          {authSession ? (
            <div className="codego-panel px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {t(
                      "codego.auth.enterCodeTitle",
                      "Enter this code in your browser",
                    )}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em]">
                    {authSession.userCode}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {t(
                      "codego.auth.codeCopiedHint",
                      "The code has already been copied. Approval expires in about {{minutes}} min.",
                      {
                        minutes: Math.max(
                          Math.round(authSession.expiresIn / 60),
                          1,
                        ),
                      },
                    )}
                  </div>
                </div>
                <Badge className="codego-chip-cool gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("codego.auth.waiting", "Waiting")}
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="h-9 gap-2"
                  onClick={() => onOpenExternal(authSession.verificationUri)}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("codego.auth.openBrowserAgain", "Open browser again")}
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 gap-2"
                  onClick={onCancelSession}
                >
                  {t("common.cancel", "Cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
