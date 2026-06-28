import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CodeGoAccountSummary } from "@/lib/api/codego";

interface CodeGoDesktopTokenCardProps {
  summary?: CodeGoAccountSummary;
  isEnsuringToken: boolean;
  onCopyToken: () => void;
  onEnsureToken: () => void;
  onManageTokens: () => void;
  onOpenTopUp: () => void;
}

export function CodeGoDesktopTokenCard({
  summary,
  isEnsuringToken,
  onCopyToken,
  onEnsureToken,
  onManageTokens,
  onOpenTopUp,
}: CodeGoDesktopTokenCardProps) {
  const desktopToken = summary?.tokens.desktop_token;
  const [confirmCopyOpen, setConfirmCopyOpen] = useState(false);

  return (
    <>
      <Card className="codego-panel shadow-none">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Desktop token</CardTitle>
          </div>
          <Badge variant="outline">{summary?.tokens.total || 0} total</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-background/60 px-4 py-3 dark:bg-background/30">
            <div className="text-xs text-muted-foreground">Current token</div>
            <div className="mt-1 flex items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span>{desktopToken?.name || "codego desktop - default"}</span>
            </div>
            <div className="mt-2 font-mono text-sm text-foreground">
              {desktopToken?.key || "Create a desktop token"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setConfirmCopyOpen(true)}
              disabled={isEnsuringToken}
              className="h-9 gap-2"
            >
              {isEnsuringToken ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Copy full token
            </Button>
            <Button
              variant="outline"
              onClick={onEnsureToken}
              disabled={isEnsuringToken}
              className="h-9 gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Ensure token
            </Button>
            <Button
              variant="outline"
              onClick={onManageTokens}
              className="h-9 gap-2"
            >
              <KeyRound className="h-4 w-4" />
              Manage tokens
            </Button>
            <Button
              variant="outline"
              onClick={onOpenTopUp}
              className="h-9 gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Top up
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={confirmCopyOpen}
        title="Copy full desktop token"
        message={`Copy the full key for ${desktopToken?.name || "codego desktop - default"} to your clipboard? Treat it like a password and avoid pasting it into untrusted tools or chats.`}
        confirmText="Copy token"
        cancelText="Cancel"
        variant="info"
        onConfirm={() => {
          setConfirmCopyOpen(false);
          onCopyToken();
        }}
        onCancel={() => setConfirmCopyOpen(false)}
      />
    </>
  );
}
