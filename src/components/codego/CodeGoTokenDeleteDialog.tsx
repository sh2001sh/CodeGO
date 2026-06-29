import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CodeGoToken } from "@/lib/api/codego";
import { useTranslation } from "react-i18next";

interface CodeGoTokenDeleteDialogProps {
  open: boolean;
  token: CodeGoToken | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/** Confirm destructive token deletion in a dedicated dialog component. */
export function CodeGoTokenDeleteDialog({
  open,
  token,
  deleting,
  onOpenChange,
  onConfirm,
}: CodeGoTokenDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t("codego.tokens.deleteTitle", "Delete token")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "codego.tokens.deleteDescription",
              "Confirm permanent deletion of this token and its associated local tool access.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 py-5 text-sm text-muted-foreground">
          {token
            ? t("codego.tokens.deleteMessage", {
                name: token.name,
                defaultValue:
                  "Delete {{name}}? Any local tool using this key will stop authenticating until you update it.",
              })
            : ""}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("codego.tokens.deleteConfirm", "Delete token")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
