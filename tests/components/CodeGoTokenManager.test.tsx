import { QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGoTokenManager } from "@/components/codego/CodeGoTokenManager";
import { codegoApi } from "@/lib/api";
import { createTestQueryClient } from "../utils/testQueryClient";
import {
  getCodeGoToolConfig,
  getCurrentProviderId,
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

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    onSelect,
    disabled,
  }: {
    children: ReactNode;
    onSelect?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
}));

function renderManager() {
  const client = createTestQueryClient();

  render(
    <QueryClientProvider client={client}>
      <CodeGoTokenManager enabled desktopTokenId={1} />
    </QueryClientProvider>,
  );

  return { client };
}

describe("CodeGoTokenManager", () => {
  beforeEach(() => {
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    setCodeGoAuthState({ authenticated: true });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("applies a selected token to Codex through the token action menu", async () => {
    renderManager();

    expect(
      await screen.findByText("codego codex workstation"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Codex" })[1]);

    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "codego codex applied from codego codex workstation",
        expect.objectContaining({ closeButton: true }),
      ),
    );

    await waitFor(() =>
      expect(getCurrentProviderId("codex")).toBe("codego-codex"),
    );
    expect(getCodeGoToolConfig("codex").currentPreview).toContain(
      "cg_token_2_full_key",
    );
    expect(getCodeGoToolConfig("codex").currentPreview).toContain(
      'model_provider = "custom"',
    );
  });

  it("requires confirmation before copying a full token key", async () => {
    const getTokenKeySpy = vi.spyOn(codegoApi, "getTokenKey");

    renderManager();

    expect(
      await screen.findByText("codego desktop - default"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Copy key" })[0]);

    expect(screen.getByText("Copy full token key")).toBeInTheDocument();
    expect(getTokenKeySpy).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(getTokenKeySpy).toHaveBeenCalledWith(1));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "cg_desktop_xxxx_full",
      ),
    );

    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Copied full key for codego desktop - default",
      expect.objectContaining({ closeButton: true }),
    );

    getTokenKeySpy.mockRestore();
  });
});
