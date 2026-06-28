import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeepLinkImportDialog } from "@/components/DeepLinkImportDialog";
import type { DeepLinkImportRequest } from "@/lib/api/deeplink";
import type { CodeGoToolConfigApplyResult } from "@/lib/api/codego";
import { emitTauriEvent } from "../msw/tauriMocks";
import { createTestQueryClient } from "../utils/testQueryClient";

const mergeDeeplinkConfigMock = vi.fn();
const importFromDeeplinkMock = vi.fn();
const applyToolConfigFromTokenMock = vi.fn();
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const toastWarningMock = vi.fn();

vi.mock("@/lib/api/deeplink", () => ({
  deeplinkApi: {
    mergeDeeplinkConfig: (...args: unknown[]) =>
      mergeDeeplinkConfigMock(...args),
    importFromDeeplink: (...args: unknown[]) => importFromDeeplinkMock(...args),
  },
}));

vi.mock("@/lib/api", () => ({
  codegoApi: {
    applyToolConfigFromToken: (...args: unknown[]) =>
      applyToolConfigFromTokenMock(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}));

function renderDialog() {
  const client = createTestQueryClient();
  const invalidateQueriesSpy = vi.spyOn(client, "invalidateQueries");
  const refetchQueriesSpy = vi.spyOn(client, "refetchQueries");

  render(
    <QueryClientProvider client={client}>
      <DeepLinkImportDialog />
    </QueryClientProvider>,
  );

  return {
    client,
    invalidateQueriesSpy,
    refetchQueriesSpy,
  };
}

async function emitDialogEvent(event: string, payload: unknown) {
  await act(async () => {
    emitTauriEvent(event, payload);
    await Promise.resolve();
  });
}

describe("DeepLinkImportDialog", () => {
  beforeEach(() => {
    mergeDeeplinkConfigMock.mockReset();
    importFromDeeplinkMock.mockReset();
    applyToolConfigFromTokenMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastWarningMock.mockReset();
    vi.restoreAllMocks();
  });

  it("merges a provider deeplink request and imports it with provider cache refresh", async () => {
    const originalRequest: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "codex",
      name: "codego Codex",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      apiKey: "cg_test_1234567890",
      configUrl: "https://shu26.cfd/config/codex.json",
    };
    const mergedRequest: DeepLinkImportRequest = {
      ...originalRequest,
      notes: "Imported from codego desktop flow",
    };

    mergeDeeplinkConfigMock.mockResolvedValue(mergedRequest);
    importFromDeeplinkMock.mockResolvedValue({
      type: "provider",
      id: "codego-codex",
    });

    const { invalidateQueriesSpy, refetchQueriesSpy } = renderDialog();

    await emitDialogEvent("deeplink-import", originalRequest);

    await waitFor(() =>
      expect(screen.getByText("codego Codex")).toBeInTheDocument(),
    );

    expect(mergeDeeplinkConfigMock).toHaveBeenCalledWith(originalRequest);
    expect(
      screen.getByText((content) => content.includes("https://shu26.cfd/v1")),
    ).toBeInTheDocument();
    expect(screen.getByText(/cg_t\*+/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(importFromDeeplinkMock).toHaveBeenCalledWith(mergedRequest),
    );

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["providers", "codex"],
    });
    expect(refetchQueriesSpy).toHaveBeenCalled();
    expect(refetchQueriesSpy.mock.calls[0]?.[0]).toMatchObject({
      queryKey: ["providers", "codex"],
      type: "active",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "deeplink.importSuccess",
      expect.objectContaining({
        description: "deeplink.importSuccessDescription",
        closeButton: true,
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "deeplink.import" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("falls back to the original request when config merge fails", async () => {
    const originalRequest: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "claude",
      name: "codego Claude",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd",
      apiKey: "cg_merge_fail_token",
      configUrl: "https://shu26.cfd/config/claude.json",
    };

    mergeDeeplinkConfigMock.mockRejectedValue(new Error("merge exploded"));

    renderDialog();

    await emitDialogEvent("deeplink-import", originalRequest);

    await waitFor(() =>
      expect(screen.getByText("codego Claude")).toBeInTheDocument(),
    );

    expect(toastErrorMock).toHaveBeenCalledWith("deeplink.configMergeError", {
      description: "merge exploded",
    });
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
    expect(
      screen.getByText((content) => content.trim() === "🔹 https://shu26.cfd"),
    ).toBeInTheDocument();
  });

  it("shows a parse error toast for invalid deeplink events", async () => {
    renderDialog();

    await emitDialogEvent("deeplink-error", {
      url: "ccswitch://broken",
      error: "unsupported resource",
    });

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("deeplink.parseError", {
        description: "unsupported resource",
      }),
    );
  });

  it("dispatches the prompt-imported event after importing a prompt deeplink", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "prompt",
      app: "codex",
      name: "codego review prompt",
      description: "Reusable review instruction",
      content: btoa("Review this patch carefully."),
      enabled: true,
    };
    const promptImportedListener = vi.fn();

    importFromDeeplinkMock.mockResolvedValue({
      type: "prompt",
      id: "prompt-1",
    });

    window.addEventListener("prompt-imported", promptImportedListener);
    renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(
      await screen.findByText("codego review prompt"),
    ).toBeInTheDocument();
    expect(screen.getByText("Reusable review instruction")).toBeInTheDocument();
    expect(
      screen.getByText(/Review this patch carefully\./),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(importFromDeeplinkMock).toHaveBeenCalledWith(request),
    );
    await waitFor(() =>
      expect(promptImportedListener).toHaveBeenCalledTimes(1),
    );

    const event = promptImportedListener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.detail).toEqual({ app: "codex" });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "deeplink.promptImportSuccess",
      expect.objectContaining({
        description: "deeplink.promptImportSuccessDescription",
        closeButton: true,
      }),
    );

    window.removeEventListener("prompt-imported", promptImportedListener);
  });

  it("refreshes MCP queries and shows partial success when some MCP servers fail", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "mcp",
      apps: "claude,codex",
      enabled: true,
      config: btoa(
        JSON.stringify({
          mcpServers: {
            alpha: { command: "npx", args: ["-y", "alpha"] },
            beta: { url: "http://localhost:3333/mcp" },
          },
        }),
      ),
    };

    importFromDeeplinkMock.mockResolvedValue({
      type: "mcp",
      importedCount: 1,
      importedIds: ["alpha"],
      failed: [{ id: "beta", error: "connection refused" }],
    });
    mergeDeeplinkConfigMock.mockResolvedValue(request);

    const { invalidateQueriesSpy, refetchQueriesSpy } = renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(importFromDeeplinkMock).toHaveBeenCalledWith(request),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["mcp", "all"],
      refetchType: "all",
    });
    expect(refetchQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["mcp", "all"],
      type: "all",
    });
    expect(toastWarningMock).toHaveBeenCalledWith(
      "deeplink.mcpPartialSuccess",
      expect.objectContaining({
        description: "deeplink.mcpPartialSuccessDescription",
      }),
    );
  });

  it("refreshes skills queries after importing a skill deeplink", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "skill",
      repo: "openai/codex-skills",
      directory: "codego",
      branch: "main",
    };

    importFromDeeplinkMock.mockResolvedValue({
      type: "skill",
      key: "openai/codex-skills:codego",
    });

    const { invalidateQueriesSpy, refetchQueriesSpy } = renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("openai/codex-skills")).toBeInTheDocument();
    expect(screen.getByText("codego")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(importFromDeeplinkMock).toHaveBeenCalledWith(request),
    );
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["skills"],
      refetchType: "all",
    });
    expect(refetchQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["skills"],
      type: "all",
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "deeplink.skillImportSuccess",
      expect.objectContaining({
        description: "deeplink.skillImportSuccessDescription",
        closeButton: true,
      }),
    );
  });

  it("applies codego tool config from deeplink token without importing provider", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "codex",
      name: "codego Codex",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      configUrl: "https://shu26.cfd/api/desktop/import/config?code=abc",
      configFormat: "json",
      codegoAction: "applyToolConfig",
      tokenId: 42,
    };
    const applyResult: CodeGoToolConfigApplyResult = {
      tool: "codex",
      providerId: "codego-codex",
      providerName: "codego Codex",
      backupSaved: true,
    };

    mergeDeeplinkConfigMock.mockResolvedValue(request);
    applyToolConfigFromTokenMock.mockResolvedValue(applyResult);

    const { invalidateQueriesSpy, refetchQueriesSpy } = renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("codego Codex")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Apply this codego token to the local tool configuration",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(applyToolConfigFromTokenMock).toHaveBeenCalledWith(42, "codex"),
    );
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["providers"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["codego", "tool-config-statuses"],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["codego", "summary"],
    });
    const refetchQueryKeys = refetchQueriesSpy.mock.calls.map(
      ([options]) => options?.queryKey,
    );
    expect(refetchQueryKeys).toEqual(
      expect.arrayContaining([
        ["providers"],
        ["codego", "tool-config-statuses"],
        ["codego", "summary"],
      ]),
    );
    expect(toastSuccessMock).toHaveBeenCalledWith("codego Codex applied", {
      closeButton: true,
    });
  });

  it("surfaces codego tool apply errors from deeplink token imports and keeps the dialog open", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "codex",
      name: "codego Codex",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      configUrl: "https://shu26.cfd/api/desktop/import/config?code=abc",
      configFormat: "json",
      codegoAction: "applyToolConfig",
      tokenId: 42,
    };

    mergeDeeplinkConfigMock.mockResolvedValue(request);
    applyToolConfigFromTokenMock.mockRejectedValue(
      new Error(
        "Current local Codex config.toml is malformed, so codego cannot safely overwrite it.",
      ),
    );

    renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("codego Codex")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Apply this codego token to the local tool configuration",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(applyToolConfigFromTokenMock).toHaveBeenCalledWith(42, "codex"),
    );
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("deeplink.importError", {
        description:
          "Current local Codex config.toml is malformed, so codego cannot safely overwrite it.",
      }),
    );

    expect(
      screen.getByRole("button", { name: "deeplink.import" }),
    ).toBeInTheDocument();
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
  });

  it("applies OpenCode tool config from deeplink token without importing provider", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "opencode",
      name: "codego OpenCode",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      config: btoa(
        JSON.stringify({
          npm: "@ai-sdk/openai-compatible",
          name: "codego OpenCode",
          options: {
            baseURL: "https://shu26.cfd/v1",
            apiKey: "cg_token_52_full_key",
            setCacheKey: true,
          },
          models: {
            "gpt-5.5": {
              name: "gpt-5.5",
            },
          },
        }),
      ),
      configFormat: "json",
      codegoAction: "applyToolConfig",
      tokenId: 52,
    };
    const applyResult: CodeGoToolConfigApplyResult = {
      tool: "opencode",
      providerId: "codego-opencode",
      providerName: "codego OpenCode",
      backupSaved: true,
    };

    mergeDeeplinkConfigMock.mockResolvedValue(request);
    applyToolConfigFromTokenMock.mockResolvedValue(applyResult);

    renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("codego OpenCode")).toBeInTheDocument();
    expect(screen.getByText("OpenCode JSON:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(applyToolConfigFromTokenMock).toHaveBeenCalledWith(52, "opencode"),
    );
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("codego OpenCode applied", {
      closeButton: true,
    });
  });

  it("applies OpenClaw tool config from deeplink token without importing provider", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "openclaw",
      name: "codego OpenClaw",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      config: btoa(
        JSON.stringify({
          baseUrl: "https://shu26.cfd/v1",
          apiKey: "cg_token_53_full_key",
          api: "openai-completions",
          models: [{ id: "gpt-5.5", name: "gpt-5.5" }],
        }),
      ),
      configFormat: "json",
      codegoAction: "applyToolConfig",
      tokenId: 53,
    };
    const applyResult: CodeGoToolConfigApplyResult = {
      tool: "openclaw",
      providerId: "codego-openclaw",
      providerName: "codego OpenClaw",
      backupSaved: true,
    };

    mergeDeeplinkConfigMock.mockResolvedValue(request);
    applyToolConfigFromTokenMock.mockResolvedValue(applyResult);

    renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("codego OpenClaw")).toBeInTheDocument();
    expect(screen.getByText("OpenClaw JSON:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(applyToolConfigFromTokenMock).toHaveBeenCalledWith(53, "openclaw"),
    );
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("codego OpenClaw applied", {
      closeButton: true,
    });
  });

  it("applies Hermes tool config from deeplink token without importing provider", async () => {
    const request: DeepLinkImportRequest = {
      version: "1",
      resource: "provider",
      app: "hermes",
      name: "codego Hermes",
      homepage: "https://shu26.cfd",
      endpoint: "https://shu26.cfd/v1",
      config: btoa(
        JSON.stringify({
          name: "codego Hermes",
          base_url: "https://shu26.cfd/v1",
          api_key: "cg_token_54_full_key",
          api_mode: "chat_completions",
          models: [{ id: "gpt-5.5", name: "gpt-5.5" }],
        }),
      ),
      configFormat: "json",
      codegoAction: "applyToolConfig",
      tokenId: 54,
    };
    const applyResult: CodeGoToolConfigApplyResult = {
      tool: "hermes",
      providerId: "codego-hermes",
      providerName: "codego Hermes",
      backupSaved: true,
    };

    mergeDeeplinkConfigMock.mockResolvedValue(request);
    applyToolConfigFromTokenMock.mockResolvedValue(applyResult);

    renderDialog();

    await emitDialogEvent("deeplink-import", request);

    expect(await screen.findByText("codego Hermes")).toBeInTheDocument();
    expect(screen.getByText("Hermes JSON:")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "deeplink.import" }));

    await waitFor(() =>
      expect(applyToolConfigFromTokenMock).toHaveBeenCalledWith(54, "hermes"),
    );
    expect(importFromDeeplinkMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalledWith("codego Hermes applied", {
      closeButton: true,
    });
  });
});
