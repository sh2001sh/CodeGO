import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGoDiagnosticReportCard } from "@/components/codego/CodeGoDiagnosticReportCard";
import { server } from "../msw/server";
import { setCodeGoAuthState } from "../msw/state";
import { createTestQueryClient } from "../utils/testQueryClient";
import { http, HttpResponse } from "msw";

const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

function renderCard() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <CodeGoDiagnosticReportCard enabled />
    </QueryClientProvider>,
  );
}

describe("CodeGoDiagnosticReportCard", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
  });

  it("shows the empty state when no crash report exists", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
    });

    renderCard();

    await waitFor(() =>
      expect(
        screen.getByText("No local crash report was found on this device."),
      ).toBeInTheDocument(),
    );
  });

  it("renders the sanitized preview and requires consent before sending", async () => {
    setCodeGoAuthState({
      authenticated: true,
      serverAddress: "https://shu26.cfd",
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

    renderCard();

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
});
