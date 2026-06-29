import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={Boolean(applyingTool)}
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
