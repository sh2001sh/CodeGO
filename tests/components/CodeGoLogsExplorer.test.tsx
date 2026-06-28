import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { CodeGoLogsExplorer } from "@/components/codego/CodeGoLogsExplorer";
import { createTestQueryClient } from "../utils/testQueryClient";
import { server } from "../msw/server";

describe("CodeGoLogsExplorer", () => {
  beforeEach(() => {
    server.use(
      http.post("http://tauri.local/codego_get_usage_logs", () =>
        HttpResponse.text("logs backend is temporarily unavailable", {
          status: 500,
        }),
      ),
    );
  });

  it("shows an error state when usage logs cannot be loaded", async () => {
    const client = createTestQueryClient();

    render(
      <QueryClientProvider client={client}>
        <CodeGoLogsExplorer enabled />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Failed to load logs")).toBeInTheDocument(),
    );

    expect(
      screen.getByText("logs backend is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No requests matched the current filters."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(screen.getByText("Failed to load logs")).toBeInTheDocument(),
    );
  });

  it("requests the second page when navigating forward", async () => {
    const seenPages: number[] = [];

    server.use(
      http.post(
        "http://tauri.local/codego_get_usage_logs",
        async ({ request }) => {
          const body = (await request.json()) as {
            query?: {
              p?: number;
              size?: number;
            };
          };
          seenPages.push(body.query?.p ?? 0);
          return HttpResponse.json({
            p: body.query?.p ?? 1,
            size: body.query?.size ?? 12,
            total: 24,
            items: [
              {
                id: body.query?.p ?? 1,
                created_at: 1719500000,
                type: 1,
                content: "chat completion",
                model_name: "gpt-5.5",
                token_name: "codego desktop - default",
                quota: 1.25,
                prompt_tokens: 220,
                completion_tokens: 84,
                use_time: 1200,
                request_id: `req_${body.query?.p ?? 1}`,
                upstream_request_id: `upstream_${body.query?.p ?? 1}`,
              },
            ],
          });
        },
      ),
    );

    const client = createTestQueryClient();

    render(
      <QueryClientProvider client={client}>
        <CodeGoLogsExplorer enabled />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(screen.getByText("Page 2 of 2")).toBeInTheDocument(),
    );
    expect(seenPages).toContain(1);
    expect(seenPages).toContain(2);
  });

  it("submits the active filters, shows the matching row, and opens request details", async () => {
    const seenQueries: Array<Record<string, unknown>> = [];

    server.use(
      http.post(
        "http://tauri.local/codego_get_usage_logs",
        async ({ request }) => {
          const body = (await request.json()) as {
            query?: Record<string, unknown>;
          };
          const query = body.query ?? {};
          seenQueries.push(query);

          return HttpResponse.json({
            p: query.p ?? 1,
            size: query.size ?? 12,
            total: 1,
            items: [
              {
                id: 77,
                created_at: 1719500600,
                type: 1,
                content: "matched desktop request",
                model_name: "gpt-5.5",
                token_name: "codego desktop - default",
                quota: 2.5,
                prompt_tokens: 321,
                completion_tokens: 123,
                use_time: 876,
                request_id: "req_filter_match",
                upstream_request_id: "upstream_filter_match",
              },
            ],
          });
        },
      ),
    );

    const client = createTestQueryClient();

    render(
      <QueryClientProvider client={client}>
        <CodeGoLogsExplorer enabled />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("1 matching requests")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "gpt-5.5" },
    });
    fireEvent.change(screen.getByLabelText("Token"), {
      target: { value: "Desktop" },
    });
    fireEvent.change(screen.getByLabelText("Request ID"), {
      target: { value: "req_filter_match" },
    });
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2024-06-27" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2024-06-28" },
    });

    const typeTrigger = screen.getByRole("combobox", { name: "Type" });
    fireEvent.click(typeTrigger);
    fireEvent.click(screen.getByRole("option", { name: "Completion" }));

    await waitFor(() => expect(screen.getByText("2.5")).toBeInTheDocument());

    expect(seenQueries.some((query) => query.model_name === "gpt-5.5")).toBe(
      true,
    );
    expect(seenQueries.some((query) => query.token_name === "Desktop")).toBe(
      true,
    );
    expect(
      seenQueries.some((query) => query.request_id === "req_filter_match"),
    ).toBe(true);
    expect(seenQueries.some((query) => query.type === 1)).toBe(true);
    expect(
      seenQueries.some(
        (query) =>
          typeof query.start_timestamp === "number" &&
          typeof query.end_timestamp === "number",
      ),
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Inspect" }));

    await waitFor(() =>
      expect(screen.getByText("Request detail")).toBeInTheDocument(),
    );
    expect(screen.getByText("matched desktop request")).toBeInTheDocument();
    expect(screen.getByText("req_filter_match")).toBeInTheDocument();
    expect(screen.getByText("upstream_filter_match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByText("Request detail")).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue(""));
    expect(screen.getByLabelText("Token")).toHaveValue("");
    expect(screen.getByLabelText("Request ID")).toHaveValue("");
    expect(screen.getByLabelText("Start date")).toHaveValue("");
    expect(screen.getByLabelText("End date")).toHaveValue("");
  });
});
