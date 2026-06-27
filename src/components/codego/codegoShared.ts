import type { CodeGoConfigTemplate } from "@/lib/api/codego";
import type { Provider } from "@/types";

export type ToolType =
  | "codex"
  | "claude"
  | "gemini"
  | "opencode"
  | "openclaw"
  | "hermes";

export const EMPTY_LOG_QUERY = { p: 0, size: 8 };

export function toProviderName(tool: ToolType) {
  switch (tool) {
    case "codex":
      return "Code Go Codex";
    case "claude":
      return "Code Go Claude";
    case "gemini":
      return "Code Go Gemini";
    case "opencode":
      return "Code Go OpenCode";
    case "openclaw":
      return "Code Go OpenClaw";
    case "hermes":
      return "Code Go Hermes";
  }
}

export function getToolLabel(tool: ToolType) {
  switch (tool) {
    case "codex":
      return "Codex";
    case "claude":
      return "Claude Code";
    case "gemini":
      return "Gemini CLI";
    case "opencode":
      return "OpenCode";
    case "openclaw":
      return "OpenClaw";
    case "hermes":
      return "Hermes";
  }
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatDateTime(timestamp?: number) {
  if (!timestamp) return "-";
  return new Date(timestamp * 1000).toLocaleString();
}

export function buildClaudeProvider(
  template: CodeGoConfigTemplate,
  fullKey: string,
): Omit<Provider, "id"> {
  return {
    name: toProviderName("claude"),
    category: "custom",
    websiteUrl: template.server_address,
    settingsConfig: {
      env: {
        ANTHROPIC_BASE_URL: template.endpoint,
        ANTHROPIC_AUTH_TOKEN: fullKey,
      },
    },
    icon: "newapi",
    iconColor: "#E37A1F",
  };
}

export function buildGeminiProvider(
  template: CodeGoConfigTemplate,
  fullKey: string,
): Omit<Provider, "id"> {
  return {
    name: toProviderName("gemini"),
    category: "custom",
    websiteUrl: template.server_address,
    settingsConfig: {
      env: {
        GOOGLE_GEMINI_BASE_URL: template.endpoint,
        GEMINI_API_KEY: fullKey,
        GEMINI_MODEL: "gemini-2.5-pro",
      },
    },
    icon: "newapi",
    iconColor: "#4285F4",
  };
}

export function buildCodexProvider(
  template: CodeGoConfigTemplate,
  fullKey: string,
): Omit<Provider, "id"> {
  return {
    name: toProviderName("codex"),
    category: "custom",
    websiteUrl: template.server_address,
    settingsConfig: {
      auth: {
        OPENAI_API_KEY: fullKey,
      },
      config: `model_provider = "custom"
model = "gpt-5.5"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "Code Go"
base_url = "${template.endpoint}"
wire_api = "responses"
requires_openai_auth = true`,
    },
    icon: "newapi",
    iconColor: "#0F172A",
  };
}
