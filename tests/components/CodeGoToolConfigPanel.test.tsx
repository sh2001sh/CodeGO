import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGoToolConfigPanel } from "@/components/codego/CodeGoToolConfigPanel";
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

    expect(await screen.findByText("Codex Code Go preview")).toBeInTheDocument();
    expect(screen.getByText("Current local config")).toBeInTheDocument();
    expect(screen.getByText("Code Go config")).toBeInTheDocument();
    expect(screen.getAllByText(/existing-key/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/cg_desktop_full_key/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByText("Codex Code Go preview")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[0]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go Codex applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(screen.getAllByText("Code Go active").length).toBeGreaterThan(0),
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
    expect(getCodeGoToolConfig("codex").currentPreview).toContain("existing-key");
  });

  it("surfaces unauthenticated test failures for local tool config checks", async () => {
    setCodeGoAuthState({ authenticated: false });

    renderPanel();

    expect(await screen.findByText("Codex")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[0]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Code Go account is not connected",
      ),
    );
  });

  it("updates Claude config from a detected provider to an active Code Go endpoint", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Claude Code")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[1]);

    expect(await screen.findByText("Claude Code Code Go preview")).toBeInTheDocument();
    expect(screen.getAllByText(/ANTHROPIC_BASE_URL/).length).toBeGreaterThan(0);
    expect(getCodeGoToolConfig("claude").nextPreview).toContain(
      "https://shu26.cfd",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Claude Code Code Go preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[1]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Configured endpoint does not match the current Code Go template",
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[1]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go Claude applied",
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
        "Claude Code is configured for the current Code Go endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates Gemini config from a detected provider to an active Code Go endpoint", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Gemini CLI")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[2]);

    expect(await screen.findByText("Gemini CLI Code Go preview")).toBeInTheDocument();
    expect(screen.getAllByText(/GOOGLE_GEMINI_BASE_URL/).length).toBeGreaterThan(0);
    expect(getCodeGoToolConfig("gemini").nextPreview).toContain(
      "https://shu26.cfd",
    );
    expect(getCodeGoToolConfig("gemini").nextPreview).toContain(
      "\"GEMINI_MODEL\": \"gemini-2.5-pro\"",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Gemini CLI Code Go preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[2]);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Configured endpoint does not match the current Code Go template",
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[2]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go Gemini applied",
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
      "\"GEMINI_MODEL\": \"gemini-2.5-pro\"",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[2]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Gemini CLI is configured for the current Code Go endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates OpenCode config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("OpenCode")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[3]);

    expect(await screen.findByText("OpenCode Code Go preview")).toBeInTheDocument();
    expect(screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("OpenCode Code Go preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[3]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go OpenCode applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("opencode")).toContain("codego-opencode"),
    );
    expect(getCurrentProviderId("opencode")).toBe("");
    expect(getCodeGoToolConfig("opencode").currentPreview).toContain(
      "\"apiKey\": \"cg_desktop_full_key\"",
    );
    expect(getCodeGoToolConfig("opencode").currentPreview).toContain(
      "\"baseURL\": \"https://shu26.cfd/v1\"",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[3]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "OpenCode is configured for the current Code Go endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates OpenClaw config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("OpenClaw")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[4]);

    expect(await screen.findByText("OpenClaw Code Go preview")).toBeInTheDocument();
    expect(screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("OpenClaw Code Go preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[4]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go OpenClaw applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("openclaw")).toContain("codego-openclaw"),
    );
    expect(getCurrentProviderId("openclaw")).toBe("");
    expect(getCodeGoToolConfig("openclaw").currentPreview).toContain(
      "\"apiKey\": \"cg_desktop_full_key\"",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[4]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "OpenClaw is configured for the current Code Go endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("updates Hermes config using additive live provider state", async () => {
    setCodeGoAuthState({ authenticated: true });

    renderPanel();

    expect(await screen.findByText("Hermes")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[5]);

    expect(await screen.findByText("Hermes Code Go preview")).toBeInTheDocument();
    expect(screen.getAllByText(/https:\/\/shu26\.cfd\/v1/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Hermes Code Go preview"),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Apply" })[5]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Code Go Hermes applied",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getLiveProviderIds("hermes")).toContain("codego-hermes"),
    );
    expect(getCurrentProviderId("hermes")).toBe("");
    expect(getCodeGoToolConfig("hermes").currentPreview).toContain(
      "\"api_key\": \"cg_desktop_full_key\"",
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Test" })[5]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Hermes is configured for the current Code Go endpoint",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });
});
