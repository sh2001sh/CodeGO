import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { codegoApi, settingsApi, type CodeGoToolConfigStatus } from "@/lib/api";
import { extractErrorMessage } from "@/utils/errorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { normalizeCodeGoBrand, type ToolType } from "./codegoShared";

const TOOL_ORDER: ToolType[] = [
  "codex",
  "claude",
  "gemini",
  "opencode",
  "openclaw",
  "hermes",
];

function statusTone(status: CodeGoToolConfigStatus) {
  if (status.conflictDetected) return "conflict";
  if (status.currentProviderIsCodego) return "ready";
  if (status.configExists) return "detected";
  return "missing";
}

interface CodeGoToolConfigPanelProps {
  enabled: boolean;
}

export function CodeGoToolConfigPanel({ enabled }: CodeGoToolConfigPanelProps) {
  const queryClient = useQueryClient();
  const [previewTool, setPreviewTool] = useState<ToolType | null>(null);

  const statusQuery = useQuery({
    queryKey: ["codego", "tool-config-statuses"],
    queryFn: () => codegoApi.getToolConfigStatuses(),
    enabled,
  });

  const previewQuery = useQuery({
    queryKey: ["codego", "tool-config-preview", previewTool],
    queryFn: () => codegoApi.getToolConfigPreview(previewTool!),
    enabled: enabled && Boolean(previewTool),
  });

  const applyMutation = useMutation({
    mutationFn: (tool: ToolType) => codegoApi.applyToolConfig(tool),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["codego", "tool-config-statuses"],
        }),
        queryClient.invalidateQueries({ queryKey: ["providers"] }),
        queryClient.invalidateQueries({ queryKey: ["codego", "summary"] }),
      ]);
      toast.success(
        normalizeCodeGoBrand(`${result.providerName} applied`).toLowerCase(),
        {
          closeButton: true,
        },
      );
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error) || "Failed to apply the codego tool config",
      );
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (tool: ToolType) => codegoApi.restoreToolConfig(tool),
    onSuccess: async (result, tool) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["codego", "tool-config-statuses"],
        }),
        queryClient.invalidateQueries({ queryKey: ["providers"] }),
      ]);
      toast.success(`${tool} config restored`, {
        description: result.backupSavedAt || undefined,
        closeButton: true,
      });
    },
    onError: (error) => {
      toast.error(
        extractErrorMessage(error) ||
          "Failed to restore the previous tool config",
      );
    },
  });

  const testMutation = useMutation({
    mutationFn: (tool: ToolType) => codegoApi.testToolConfig(tool),
    onSuccess: (result) => {
      if (
        result.authenticated &&
        result.configExists &&
        result.credentialPresent &&
        result.endpointMatches &&
        result.connectivityReachable &&
        result.summaryReachable
      ) {
        toast.success(normalizeCodeGoBrand(result.message).toLowerCase(), {
          closeButton: true,
        });
      } else {
        toast.error(normalizeCodeGoBrand(result.message).toLowerCase());
      }
    },
  });

  const sortedStatuses = useMemo(() => {
    const items = statusQuery.data ?? [];
    return [...items].sort(
      (a, b) =>
        TOOL_ORDER.indexOf(a.tool as ToolType) -
        TOOL_ORDER.indexOf(b.tool as ToolType),
    );
  }, [statusQuery.data]);

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base">Tool configuration</CardTitle>
          </div>
          <Button
            variant="outline"
            className="h-8 gap-2"
            onClick={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
          >
            {statusQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sortedStatuses.map((status) => {
            const tone = statusTone(status);
            const isApplying =
              applyMutation.isPending &&
              applyMutation.variables === status.tool;
            const isRestoring =
              restoreMutation.isPending &&
              restoreMutation.variables === status.tool;
            const isTesting =
              testMutation.isPending && testMutation.variables === status.tool;

            return (
              <div
                key={status.tool}
                className="rounded-lg border border-border bg-muted/20 px-4 py-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground">
                        {status.label}
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          tone === "conflict"
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
                            : tone === "ready"
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                              : tone === "detected"
                                ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                                : "border-border"
                        }
                      >
                        {tone === "conflict"
                          ? "Conflict detected"
                          : tone === "ready"
                            ? "codego active"
                          : tone === "detected"
                            ? "Config detected"
                            : "Not configured"}
                      </Badge>
                      {status.hasBackup && (
                        <Badge variant="outline">Backup ready</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {status.configPath}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {status.currentProviderName
                        ? `Current provider: ${status.currentProviderName}`
                        : "No provider selected in codego"}
                    </div>
                    {status.conflictReason && (
                      <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-xs text-rose-700">
                        {status.conflictReason}
                      </div>
                    )}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">
                          After apply:
                        </span>{" "}
                        {status.restartHint}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          Verify:
                        </span>{" "}
                        {status.verifyHint}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="h-8 gap-2"
                      onClick={() => setPreviewTool(status.tool as ToolType)}
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 gap-2"
                      onClick={() =>
                        void settingsApi.openConfigFolder(status.app)
                      }
                    >
                      <FolderOpen className="h-4 w-4" />
                      Folder
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 gap-2"
                      disabled={!status.hasBackup || isRestoring}
                      onClick={() =>
                        restoreMutation.mutate(status.tool as ToolType)
                      }
                    >
                      {isRestoring ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                      Restore
                    </Button>
                    <Button
                      variant="outline"
                      className="h-8 gap-2"
                      disabled={isTesting}
                      onClick={() =>
                        testMutation.mutate(status.tool as ToolType)
                      }
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench className="h-4 w-4" />
                      )}
                      Test
                    </Button>
                    <Button
                      className="h-8 gap-2"
                      disabled={isApplying}
                      onClick={() =>
                        applyMutation.mutate(status.tool as ToolType)
                      }
                    >
                      {isApplying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {statusQuery.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Tool status failed</AlertTitle>
              <AlertDescription>
                {extractErrorMessage(statusQuery.error) ||
                  "Failed to inspect local tool configuration."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(previewTool)}
        onOpenChange={(open) => {
          if (!open) setPreviewTool(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {previewQuery.data?.label || "Tool"} codego preview
            </DialogTitle>
            <DialogDescription>
              Review the current local config and the codego version before
              applying changes.
            </DialogDescription>
          </DialogHeader>

          {previewQuery.error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Preview failed</AlertTitle>
              <AlertDescription>
                {extractErrorMessage(previewQuery.error) ||
                  "Failed to build the preview."}
              </AlertDescription>
            </Alert>
          ) : previewQuery.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading preview
            </div>
          ) : previewQuery.data ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{previewQuery.data.providerId}</Badge>
                <span>{previewQuery.data.configPath}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2"
                  onClick={() =>
                    void settingsApi.openExternal(previewQuery.data.endpoint)
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Endpoint
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Current local config
                  </div>
                  <ScrollArea className="h-80 rounded-lg border border-border bg-muted/20">
                    <pre className="p-4 text-xs leading-5 text-foreground whitespace-pre-wrap break-all">
                      {previewQuery.data.currentPreview}
                    </pre>
                  </ScrollArea>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">codego config</div>
                  <ScrollArea className="h-80 rounded-lg border border-border bg-muted/20">
                    <pre className="p-4 text-xs leading-5 text-foreground whitespace-pre-wrap break-all">
                      {previewQuery.data.nextPreview}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTool(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
