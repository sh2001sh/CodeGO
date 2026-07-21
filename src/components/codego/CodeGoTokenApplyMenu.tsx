import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { codegoApi } from "@/lib/api";
import type {
  CodeGoToken,
  CodeGoToolConfigApplyResult,
} from "@/lib/api/codego";
import { extractErrorMessage } from "@/utils/errorUtils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import { normalizeCodeGoBrand } from "./codegoShared";

type ToolType =
  | "codex"
  | "claude"
  | "gemini"
  | "opencode"
  | "openclaw"
  | "hermes";

interface CodeGoTokenApplyMenuProps {
  token: CodeGoToken;
}

const APPLY_TARGETS: Array<{ tool: ToolType; label: string }> = [
  { tool: "codex", label: "Codex" },
  { tool: "claude", label: "Claude Code" },
  { tool: "gemini", label: "Gemini CLI" },
  { tool: "opencode", label: "OpenCode" },
  { tool: "openclaw", label: "OpenClaw" },
  { tool: "hermes", label: "Hermes" },
];

async function refreshCodeGoQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["providers"] }),
    queryClient.invalidateQueries({
      queryKey: ["codego", "tool-config-statuses"],
    }),
    queryClient.invalidateQueries({ queryKey: ["codego", "summary"] }),
  ]);
}

function buildSuccessMessage(
  result: CodeGoToolConfigApplyResult,
  tokenName: string,
) {
  return normalizeCodeGoBrand(
    `${result.providerName} applied from ${tokenName}`,
  ).toLowerCase();
}

/** Apply a selected codego token to one local CLI tool. */
export function CodeGoTokenApplyMenu({ token }: CodeGoTokenApplyMenuProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [applyingTool, setApplyingTool] = useState<ToolType | null>(null);
  const [restoringTool, setRestoringTool] = useState<ToolType | null>(null);
  const statusQuery = useQuery({
    queryKey: ["codego", "tool-config-statuses"],
    queryFn: () => codegoApi.getToolConfigStatuses(),
  });

  const handleApply = async (tool: ToolType) => {
    setApplyingTool(tool);
    try {
      const result = await codegoApi.applyToolConfigFromToken(token.id, tool);
      await refreshCodeGoQueries(queryClient);
      toast.success(buildSuccessMessage(result, token.name), {
        closeButton: true,
      });
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t("codego.tokens.applyFailed", "Failed to apply token config"),
      );
    } finally {
      setApplyingTool(null);
    }
  };

  const handleRestore = async (tool: ToolType) => {
    setRestoringTool(tool);
    try {
      await codegoApi.restoreToolConfig(tool);
      await refreshCodeGoQueries(queryClient);
      toast.success(
        t("codego.tokens.restoreSuccess", "Original configuration restored"),
        {
          closeButton: true,
        },
      );
    } catch (error) {
      toast.error(
        extractErrorMessage(error) ||
          t(
            "codego.tokens.restoreFailed",
            "Failed to restore original configuration",
          ),
      );
    } finally {
      setRestoringTool(null);
    }
  };

  const restorableTargets = APPLY_TARGETS.filter((target) =>
    statusQuery.data?.some(
      (status) => status.tool === target.tool && status.hasBackup,
    ),
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={Boolean(applyingTool || restoringTool)}
        >
          {applyingTool ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {t("codego.tokens.applyTo", "Apply to")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>
          {t("codego.tokens.applyConfig", "Apply token config")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APPLY_TARGETS.map(({ tool, label }) => (
          <DropdownMenuItem
            key={tool}
            disabled={Boolean(applyingTool)}
            onSelect={() => void handleApply(tool)}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
        {restorableTargets.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              {t(
                "codego.tokens.restoreOriginal",
                "Restore original configuration",
              )}
            </DropdownMenuLabel>
            {restorableTargets.map(({ tool, label }) => (
              <DropdownMenuItem
                key={`restore-${tool}`}
                disabled={Boolean(applyingTool || restoringTool)}
                onSelect={() => void handleRestore(tool)}
              >
                {restoringTool === tool ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                {label}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
