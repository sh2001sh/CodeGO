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
      screen.getByRole("heading", { name: "Connect your Code Go account" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Authorize in browser" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Enter this code in your browser")).toBeInTheDocument(),
    );

    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open browser again" })).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCD1234");
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

    const authButton = screen.getByRole("button", { name: "Authorize in browser" });
    fireEvent.click(authButton);

    await waitFor(() =>
      expect(
        screen.getByText("Authorization was rejected from the website. Start again."),
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
        recommended_action:
          "Use Claude or retry after the maintenance window.",
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
      expect(screen.getByRole("heading", { name: "Demo User" })).toBeInTheDocument(),
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
    expect(screen.getByText("Last request")).toBeInTheDocument();
    const devicesCard = screen
      .getByText("Authorized devices")
      .closest("div.rounded-lg.border-border\\/70.bg-card\\/90");
    expect(devicesCard).not.toBeNull();
    expect(within(devicesCard as HTMLElement).getByText("Code Go Desktop")).toBeInTheDocument();
    expect(within(devicesCard as HTMLElement).getByText("MacBook Pro")).toBeInTheDocument();
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
        deviceName: "Code Go Desktop",
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
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );

    const deviceRow = screen.getByText("MacBook Pro").closest("div.rounded-lg");
    expect(deviceRow).not.toBeNull();

    fireEvent.click(
      within(deviceRow as HTMLElement).getByRole("button", { name: "Revoke access" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Revoke device access")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke access" }));

    await waitFor(() =>
      expect(screen.queryByText("MacBook Pro")).not.toBeInTheDocument(),
    );

    expect(screen.getByRole("heading", { name: "Demo User" })).toBeInTheDocument();
    expect(toastSuccessMock).toHaveBeenCalledWith("MacBook Pro access revoked", {
      closeButton: true,
    });
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
        deviceName: "Code Go Desktop",
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
      expect(screen.getByText("Authorized devices")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke current" }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Revoke current device" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Connect your Code Go account" }),
      ).toBeInTheDocument(),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith("Current device access revoked", {
      closeButton: true,
    });
  });
});
