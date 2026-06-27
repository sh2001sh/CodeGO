import { Suspense, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { providersApi } from "@/lib/api/providers";
import {
  setCodeGoAuthState,
  resetProviderState,
  setCurrentProviderId,
  getCodeGoTokens,
  setCodeGoSummary,
  setCodeGoTokens,
  setLiveProviderIds,
  setProviders,
} from "../msw/state";
import { emitTauriEvent } from "../msw/tauriMocks";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/providers/ProviderList", () => ({
  ProviderList: ({
    providers,
    currentProviderId,
    onSwitch,
    onEdit,
    onDuplicate,
    onConfigureUsage,
    onOpenWebsite,
    onCreate,
  }: any) => (
    <div>
      <div data-testid="provider-list">{JSON.stringify(providers)}</div>
      <div data-testid="current-provider">{currentProviderId}</div>
      <button onClick={() => onSwitch(providers[currentProviderId])}>
        switch
      </button>
      <button onClick={() => onEdit(providers[currentProviderId])}>edit</button>
      <button onClick={() => onDuplicate(providers[currentProviderId])}>
        duplicate
      </button>
      <button onClick={() => onConfigureUsage(providers[currentProviderId])}>
        usage
      </button>
      <button onClick={() => onOpenWebsite("https://example.com")}>
        open-website
      </button>
      <button onClick={() => onCreate?.()}>create</button>
    </div>
  ),
}));

vi.mock("@/components/providers/AddProviderDialog", () => ({
  AddProviderDialog: ({ open, onOpenChange, onSubmit, appId }: any) =>
    open ? (
      <div data-testid="add-provider-dialog">
        <button
          onClick={() =>
            onSubmit({
              name: `New ${appId} Provider`,
              settingsConfig: {},
              category: "custom",
              sortIndex: 99,
            })
          }
        >
          confirm-add
        </button>
        <button onClick={() => onOpenChange(false)}>close-add</button>
      </div>
    ) : null,
}));

vi.mock("@/components/providers/EditProviderDialog", () => ({
  EditProviderDialog: ({ open, provider, onSubmit, onOpenChange }: any) =>
    open ? (
      <div data-testid="edit-provider-dialog">
        <button
          onClick={() =>
            onSubmit({
              provider: {
                ...provider,
                name: `${provider.name}-edited`,
              },
              originalId: provider.id,
            })
          }
        >
          confirm-edit
        </button>
        <button onClick={() => onOpenChange(false)}>close-edit</button>
      </div>
    ) : null,
}));

