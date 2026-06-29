import { useState } from "react";
import { AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "react-i18next";
import {
  useCodeGoDiagnosticPreviewQuery,
  useCodeGoSubmitDiagnosticReportMutation,
} from "@/lib/query";
import { extractErrorMessage } from "@/utils/errorUtils";
import { formatDateTime } from "./codegoShared";

interface CodeGoDiagnosticReportCardProps {
  enabled: boolean;
}

export function CodeGoDiagnosticReportCard({
  enabled,
}: CodeGoDiagnosticReportCardProps) {
  const { t } = useTranslation();
  const previewQuery = useCodeGoDiagnosticPreviewQuery(enabled);
  const submitMutation = useCodeGoSubmitDiagnosticReportMutation();
  const [consentChecked, setConsentChecked] = useState(false);
  const [note, setNote] = useState("");

  const preview = previewQuery.data;

  const handleSubmit = async () => {
    try {
      const result = await submitMutation.mutateAsync({
        note: note.trim() || undefined,
      });
      toast.success(
        t("codego.diagnostics.submitted", {
          id: result.id,
          defaultValue: `Diagnostic report #${result.id} submitted`,
        }),
        {
          closeButton: true,
        },
      );
      setConsentChecked(false);
      setNote("");
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t(
            "codego.diagnostics.submitFailed",
            "Failed to submit diagnostic report",
          ),
      );
    }
  };

  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {t("codego.diagnostics.title", "Diagnostics")}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t(
              "codego.diagnostics.description",
              "Review the latest local crash excerpt before sending it to codego support.",
            )}
          </p>
        </div>
        {preview?.hasReport ? (
          <Badge variant="outline">
            {preview.redactionsApplied.length > 0
              ? t("codego.diagnostics.redactions", {
                  count: preview.redactionsApplied.length,
                  defaultValue: `${preview.redactionsApplied.length} redactions`,
                })
              : t("codego.diagnostics.sanitized", "Sanitized")}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {previewQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(
              "codego.diagnostics.loading",
              "Loading latest crash report",
            )}
          </div>
        ) : null}

        {previewQuery.error ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-600">
            {extractErrorMessage(previewQuery.error) ||
              t(
                "codego.diagnostics.loadFailed",
                "Failed to load local diagnostics",
              )}
          </div>
        ) : null}

        {!previewQuery.isLoading &&
        !previewQuery.error &&
        !preview?.hasReport ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            {t(
              "codego.diagnostics.empty",
              "No local crash report was found on this device.",
            )}
          </div>
        ) : null}

        {preview?.hasReport ? (
          <>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div className="space-y-1">
                  <div className="font-medium">{preview.summary}</div>
                  <div className="text-xs text-amber-700/80">
                    {t(
                      "codego.diagnostics.notice",
                      "Sent data excludes tokens, Authorization headers, API keys, and local absolute paths.",
                    )}
                  </div>
                  <div className="text-xs text-amber-700/80">
                    {t("codego.diagnostics.captured", "Captured")}:{" "}
                    {formatDateTime(preview.generatedAt ?? undefined)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="codego-diagnostic-preview"
                className="text-sm font-medium"
              >
                {t(
                  "codego.diagnostics.previewLabel",
                  "Sanitized report preview",
                )}
              </Label>
              <Textarea
                id="codego-diagnostic-preview"
                value={preview.preview}
                readOnly
                className="min-h-52 font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="codego-diagnostic-note"
                className="text-sm font-medium"
              >
                {t("codego.diagnostics.noteLabel", "Optional note")}
              </Label>
              <Textarea
                id="codego-diagnostic-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t(
                  "codego.diagnostics.notePlaceholder",
                  "What were you doing when the crash happened?",
                )}
                className="min-h-24"
              />
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
              <Checkbox
                id="codego-diagnostic-consent"
                checked={consentChecked}
                onCheckedChange={(checked) =>
                  setConsentChecked(checked === true)
                }
              />
              <div className="space-y-1">
                <Label
                  htmlFor="codego-diagnostic-consent"
                  className="text-sm font-medium"
                >
                  {t(
                    "codego.diagnostics.consentLabel",
                    "I reviewed the sanitized report and want to send it",
                  )}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "codego.diagnostics.consentHint",
                    "This uploads app version, platform, crash summary, the sanitized excerpt above, and your optional note.",
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                className="h-9 gap-2"
                disabled={!consentChecked || submitMutation.isPending}
                onClick={() => void handleSubmit()}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t(
                  "codego.diagnostics.sendButton",
                  "Send diagnostic report",
                )}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
