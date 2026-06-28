import { useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  CodeGoToken,
  CodeGoTokenCreateInput,
  CodeGoTokenUpdateInput,
} from "@/lib/api/codego";
import { codegoApi } from "@/lib/api";
import { copySensitiveText } from "@/lib/clipboard";
import {
  useCodeGoCreateTokenMutation,
  useCodeGoDeleteTokenMutation,
  useCodeGoTokensQuery,
  useCodeGoUpdateTokenMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";
import {
  CodeGoTokenFormDialog,
  type CodeGoTokenFormState,
} from "./CodeGoTokenFormDialog";
import { CodeGoTokenDeleteDialog } from "./CodeGoTokenDeleteDialog";
import { CodeGoTokenApplyMenu } from "./CodeGoTokenApplyMenu";
import { formatDateTime } from "./codegoShared";

interface CodeGoTokenManagerProps {
  enabled: boolean;
  desktopTokenId?: number | null;
}

const DEFAULT_FORM_STATE: CodeGoTokenFormState = {
  name: "",
  unlimited_quota: false,
  remain_quota: "0",
  expired_time: "",
  group: "default",
  model_limits_enabled: false,
  model_limits: "",
};

function tokenToFormState(token: CodeGoToken): CodeGoTokenFormState {
  return {
    id: token.id,
    name: token.name,
    unlimited_quota: Boolean(token.unlimited_quota),
    remain_quota: `${token.remain_quota ?? 0}`,
    expired_time:
      token.expired_time && token.expired_time > 0
        ? new Date(token.expired_time * 1000).toISOString().slice(0, 16)
        : "",
    group: token.group?.trim() || "default",
    model_limits_enabled: Boolean(token.model_limits_enabled),
    model_limits: token.model_limits || "",
  };
}

function buildTokenPayload(
  state: CodeGoTokenFormState,
): CodeGoTokenCreateInput | CodeGoTokenUpdateInput {
  const payload = {
    name: state.name.trim(),
    expired_time: state.expired_time
      ? Math.floor(new Date(state.expired_time).getTime() / 1000)
      : -1,
    remain_quota: state.unlimited_quota
      ? 0
      : Number.parseInt(state.remain_quota || "0", 10) || 0,
    unlimited_quota: state.unlimited_quota,
    group: state.group.trim() || "default",
    model_limits_enabled: state.model_limits_enabled,
    model_limits: state.model_limits_enabled ? state.model_limits.trim() : "",
  };

  if (state.id) {
    return { id: state.id, ...payload };
  }

  return payload;
}

function getTokenStatusTone(token: CodeGoToken) {
  if (token.unlimited_quota) return "Unlimited";
  if ((token.remain_quota ?? 0) <= 0) return "Exhausted";
  return "Active";
}

export function CodeGoTokenManager({
  enabled,
  desktopTokenId,
}: CodeGoTokenManagerProps) {
  const [page, setPage] = useState(0);
  const [formState, setFormState] =
    useState<CodeGoTokenFormState>(DEFAULT_FORM_STATE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CodeGoToken | null>(null);
  const [copyTarget, setCopyTarget] = useState<CodeGoToken | null>(null);
  const [copyingTokenId, setCopyingTokenId] = useState<number | null>(null);

  const tokensQuery = useCodeGoTokensQuery({ p: page, size: 10 }, enabled);
  const createMutation = useCodeGoCreateTokenMutation();
  const updateMutation = useCodeGoUpdateTokenMutation();
  const deleteMutation = useCodeGoDeleteTokenMutation();

  const tokenPage = tokensQuery.data;
  const totalPages = useMemo(() => {
    if (!tokenPage) return 1;
    return Math.max(
      1,
      Math.ceil(tokenPage.total / Math.max(tokenPage.size, 1)),
    );
  }, [tokenPage]);

  const resetDialog = () => {
    setFormState(DEFAULT_FORM_STATE);
    setDialogOpen(false);
  };

  const openCreateDialog = () => {
    setFormState({
      ...DEFAULT_FORM_STATE,
      name: `codego desktop ${tokenPage?.total ? `#${tokenPage.total + 1}` : ""}`.trim(),
    });
    setDialogOpen(true);
  };

  const openEditDialog = (token: CodeGoToken) => {
    setFormState(tokenToFormState(token));
    setDialogOpen(true);
  };

  const handleCopyToken = async (token: CodeGoToken) => {
    setCopyingTokenId(token.id);
    try {
      const result = await codegoApi.getTokenKey(token.id);
      await copySensitiveText(result.key);
      toast.success(`Copied full key for ${token.name}`, { closeButton: true });
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Failed to copy full token");
    } finally {
      setCopyingTokenId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      toast.error("Token name is required");
      return;
    }

    try {
      const payload = buildTokenPayload(formState);
      if ("id" in payload) {
        await updateMutation.mutateAsync(payload);
        toast.success("Token updated", { closeButton: true });
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Token created", { closeButton: true });
      }
      resetDialog();
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Failed to save token");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(`Deleted ${deleteTarget.name}`, { closeButton: true });
      setDeleteTarget(null);
      if (page > 0 && tokenPage && tokenPage.items.length === 1) {
        setPage((value) => Math.max(0, value - 1));
      }
    } catch (error) {
      toast.error(extractErrorMessage(error) || "Failed to delete token");
    }
  };

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">Token management</CardTitle>
            <p className="text-sm text-muted-foreground">
              Create scoped keys for each local tool and only reveal the full
              key on demand.
            </p>
          </div>
          <Button className="h-9 gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            New token
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {tokensQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading tokens
            </div>
          ) : tokenPage?.items?.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quota</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead className="w-[180px] text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokenPage.items.map((token) => {
                    const isDesktop = token.id === desktopTokenId;
                    return (
                      <TableRow key={token.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{token.name}</span>
                            {isDesktop ? (
                              <Badge variant="outline" className="gap-1">
                                <KeyRound className="h-3 w-3" />
                                Desktop
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Group: {token.group || "default"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getTokenStatusTone(token)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {token.unlimited_quota
                            ? "Unlimited"
                            : `${token.remain_quota ?? 0} remaining`}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(token.expired_time)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {token.key}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <CodeGoTokenApplyMenu token={token} />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => setCopyTarget(token)}
                              disabled={copyingTokenId === token.id}
                            >
                              {copyingTokenId === token.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                              Copy key
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => openEditDialog(token)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(token)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Page {page + 1} of {totalPages} · {tokenPage.total} tokens
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page === 0}
                    onClick={() => setPage((value) => Math.max(0, value - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No tokens yet. Create a dedicated token for each local tool so you
              can rotate or revoke them independently.
            </div>
          )}
        </CardContent>
      </Card>

      <CodeGoTokenFormDialog
        open={dialogOpen}
        formState={formState}
        saving={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) resetDialog();
        }}
        onChange={setFormState}
        onSubmit={() => void handleSubmit()}
      />

      <CodeGoTokenDeleteDialog
        open={Boolean(deleteTarget)}
        token={deleteTarget}
        deleting={deleteMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmDialog
        isOpen={Boolean(copyTarget)}
        title="Copy full token key"
        message={
          copyTarget
            ? `Copy the full key for ${copyTarget.name}? The copied value grants API access until you rotate or revoke the token.`
            : ""
        }
        confirmText="Copy key"
        cancelText="Cancel"
        variant="info"
        onConfirm={() => {
          const target = copyTarget;
          setCopyTarget(null);
          if (target) {
            void handleCopyToken(target);
          }
        }}
        onCancel={() => setCopyTarget(null)}
      />
    </>
  );
}
