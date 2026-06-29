import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGoDashboard } from "@/components/codego/CodeGoDashboard";
import { settingsApi } from "@/lib/api/settings";
import { createTestQueryClient } from "../utils/testQueryClient";
import { server } from "../msw/server";
import {
  setCodeGoAuthState,
  setCodeGoAuthorizedDevices,
  setCodeGoSummary,
} from "../msw/state";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock("@/components/codego/CodeGoLogsExplorer", () => ({
  CodeGoLogsExplorer: () => <div data-testid="codego-logs-explorer" />,
}));

vi.mock("@/components/codego/CodeGoToolConfigPanel", () => ({
  CodeGoToolConfigPanel: () => <div data-testid="codego-tool-config-panel" />,
}));

vi.mock("@/components/codego/CodeGoTokenManager", () => ({
  CodeGoTokenManager: () => <div data-testid="codego-token-manager" />,
}));

vi.mock("@/components/codego/CodeGoUsageTrendCard", () => ({
  CodeGoUsageTrendCard: () => <div data-testid="codego-usage-trend-card" />,
}));

function renderDashboard() {
  const client = createTestQueryClient();
  const onOpenSettings = vi.fn();
  const onOpenProviders = vi.fn();

  render(
    <QueryClientProvider client={client}>
      <CodeGoDashboard
        onOpenSettings={onOpenSettings}
        onOpenProviders={onOpenProviders}
      />
    </QueryClientProvider>,
  );

  return { client, onOpenProviders, onOpenSettings };
}

