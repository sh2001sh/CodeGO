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
  useCodeGoGroupsQuery,
  useCodeGoTokensQuery,
  useCodeGoUpdateTokenMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
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
  const groupsQuery = useCodeGoGroupsQuery(enabled);
  const groupOptions = groupsQuery.data?.items ?? [];
  const defaultGroup =
    groupsQuery.data?.current || groupOptions[0]?.name || "default";
  const totalPages = useMemo(() => {
    if (!tokenPage) return 1;
    const total = Number.isFinite(Number(tokenPage.total))
      ? Number(tokenPage.total)
      : (tokenPage.items?.length ?? 0);
    const size = Number.isFinite(Number(tokenPage.size))
      ? Math.max(Number(tokenPage.size), 1)
      : 10;
    return Math.max(1, Math.ceil(total / size));
  }, [tokenPage]);
  const tokenCount = Number.isFinite(Number(tokenPage?.total))
    ? Number(tokenPage?.total)
    : (tokenPage?.items?.length ?? 0);

  const resetDialog = () => {
    setFormState({ ...DEFAULT_FORM_STATE, group: defaultGroup });
    setDialogOpen(false);
  };

  const openCreateDialog = () => {
    setFormState({
      ...DEFAULT_FORM_STATE,
      group: defaultGroup,
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
      toast.success(
        t("codego.tokens.copyFullSuccess", {
          name: token.name,
          defaultValue: `Copied full key for ${token.name}`,
        }),
        { closeButton: true },
      );
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.tokens.copyFullFailed", "Failed to copy full token"),
      );
    } finally {
      setCopyingTokenId(null);
    }
  };

  const handleSubmit = async () => {
    if (!formState.name.trim()) {
      toast.error(t("codego.tokens.nameRequired", "Token name is required"));
      return;
    }

    try {
      const payload = buildTokenPayload(formState);
      if ("id" in payload) {
        await updateMutation.mutateAsync(payload);
        toast.success(t("codego.tokens.updated", "Token updated"), {
          closeButton: true,
        });
      } else {
        await createMutation.mutateAsync(payload);
        toast.success(t("codego.tokens.created", "Token created"), {
          closeButton: true,
        });
      }
      resetDialog();
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.tokens.saveFailed", "Failed to save token"),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success(
        t("codego.tokens.deleted", {
          name: deleteTarget.name,
          defaultValue: `Deleted ${deleteTarget.name}`,
        }),
        { closeButton: true },
      );
      setDeleteTarget(null);
      if (page > 1 && tokenPage && tokenPage.items.length === 1) {
        setPage((value) => Math.max(1, value - 1));
      }
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.tokens.deleteFailed", "Failed to delete token"),
      );
    }
  };

  return (
    <>
      <Card className="border-border/70 bg-card/90">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {t("codego.tokens.managementTitle", "Token management")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t(
                "codego.tokens.managementDescription",
                "Create scoped keys for each local tool and only reveal the full key on demand.",
              )}
            </p>
          </div>
          <Button className="h-9 gap-2" onClick={openCreateDialog}>
            <Plus className="h-4 w-4" />
            {t("codego.tokens.newToken", "New token")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {tokensQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("codego.tokens.loading", "正在加载令牌")}
            </div>
          ) : tokensQuery.isError ? (
            <div className="rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-4 text-sm">
              <div className="font-medium text-destructive">
                {t("codego.tokens.loadFailed", "令牌加载失败")}
              </div>
              <div className="mt-1 leading-6 text-muted-foreground">
                {extractErrorMessage(tokensQuery.error) ||
                  t(
                    "codego.tokens.loadFailedDescription",
                    "请确认 Code Go 授权仍然有效后重试。",
                  )}
              </div>
              <Button
                variant="outline"
                className="mt-3 h-8"
                onClick={() => void tokensQuery.refetch()}
              >
                {t("common.retry", "重试")}
              </Button>
            </div>
          ) : tokenPage?.items?.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("codego.tokens.name", "Name")}</TableHead>
                    <TableHead>{t("codego.tokens.status", "Status")}</TableHead>
                    <TableHead>{t("codego.tokens.quota", "Quota")}</TableHead>
                    <TableHead>
                      {t("codego.tokens.expires", "Expires")}
                    </TableHead>
                    <TableHead>{t("codego.tokens.key", "Key")}</TableHead>
                    <TableHead className="w-[180px] text-right">
                      {t("common.actions", "Actions")}
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
                                {t("codego.tokens.desktop", "Desktop")}
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("codego.tokens.group", "Group")}:{" "}
                            {token.group || "default"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {getTokenStatusTone(token) === "Unlimited"
                              ? t("codego.tokens.unlimited", "Unlimited")
                              : getTokenStatusTone(token) === "Exhausted"
                                ? t("codego.tokens.exhausted", "Exhausted")
                                : t("codego.tokens.active", "Active")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {token.unlimited_quota
                            ? t("codego.tokens.unlimited", "Unlimited")
                            : t("codego.tokens.remaining", {
                                count: token.remain_quota ?? 0,
                                defaultValue: `${token.remain_quota ?? 0} remaining`,
                              })}
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
                              {t("codego.tokens.copyKey", "Copy key")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5"
                              onClick={() => openEditDialog(token)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("common.edit", "Edit")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(token)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("common.delete", "Delete")}
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
                  {t("codego.tokens.pagination", {
                    page,
                    total: totalPages,
                    count: tokenCount,
                    defaultValue: `第 ${page} / ${totalPages} 页 · 共 ${tokenCount} 个令牌`,
                  })}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                  >
                    {t("codego.tokens.previous", "上一页")}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-8"
                    disabled={page >= totalPages}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t("codego.tokens.next", "下一页")}
                  </Button>
                </div>
              </div>
            </>
          ) : tokenPage && tokenPage.total > 0 ? (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-4 text-sm">
              <div className="font-medium text-foreground">
                {t("codego.tokens.partialTitle", {
                  count: tokenPage.total,
                  defaultValue: `已检测到 ${tokenPage.total} 个令牌`,
                })}
              </div>
              <div className="mt-1 leading-6 text-muted-foreground">
                {t(
                  "codego.tokens.partialDescription",
                  "当前接口没有返回令牌列表。请点击重试；如果仍然为空，说明网站令牌接口没有向桌面授权开放列表数据。",
                )}
              </div>
              <Button
                variant="outline"
                className="mt-3 h-8"
                onClick={() => void tokensQuery.refetch()}
              >
                {t("common.retry", "重试")}
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              {t(
                "codego.tokens.empty",
                "暂无令牌。创建专用 API 密钥后，可分别轮换或撤销每个本地工具的访问权限。",
              )}
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
        groupOptions={groupOptions}
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
        title={t("codego.tokens.copyDialogTitle", "Copy full token key")}
        message={
          copyTarget
            ? t("codego.tokens.copyDialogMessage", {
                name: copyTarget.name,
                defaultValue:
                  "Copy the full key for {{name}}? The copied value grants API access until you rotate or revoke the token.",
              })
            : ""
        }
        confirmText={t("codego.tokens.copyKey", "Copy key")}
        cancelText={t("common.cancel", "Cancel")}
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
