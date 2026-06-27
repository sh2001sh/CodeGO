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
import { Textarea } from "@/components/ui/textarea";

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
  onOpenChange: (open: boolean) => void;
  onChange: (updater: (value: CodeGoTokenFormState) => CodeGoTokenFormState) => void;
  onSubmit: () => void;
}

/** Edit or create a Code Go token without inflating the table container file. */
export function CodeGoTokenFormDialog({
  open,
  formState,
  saving,
  onOpenChange,
  onChange,
  onSubmit,
}: CodeGoTokenFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{formState.id ? "Edit token" : "Create token"}</DialogTitle>
          <DialogDescription>
            Configure the token name, expiry, quota, and optional model restrictions before saving it to your Code Go account.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="codego-token-name">Name</Label>
            <Input
              id="codego-token-name"
              value={formState.name}
              onChange={(event) =>
                onChange((value) => ({ ...value, name: event.target.value }))
              }
              placeholder="Code Go Codex Workstation"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codego-token-group">Group</Label>
            <Input
              id="codego-token-group"
              value={formState.group}
              onChange={(event) =>
                onChange((value) => ({ ...value, group: event.target.value }))
              }
              placeholder="default"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="codego-token-expiry">Expires at</Label>
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
            <Label htmlFor="codego-token-quota">Remaining quota</Label>
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
              placeholder="0"
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
            <Label htmlFor="codego-token-unlimited">Unlimited quota</Label>
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
              Restrict available models
            </Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="codego-token-model-limits">Model limits</Label>
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
              placeholder="gpt-5.5,claude-sonnet-4"
              className="min-h-[96px]"
            />
            <p className="text-xs text-muted-foreground">
              Use the same comma-separated model format as the website token settings.
            </p>
          </div>
        </div>
        <DialogFooter>
          <div className="mr-auto flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Full keys remain masked in the list and are only fetched when you explicitly copy one.
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : formState.id ? (
              "Save token"
            ) : (
              "Create token"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
