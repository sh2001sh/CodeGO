import { AlertCircle, ExternalLink, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CodeGoDesktopAuthViewProps {
  serverAddress: string;
  deviceName: string;
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
  return (
    <section className="flex flex-1 px-6 pb-8">
      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-5">
            <Badge className="rounded-full bg-orange-500/10 text-orange-700 hover:bg-orange-500/10">
              Code Go Desktop
            </Badge>
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Connect your Code Go account
              </h1>
              <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                Approve this desktop from your browser, then manage quota,
                tokens, logs, and tool configs without storing your site password locally.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Desktop quota snapshot",
                "Browser-approved device access",
                "Revocable desktop sessions",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border bg-card/50 px-4 py-4 text-sm text-foreground"
                >
                  {item}
                </div>
              ))}
            </div>
          </section>

          <Card className="border-border/70 bg-card/90 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Browser authorization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {authError || authQueryError || "Failed to read local Code Go auth state"}
                  </span>
                </div>
              )}
              {authSession ? (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">
                        Enter this code in your browser
                      </div>
                      <div className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em]">
                        {authSession.userCode}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        The code has already been copied. Approval expires in about{" "}
                        {Math.max(Math.round(authSession.expiresIn / 60), 1)} min.
                      </div>
                    </div>
                    <Badge variant="outline" className="gap-1.5">
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
                    <Button
                      variant="ghost"
                      className="h-9 gap-2"
                      onClick={onCancelSession}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <Button
                  onClick={onStartAuth}
                  disabled={startPending || pollPending}
                  className="h-9 gap-2"
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
                  className="h-9 gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