describe("CodeGoDashboard", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();

    vi.stubGlobal("open", vi.fn());
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("starts browser authorization and shows the copied device code", async () => {
    server.use(
      http.post("http://tauri.local/codego_poll_auth_session", () =>
        HttpResponse.json({
          status: "pending",
          authenticated: false,
        }),
      ),
    );

    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    expect(
      screen.getByRole("heading", {
        name: "Approve this desktop from the website, then keep control here.",
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Enter this code in your browser"),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open browser again" }),
    ).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCD1234");
  });

  it("reopens the website authorization page and can cancel the pending desktop session", async () => {
    const openExternalSpy = vi.spyOn(settingsApi, "openExternal");
    server.use(
      http.post("http://tauri.local/codego_poll_auth_session", () =>
        HttpResponse.json({
          status: "pending",
          authenticated: false,
        }),
      ),
    );

    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Enter this code in your browser"),
      ).toBeInTheDocument(),
    );

    expect(openExternalSpy).toHaveBeenCalledWith(
      "https://shu26.cfd/desktop/authorize?session_id=desktop-session-1&code=ABCD1234",
    );

    fireEvent.click(screen.getByRole("button", { name: "Open browser again" }));

    await waitFor(() => expect(openExternalSpy).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Enter this code in your browser"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Browser approval and local tool control"),
    ).toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "codego account connected",
      expect.anything(),
    );

    openExternalSpy.mockRestore();
  });

  it("keeps the pending session visible when the first browser open fails and clears the error after reopening succeeds", async () => {
    const openExternalSpy = vi
      .spyOn(settingsApi, "openExternal")
      .mockRejectedValueOnce(new Error("browser launch blocked"))
      .mockResolvedValue(undefined);

    server.use(
      http.post("http://tauri.local/codego_poll_auth_session", () =>
        HttpResponse.json({
          status: "pending",
          authenticated: false,
        }),
      ),
    );

    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Enter this code in your browser"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("browser launch blocked")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open browser again" }));

    await waitFor(() => expect(openExternalSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText("browser launch blocked"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();

    openExternalSpy.mockRestore();
  });

  it("shows a secure storage warning before browser authorization when storage is unavailable", async () => {
    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      secureStorageStatus: "unavailable",
      secureStorageMessage:
        "Secure credential storage is unavailable on this device.",
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByText("Secure storage unavailable"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/temporarily keep the desktop session in local settings/i),
    ).toBeInTheDocument();
  });

  it("switches to the authenticated overview immediately after browser approval succeeds", async () => {
    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Enter this code in your browser"),
      ).toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "demo-user" }),
      ).toBeInTheDocument(),
    );

    expect(
      screen.queryByText("Enter this code in your browser"),
    ).not.toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "codego account connected",
      expect.objectContaining({ closeButton: true }),
    );
  });

  it("renders diagnostics in the authenticated dashboard and requires consent before submitting", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoSummary({
      account: {
        id: 7,
        display_name: "Demo User",
        username: "demo-user",
        group: "default",
        quota: 120.5,
        claude_quota: 40,
        used_quota: 18.75,
        quota_usd: 120.5,
        claude_quota_usd: 40,
        used_quota_usd: 18.75,
        request_count: 64,
        billing_preference: "wallet",
        funding_source_order: ["wallet"],
      },
    });
    server.use(
      http.post("http://tauri.local/codego_get_diagnostic_preview", () =>
        HttpResponse.json({
          hasReport: true,
          summary: "Crash report captured",
          generatedAt: 1719500000,
          preview: "sanitized payload",
          redactionsApplied: ["token"],
        }),
      ),
      http.post("http://tauri.local/codego_submit_diagnostic_report", () =>
        HttpResponse.json({ id: 42 }),
      ),
    );

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Diagnostics/ }));

    await waitFor(() =>
      expect(screen.getByText("Crash report captured")).toBeInTheDocument(),
    );
    expect(screen.getByText("1 redactions")).toBeInTheDocument();
    expect(screen.getByLabelText("Sanitized report preview")).toHaveValue(
      "sanitized payload",
    );

    const sendButton = screen.getByRole("button", {
      name: "Send diagnostic report",
    });
    expect(sendButton).toBeDisabled();

    fireEvent.click(
      screen.getByLabelText(
        "I reviewed the sanitized report and want to send it",
      ),
    );
    expect(sendButton).not.toBeDisabled();

    fireEvent.click(sendButton);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Diagnostic report #42 submitted",
        expect.objectContaining({ closeButton: true }),
      ),
    );
  });

  it("surfaces rejected authorization after the poll result comes back", async () => {
    server.use(
      http.post("http://tauri.local/codego_poll_auth_session", () =>
        HttpResponse.json({
          status: "rejected",
          authenticated: false,
        }),
      ),
    );

    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    const authButton = screen.getByRole("button", {
      name: "Authorize in browser",
    });
    fireEvent.click(authButton);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Authorization was rejected from the website. Start again.",
        ),
      ).toBeInTheDocument(),
    );

    expect(screen.queryByText("REJECT01")).not.toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("surfaces expired authorization after the poll result comes back", async () => {
    server.use(
      http.post("http://tauri.local/codego_poll_auth_session", () =>
        HttpResponse.json({
          status: "expired",
          authenticated: false,
        }),
      ),
    );

    setCodeGoAuthState({
      authenticated: false,
      serverAddress: "https://shu26.cfd",
      lastUsername: "",
    });

    renderDashboard();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Authorization session expired. Start again."),
      ).toBeInTheDocument(),
    );

    expect(
      screen.queryByText("Enter this code in your browser"),
    ).not.toBeInTheDocument();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it("renders the authenticated overview with service and usage summary", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoSummary({
      account: {
        id: 7,
        display_name: "Demo User",
        username: "demo-user",
        group: "default",
        quota: 120.5,
        claude_quota: 40,
        used_quota: 18.75,
        quota_usd: 120.5,
        claude_quota_usd: 40,
        used_quota_usd: 18.75,
        request_count: 64,
        billing_preference: "wallet",
        funding_source_order: ["wallet"],
      },
      service: {
        status: "notice",
        notice: "Codex upstream is degraded",
        maintenance: false,
        recommended_action: "Use Claude or retry after the maintenance window.",
        affected_scopes: ["tool-config", "logs"],
      },
      usage: {
        available_models: ["gpt-5.5", "claude-sonnet-4.5"],
        today_usd: 3.14,
        last_7_days_usd: 14.25,
        last_request_at: 1719500600,
      },
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("$120.50")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(screen.getByText("$18.75")).toBeInTheDocument();
    expect(screen.getByText("64")).toBeInTheDocument();

    expect(screen.getByText("Service status")).toBeInTheDocument();
    expect(screen.getByText("notice")).toBeInTheDocument();
    expect(screen.getByText("Codex upstream is degraded")).toBeInTheDocument();
    expect(
      screen.getByText("Use Claude or retry after the maintenance window."),
    ).toBeInTheDocument();
    expect(screen.getByText("tool-config")).toBeInTheDocument();
    expect(screen.getByText("logs")).toBeInTheDocument();

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("$3.14")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("$14.25")).toBeInTheDocument();
    expect(screen.getAllByText("Last request").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Devices/ }));

    await waitFor(() =>
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );
    expect(screen.getByText("Authorized devices")).toBeInTheDocument();
    expect(screen.getAllByText(/codego desktop/i).length).toBeGreaterThan(0);
  });

  it("renders the service maintenance state when the backend marks maintenance", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoSummary({
      account: {
        id: 7,
        display_name: "Demo User",
        username: "demo-user",
        group: "default",
        quota: 120.5,
        claude_quota: 40,
        used_quota: 18.75,
        quota_usd: 120.5,
        claude_quota_usd: 40,
        used_quota_usd: 18.75,
        request_count: 64,
        billing_preference: "wallet",
        funding_source_order: ["wallet"],
      },
      service: {
        status: "maintenance",
        notice: "Scheduled maintenance is running",
        maintenance: true,
        recommended_action:
          "Wait for maintenance to finish before applying new tool configs.",
        affected_scopes: ["account", "logs"],
      },
      usage: {
        available_models: [],
        today_usd: 0,
        last_7_days_usd: 0,
        last_request_at: 0,
      },
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("maintenance")).toBeInTheDocument();
    expect(
      screen.getByText("Scheduled maintenance is running"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Wait for maintenance to finish before applying new tool configs.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a secure storage warning in the authenticated overview", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
      secureStorageStatus: "unavailable",
      secureStorageMessage:
        "Secure credential storage is unavailable on this device.",
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );

    expect(screen.getByText("Secure storage unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/temporarily keep the desktop session in local settings/i),
    ).toBeInTheDocument();
  });

  it("copies the ensured desktop token and refreshes the summary", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoSummary({
      tokens: {
        total: 0,
        desktop_token: null,
      },
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy full token" }));

    await waitFor(() =>
      expect(screen.getByText("Copy full desktop token")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy token" }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "cg_desktop_full_key",
      ),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Desktop token copied", {
      closeButton: true,
    });

    await waitFor(() =>
      expect(
        screen.getAllByText("codego Desktop - Default").length,
      ).toBeGreaterThan(0),
    );
  });

  it("disconnects the current desktop session from the overview toolbar", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Approve this desktop from the website, then keep control here.",
        }),
      ).toBeInTheDocument(),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "codego account disconnected",
      { closeButton: true },
    );
  });

  it("revokes another authorized device without disconnecting the current desktop", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoAuthorizedDevices([
      {
        id: 11,
        deviceName: "codego desktop",
        platform: "windows",
        appVersion: "0.1.0",
        status: "active",
        createdAt: 1719490000,
        lastUsedAt: 1719500600,
        expiresAt: 1720105400,
        revokedAt: 0,
      },
      {
        id: 12,
        deviceName: "MacBook Pro",
        platform: "macos",
        appVersion: "0.1.0",
        status: "active",
        createdAt: 1719400000,
        lastUsedAt: 1719497000,
        expiresAt: 1720011800,
        revokedAt: 0,
      },
    ]);

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Devices/ }));
    await waitFor(() =>
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );

    const deviceLabel = await screen.findByText("MacBook Pro");
    const deviceRow = deviceLabel.closest("div.rounded-lg");
    expect(deviceRow).not.toBeNull();

    fireEvent.click(
      within(deviceRow as HTMLElement).getByRole("button", {
        name: "Revoke access",
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("Revoke device access")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(screen.queryByText("MacBook Pro")).not.toBeInTheDocument(),
    );

    expect(
      screen.getByRole("heading", { name: "Demo User" }),
    ).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "MacBook Pro access revoked",
      {
        closeButton: true,
      },
    );
  });

  it("keeps revoked devices visible without counting them as active or allowing another revoke", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoAuthorizedDevices([
      {
        id: 11,
        deviceName: "codego desktop",
        platform: "windows",
        appVersion: "0.1.0",
        status: "active",
        createdAt: 1719490000,
        lastUsedAt: 1719500600,
        expiresAt: 1720105400,
        revokedAt: 0,
      },
      {
        id: 12,
        deviceName: "MacBook Pro",
        platform: "macos",
        appVersion: "0.1.0",
        status: "revoked",
        createdAt: 1719400000,
        lastUsedAt: 1719497000,
        expiresAt: 1720011800,
        revokedAt: 1719501200,
      },
    ]);

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Devices/ }));
    await waitFor(() =>
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );

    await screen.findByText("MacBook Pro");
    await waitFor(() =>
      expect(screen.getByText(/1 active/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Revoked").length).toBeGreaterThan(0);

    const revokedRow = screen
      .getByText("MacBook Pro")
      .closest("div.rounded-lg");
    expect(revokedRow).not.toBeNull();

    const revokeButton = within(revokedRow as HTMLElement).getByRole("button", {
      name: "Revoke access",
    });
    expect(revokeButton).toBeDisabled();
    expect(
      within(revokedRow as HTMLElement).getByText("Access: revoked"),
    ).toBeInTheDocument();
  });

  it("revokes the current device and returns to the authorization screen", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
      accessToken: "desktop-access-token",
      userId: 7,
      deviceId: 11,
      lastUsername: "demo-user",
    });
    setCodeGoAuthorizedDevices([
      {
        id: 11,
        deviceName: "codego desktop",
        platform: "windows",
        appVersion: "0.1.0",
        status: "active",
        createdAt: 1719490000,
        lastUsedAt: 1719500600,
        expiresAt: 1720105400,
        revokedAt: 0,
      },
    ]);

    renderDashboard();

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Demo User" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Devices/ }));
    await waitFor(() =>
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );

    const currentDeviceAccess = await screen.findByText("Access: active");
    const currentDeviceRow = currentDeviceAccess.closest("div.rounded-lg");
    expect(currentDeviceRow).not.toBeNull();

    fireEvent.click(
      within(currentDeviceRow as HTMLElement).getByRole("button", {
        name: "Revoke current",
      }),
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke current device" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Approve this desktop from the website, then keep control here.",
        }),
      ).toBeInTheDocument(),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Current device access revoked",
      {
        closeButton: true,
      },
    );
  });
});
