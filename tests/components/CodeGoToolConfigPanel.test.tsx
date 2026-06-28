import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGoToolConfigPanel } from "@/components/codego/CodeGoToolConfigPanel";
import { server } from "../msw/server";
import { createTestQueryClient } from "../utils/testQueryClient";
import {
  getCurrentProviderId,
  getCodeGoToolConfig,
  getLiveProviderIds,
  setCodeGoAuthState,
} from "../msw/state";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderPanel() {
  const client = createTestQueryClient();

  render(
    <QueryClientProvider client={client}>
      <CodeGoToolConfigPanel enabled />
    </QueryClientProvider>,
  );

  return { client };
}

describe("CodeGoToolConfigPanel", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("shows preview content and supports apply then restore for a tool config", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();
    expect(screen.getAllByText("Config detected").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);

    expect(
      await screen.findByText("Codex codego preview"),
    ).toBeInTheDocument();
    expect(screen.getByText("Current local config")).toBeInTheDocument();
    expect(screen.getByText("codego config")).toBeInTheDocument();
    expect(screen.getAllByText(/existing-key/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cg_desktop_full_key/).length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Codex codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego codex applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByText("codego active").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Backup ready").length).toBeGreaterThan(0);
    expect(getCurrentProviderId("codex")).toBe("codego-codex");
    expect(getCodeGoToolConfig("codex").currentPreview).toContain(
      "cg_desktop_full_key",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codex config restored",
        expect.objectContaining({
          description: expect.any(String),
          closeButton: true,
        }),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByText("Config detected").length).toBeGreaterThan(0),
    );
    expect(getCurrentProviderId("codex")).toBe("codex-1");
    expect(getCodeGoToolConfig("codex").currentPreview).toContain(
      "existing-key",
    );
  });

  it("surfaces unauthenticated test failures for local tool config checks", async () => {
    setCodeGoAuthState({ authenticated: false });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "codego account is not connected",
      ),
    );
  });

  it("shows the backend safe-write error when preview fails on malformed local config", async () => {
    const backendMessage =
      "Current local Codex config.toml is malformed, so codego cannot safely overwrite it. Fix the file and try again: /default/codex/config.toml. Details: expected an equals, found eof at line 1 column 18";

    server.use(
      http.post("http://tauri.local/codego_get_tool_config_preview", () =>
        HttpResponse.text(backendMessage, { status: 500 }),
      ),
    );
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);

    expect(await screen.findByText("Preview failed")).toBeInTheDocument();
    expect(screen.getByText(backendMessage)).toBeInTheDocument();
  });

  it("surfaces the backend safe-write error when apply is blocked by malformed local config", async () => {
    const backendMessage =
      "Current local Codex config.toml is malformed, so codego cannot safely overwrite it. Fix the file and try again: /default/codex/config.toml. Details: expected an equals, found eof at line 1 column 18";

    server.use(
      http.post("http://tauri.local/codego_apply_tool_config", () =>
        HttpResponse.text(backendMessage, { status: 500 }),
      ),
    );
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(backendMessage),
    );
  });

  it("surfaces restore failures instead of failing silently", async () => {
    const backendMessage = "No backup available";

    server.use(
      http.post("http://tauri.local/codego_restore_tool_config", () =>
        HttpResponse.text(backendMessage, { status: 400 }),
      ),
    );
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego codex applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();

    fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[0]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(backendMessage),
    );
  });

  it("updates Claude config from a detected provider to an active codego endpoint", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[1]);

    expect(
      await screen.findByText("Claude Code codego preview"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/ANTHROPIC_BASE_URL/).length).toBeGreaterThan(0);
    expect(getCodeGoToolConfig("claude").nextPreview).toContain(
      "https://shu26.cfd",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Claude Code codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[1]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "configured endpoint does not match the current codego template",
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[1]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego claude applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getCurrentProviderId("claude")).toBe("codego-claude"),
    );
    expect(getCodeGoToolConfig("claude").currentPreview).toContain(
      "https://shu26.cfd",
    );
    expect(getCodeGoToolConfig("claude").currentPreview).toContain(
      "cg_desktop_full_key",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[1]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "claude code is configured for the current codego endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates Gemini config from a detected provider to an active codego endpoint", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Gemini CLI")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[2]);

    expect(
      await screen.findByText("Gemini CLI codego preview"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/GOOGLE_GEMINI_BASE_URL/).length,
    ).toBeGreaterThan(0);
    expect(getCodeGoToolConfig("gemini").nextPreview).toContain(
      "https://shu26.cfd",
    );
    expect(getCodeGoToolConfig("gemini").nextPreview).toContain(
      '"GEMINI_MODEL": "gemini-2.5-pro"',
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Gemini CLI codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[2]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "configured endpoint does not match the current codego template",
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[2]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego gemini applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getCurrentProviderId("gemini")).toBe("codego-gemini"),
    );
    expect(getCodeGoToolConfig("gemini").currentPreview).toContain(
      "https://shu26.cfd",
    );
    expect(getCodeGoToolConfig("gemini").currentPreview).toContain(
      "cg_desktop_full_key",
    );
    expect(getCodeGoToolConfig("gemini").currentPreview).toContain(
      '"GEMINI_MODEL": "gemini-2.5-pro"',
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[2]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "gemini cli is configured for the current codego endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates OpenCode config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("OpenCode")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[3]);

    expect(
      await screen.findByText("OpenCode codego preview"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("OpenCode codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[3]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego opencode applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("opencode")).toContain("codego-opencode"),
    );
    expect(getCurrentProviderId("opencode")).toBe("");
    expect(getCodeGoToolConfig("opencode").currentPreview).toContain(
      '"apiKey": "cg_desktop_full_key"',
    );
    expect(getCodeGoToolConfig("opencode").currentPreview).toContain(
      '"baseURL": "https://shu26.cfd/v1"',
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[3]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "opencode is configured for the current codego endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates OpenClaw config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("OpenClaw")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[4]);

    expect(
      await screen.findByText("OpenClaw codego preview"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("OpenClaw codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[4]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego openclaw applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("openclaw")).toContain("codego-openclaw"),
    );
    expect(getCurrentProviderId("openclaw")).toBe("");
    expect(getCodeGoToolConfig("openclaw").currentPreview).toContain(
      '"apiKey": "cg_desktop_full_key"',
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[4]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "openclaw is configured for the current codego endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates Hermes config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Hermes")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[5]);

    expect(
      await screen.findByText("Hermes codego preview"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Hermes codego preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[5]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego hermes applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("hermes")).toContain("codego-hermes"),
    );
    expect(getCurrentProviderId("hermes")).toBe("");
    expect(getCodeGoToolConfig("hermes").currentPreview).toContain(
      '"api_key": "cg_desktop_full_key"',
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[5]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "hermes is configured for the current codego endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });
});
