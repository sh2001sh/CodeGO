import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import type { CodeGoGroupItem } from "@/lib/api/codego";

export interface CodeGoTokenFormState {
  id?: number;
  name: string;
  unlimited_quota: boolean;
  remain_quota: string;
  expired_time: string;
  group: string;
  model_limits_enabled: boolean;
  model_limits: string;
}

interface CodeGoTokenFormDialogProps {
  open: boolean;
  formState: CodeGoTokenFormState;
  saving: boolean;
  groupOptions: CodeGoGroupItem[];
  onOpenChange: (open: boolean) => void;
  onChange: (
    updater: (value: CodeGoTokenFormState) => CodeGoTokenFormState,
  ) => void;
  onSubmit: () => void;
}

/** Edit or create a codego token without inflating the table container file. */
export function CodeGoTokenFormDialog({
  open,
  formState,
  saving,
  groupOptions,
  onOpenChange,
  onChange,
  onSubmit,
}: CodeGoTokenFormDialogProps) {
  const { t } = useTranslation();
  const groups =
    groupOptions.length > 0
      ? groupOptions
      : [{ name: "default", desc: "default" }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {formState.id
              ? t("codego.tokens.editTitle", "Edit token")
              : t("codego.tokens.createTitle", "Create token")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "codego.tokens.formDescription",
              "Configure the token name, expiry, quota, and optional model restrictions before saving it to your codego account.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="codego-token-name">
              {t("codego.tokens.name", "Name")}
            </Label>
            <Input
              id="codego-token-name"
              value={formState.name}
              onChange={(event) =>
                onChange((value) => ({ ...value, name: event.target.value }))
              }
              placeholder={t(
                "codego.tokens.namePlaceholder",
                "codego codex workstation",
              )}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codego-token-group">
              {t("codego.tokens.group", "Group")}
            </Label>
            <Select
              value={formState.group}
              onValueChange={(group) =>
                onChange((value) => ({ ...value, group }))
              }
            >
              <SelectTrigger id="codego-token-group">
                <SelectValue
                  placeholder={t("codego.tokens.groupPlaceholder", "default")}
                />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    {group.desc && group.desc !== group.name
                      ? `${group.name} · ${group.desc}`
                      : group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="codego-token-expiry">
              {t("codego.tokens.expiresAt", "Expires at")}
            </Label>
            <Input
              id="codego-token-expiry"
              type="datetime-local"
              value={formState.expired_time}
              onChange={(event) =>
                onChange((value) => ({
                  ...value,
                  expired_time: event.target.value,
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codego-token-quota">
              {t("codego.tokens.remainingQuota", "Remaining quota")}
            </Label>
            <Input
              id="codego-token-quota"
              value={formState.remain_quota}
              onChange={(event) =>
                onChange((value) => ({
                  ...value,
                  remain_quota: event.target.value,
                }))
              }
              disabled={formState.unlimited_quota}
              inputMode="numeric"
              placeholder={t("codego.tokens.zeroPlaceholder", "0")}
            />
          </div>
          <div className="flex items-center gap-2 pt-7">
            <Checkbox
              id="codego-token-unlimited"
              checked={formState.unlimited_quota}
              onCheckedChange={(checked) =>
                onChange((value) => ({
                  ...value,
                  unlimited_quota: checked === true,
                }))
              }
            />
            <Label htmlFor="codego-token-unlimited">
              {t("codego.tokens.unlimitedQuota", "Unlimited quota")}
            </Label>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="codego-token-model-limits-enabled"
              checked={formState.model_limits_enabled}
              onCheckedChange={(checked) =>
                onChange((value) => ({
                  ...value,
                  model_limits_enabled: checked === true,
                }))
              }
            />
            <Label htmlFor="codego-token-model-limits-enabled">
              {t("codego.tokens.restrictModels", "Restrict available models")}
            </Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="codego-token-model-limits">
              {t("codego.tokens.modelLimits", "Model limits")}
            </Label>
            <Textarea
              id="codego-token-model-limits"
              value={formState.model_limits}
              onChange={(event) =>
                onChange((value) => ({
                  ...value,
                  model_limits: event.target.value,
                }))
              }
              disabled={!formState.model_limits_enabled}
              placeholder={t(
                "codego.tokens.modelLimitsPlaceholder",
                "gpt-5.5,claude-sonnet-4",
              )}
              className="min-h-[96px]"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "codego.tokens.modelLimitsHint",
                "Use the same comma-separated model format as the website token settings.",
              )}
            </p>
          </div>
        </div>
        <DialogFooter>
          <div className="mr-auto flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t(
              "codego.tokens.maskedHint",
              "Full keys remain masked in the list and are only fetched when you explicitly copy one.",
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : formState.id ? (
              t("codego.tokens.saveToken", "Save token")
            ) : (
              t("codego.tokens.createToken", "Create token")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