vi.mock("@/components/UsageScriptModal", () => ({
  default: ({ isOpen, provider, onSave, onClose }: any) =>
    isOpen ? (
      <div data-testid="usage-modal">
        <span data-testid="usage-provider">{provider?.id}</span>
        <button onClick={() => onSave("script-code")}>save-script</button>
        <button onClick={() => onClose()}>close-usage</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: ({ isOpen, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <button onClick={() => onConfirm()}>confirm-delete</button>
        <button onClick={() => onCancel()}>cancel-delete</button>
      </div>
    ) : null,
}));

vi.mock("@/components/AppSwitcher", () => ({
  AppSwitcher: ({ activeApp, onSwitch }: any) => (
    <div data-testid="app-switcher">
      <span>{activeApp}</span>
      <button onClick={() => onSwitch("claude")}>switch-claude</button>
      <button onClick={() => onSwitch("codex")}>switch-codex</button>
      <button onClick={() => onSwitch("openclaw")}>switch-openclaw</button>
    </div>
  ),
}));

vi.mock("@/components/UpdateBadge", () => ({
  UpdateBadge: ({ onClick }: any) => (
    <button onClick={onClick}>update-badge</button>
  ),
}));

vi.mock("@/components/mcp/McpPanel", () => ({
  default: ({ open, onOpenChange }: any) =>
    open ? (
      <div data-testid="mcp-panel">
        <button onClick={() => onOpenChange(false)}>close-mcp</button>
      </div>
    ) : (
      <button onClick={() => onOpenChange(true)}>open-mcp</button>
    ),
}));

const renderApp = (AppComponent: ComponentType) => {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <Suspense fallback={<div data-testid="loading">loading</div>}>
        <AppComponent />
      </Suspense>
    </QueryClientProvider>,
  );
};

describe("App integration with MSW", () => {
  beforeEach(() => {
    resetProviderState();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    localStorage.clear();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("covers basic provider flows via real hooks", async () => {
    localStorage.setItem("cc-switch-last-view", "providers");
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    fireEvent.click(screen.getByText("switch-codex"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "codex-1",
      ),
    );

    fireEvent.click(screen.getByText("usage"));
    expect(screen.getByTestId("usage-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("save-script"));
    fireEvent.click(screen.getByText("close-usage"));

    fireEvent.click(screen.getByText("create"));
    expect(screen.getByTestId("add-provider-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-add"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(
        /New codex Provider/,
      ),
    );

    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("edit-provider-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("confirm-edit"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(
        /-edited/,
      ),
    );

    fireEvent.click(screen.getByText("switch"));
    fireEvent.click(screen.getByText("duplicate"));
    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toMatch(/copy/),
    );

    fireEvent.click(screen.getByText("open-website"));

    emitTauriEvent("provider-switched", {
      appType: "codex",
      providerId: "codex-2",
    });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
  }, 10000);

  it("shows toast when auto sync fails in background", async () => {
    localStorage.setItem("cc-switch-last-view", "providers");
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );

    expect(() => {
      emitTauriEvent("webdav-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("webdav-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "network timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });

    toastErrorMock.mockReset();
    expect(() => {
      emitTauriEvent("s3-sync-status-updated", null);
    }).not.toThrow();
    expect(toastErrorMock).not.toHaveBeenCalled();

    emitTauriEvent("s3-sync-status-updated", {
      source: "auto",
      status: "error",
      error: "s3 timeout",
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalled();
    });
  });

  it("duplicates openclaw providers with a generated key that avoids live-only ids", async () => {
    localStorage.setItem("cc-switch-last-view", "providers");
    setProviders("openclaw", {
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        settingsConfig: {
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          api: "openai-completions",
          models: [],
        },
        category: "custom",
        sortIndex: 0,
        createdAt: Date.now(),
      },
    });
    setCurrentProviderId("openclaw", "deepseek");
    setLiveProviderIds("openclaw", ["deepseek-copy"]);

    const { default: App } = await import("@/App");
    renderApp(App);

    fireEvent.click(screen.getByText("switch-openclaw"));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "deepseek",
      ),
    );

    fireEvent.click(screen.getByText("duplicate"));

    await waitFor(() => {
      const providerList = screen.getByTestId("provider-list").textContent;
      expect(providerList).toContain("deepseek-copy-2");
      expect(providerList).toContain("DeepSeek copy");
    });

    expect(toastErrorMock).not.toHaveBeenCalledWith(
      expect.stringContaining("Provider key is required for openclaw"),
    );
  });

  it("shows toast when duplicate cannot load live provider ids", async () => {
    localStorage.setItem("cc-switch-last-view", "providers");
    setProviders("openclaw", {
      deepseek: {
        id: "deepseek",
        name: "DeepSeek",
        settingsConfig: {
          baseUrl: "https://api.deepseek.com",
          apiKey: "test-key",
          api: "openai-completions",
          models: [],
        },
        category: "custom",
        sortIndex: 0,
        createdAt: Date.now(),
      },
    });
    setCurrentProviderId("openclaw", "deepseek");

    const liveIdsSpy = vi
      .spyOn(providersApi, "getOpenClawLiveProviderIds")
      .mockRejectedValueOnce(new Error("broken config"));

    const { default: App } = await import("@/App");
    renderApp(App);

    fireEvent.click(screen.getByText("switch-openclaw"));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "deepseek",
      ),
    );

    fireEvent.click(screen.getByText("duplicate"));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("读取配置中的供应商标识失败"),
      );
    });

    expect(screen.getByTestId("provider-list").textContent).not.toContain(
      "deepseek-copy",
    );

    liveIdsSpy.mockRestore();
  });

  it("defaults to the Code Go dashboard and can open providers after login", async () => {
    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() => {
      expect(screen.getAllByText("Code Go Desktop").length).toBeGreaterThan(0);
      expect(screen.getByText("Browser authorization")).toBeInTheDocument();
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Authorize in browser" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Authorize in browser" }));

    await waitFor(() => {
      expect(screen.getByText("Enter this code in your browser")).toBeInTheDocument();
      expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    });

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith(
      "Code Go account connected",
      expect.objectContaining({ closeButton: true }),
    ));

    await waitFor(() => {
      expect(screen.getByText("Tool configuration")).toBeInTheDocument();
      expect(screen.getByText("Usage trends")).toBeInTheDocument();
      expect(
        screen.getByText("Rolling usage across the last 7 days."),
      ).toBeInTheDocument();
      expect(screen.getAllByText("Config detected").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    await waitFor(() =>
      expect(
        screen.getByText("Rolling usage across the last 30 days."),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]!);
    await waitFor(() =>
      expect(screen.getByText(/Code Go preview/)).toBeInTheDocument(),
    );
    await waitFor(() => {
      expect(screen.getByText("Current local config")).toBeInTheDocument();
      expect(screen.getByText("Code Go config")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]!);
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining("applied"),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]!);
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining("configured for the current Code Go endpoint"),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]!);
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        expect.stringContaining("config restored"),
        expect.objectContaining({
          closeButton: true,
        }),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Providers" }));

    await waitFor(() =>
      expect(screen.getByTestId("provider-list").textContent).toContain(
        "claude-1",
      ),
    );
  });

  it("manages Code Go tokens and inspects filtered logs", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "codego-access-token",
      userId: 7,
      lastUsername: "demo-user",
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Tokens" })).toBeInTheDocument(),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Tokens" }));

    await waitFor(() =>
      expect(screen.getByText("Token management")).toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(screen.getByText("Code Go Codex Workstation")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "New token" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "QA Sandbox" },
    });
    fireEvent.change(screen.getByLabelText("Group"), {
      target: { value: "qa" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create token" }));

    await waitFor(() =>
      expect(screen.getByText("QA Sandbox")).toBeInTheDocument(),
    );
    expect(getCodeGoTokens().some((item) => item.name === "QA Sandbox")).toBe(
      true,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Copy key/ })[0]!,
    );
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalled(),
    );

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Logs" }));

    await waitFor(() =>
      expect(screen.getByText("Usage logs")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "claude-sonnet-4" },
    });

    await waitFor(() =>
      expect(screen.getByText("claude-sonnet-4")).toBeInTheDocument(),
    );
    expect(screen.queryByText("gpt-5.5")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Inspect/ }));

    await waitFor(() =>
      expect(screen.getByText("Request detail")).toBeInTheDocument(),
    );
    expect(screen.getByText("claude request")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
  });

  it("ensures a desktop token, refreshes summary, and copies the full key from the overview card", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "codego-access-token",
      userId: 7,
      lastUsername: "demo-user",
    });
    setCodeGoTokens([
      {
        id: 2,
        name: "Code Go Codex Workstation",
        key: "cg_codex_xxxx",
        remain_quota: 250,
        unlimited_quota: false,
        group: "engineering",
        model_limits_enabled: true,
        model_limits: "gpt-5.5,claude-sonnet-4",
      },
    ]);
    setCodeGoSummary({
      tokens: {
        total: 0,
        desktop_token: null,
      },
    });

    const { default: App } = await import("@/App");
    renderApp(App);

    await waitFor(() =>
      expect(screen.getByText("Desktop token")).toBeInTheDocument(),
    );
    expect(screen.getByText("0 total")).toBeInTheDocument();
    expect(screen.getByText("Create a desktop token")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy full token" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "cg_desktop_full_key",
      ),
    );
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Desktop token copied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() => expect(screen.getByText("1 total")).toBeInTheDocument());
    expect(screen.getByText("cg_desktop_xxxx")).toBeInTheDocument();
  });
});
