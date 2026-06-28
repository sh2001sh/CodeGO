import { AlertCircle, ExternalLink, Loader2, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CodeGoAuthState } from "@/lib/api/codego";
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
  const setupSteps = [
    {
      title: "Approve in browser",
      detail: "Keep account passwords on the website and issue a revocable desktop session.",
    },
    {
      title: "Store local secrets safely",
      detail: "Desktop tokens and session data stay tied to secure local storage.",
    },
    {
      title: "Work from one control surface",
      detail: "Quota, logs, tool routing, and token rotation stay in the same workflow.",
    },
  ];

  const setupSummary = [
    ["Server", serverAddress || "https://shu26.cfd"],
    ["Device", deviceName || "codego desktop"],
    ["Session model", "Browser approval + local token"],
  ] as const;

  return (
    <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="codego-shell overflow-hidden">
        <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
          <div className="codego-grid border-b border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.9),rgba(255,248,239,0.92),rgba(242,247,255,0.9))] px-6 py-6 dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.03),rgba(240,103,56,0.06),rgba(70,127,242,0.08))] lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 bg-white/80 dark:border-white/10 dark:bg-white/[0.06]">
                <CodeGoMark size={40} className="h-10 w-10" />
              </div>
              <div className="min-w-0 space-y-3">
                <Badge className="codego-chip-warm">codego desktop</Badge>
                <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance text-foreground">
                  Approve this desktop from the website, then keep control here.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  The browser handles account approval. Desktop stays focused on
                  local tokens, quota visibility, logs, and routing changes.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
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
                Authorize in browser
              </Button>
              <Button
                variant="outline"
                onClick={onOpenSettings}
                className="h-10 gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>

          <div className="bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.18))] px-6 py-6 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
            <div className="text-sm font-semibold text-foreground">Setup flow</div>
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
              Start the session in the browser first. The desktop app will keep
              polling until approval succeeds, expires, or gets revoked.
            </div>
          </div>
        </div>
      </div>

      <Card className="codego-shell shadow-none">
        <CardHeader className="space-y-1 border-b border-white/60 pb-4 dark:border-white/10">
          <CardTitle className="text-base">Session setup</CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect the desktop app to the account and device you want to use.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <CodeGoSecureStorageNotice
            status={secureStorageStatus}
            message={secureStorageMessage}
          />

          <div className="space-y-2">
            <Label htmlFor="codego-server">Server</Label>
            <Input
              id="codego-server"
              value={serverAddress}
              onChange={(event) => onServerAddressChange(event.target.value)}
              placeholder="https://shu26.cfd"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codego-device-name">Device name</Label>
            <Input
              id="codego-device-name"
              value={deviceName}
              onChange={(event) => onDeviceNameChange(event.target.value)}
              placeholder="My workstation"
            />
          </div>

          {(authError || authQueryError) && (
            <div className="flex items-start gap-2 rounded-[16px] border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {authError || authQueryError || "Failed to read local auth state"}
              </span>
            </div>
          )}

          {authSession ? (
            <div className="codego-panel px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Enter this code in your browser</div>
                  <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em]">
                    {authSession.userCode}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    The code has already been copied. Approval expires in about{" "}
                    {Math.max(Math.round(authSession.expiresIn / 60), 1)} min.
                  </div>
                </div>
                <Badge className="codego-chip-cool gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting
                </Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="h-9 gap-2"
                  onClick={() => onOpenExternal(authSession.verificationUri)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Open browser again
                </Button>
                <Button variant="ghost" className="h-9 gap-2" onClick={onCancelSession}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
