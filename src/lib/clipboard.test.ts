import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSensitiveClipboardIfUnchanged,
  copySensitiveText,
} from "./clipboard";

describe("clipboard", () => {
  let clipboardValue = "";
  let writeTextMock: ReturnType<typeof vi.fn>;
  let readTextMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardValue = "";
    writeTextMock = vi.fn(async (value: string) => {
      clipboardValue = value;
    });
    readTextMock = vi.fn(async () => clipboardValue);

    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
        readText: readTextMock,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears a sensitive clipboard value after the delay when unchanged", async () => {
    await copySensitiveText("desktop-secret-token", { clearDelayMs: 1000 });

    expect(writeTextMock).toHaveBeenCalledWith("desktop-secret-token");
    expect(clipboardValue).toBe("desktop-secret-token");

    await vi.advanceTimersByTimeAsync(1000);

    expect(readTextMock).toHaveBeenCalled();
    expect(writeTextMock).toHaveBeenLastCalledWith("");
    expect(clipboardValue).toBe("");
  });

  it("does not clear the clipboard after the user copies something else", async () => {
    await copySensitiveText("desktop-secret-token", { clearDelayMs: 1000 });
    clipboardValue = "user-replaced-value";

    await vi.advanceTimersByTimeAsync(1000);

    expect(writeTextMock).not.toHaveBeenCalledWith("");
    expect(clipboardValue).toBe("user-replaced-value");
  });

  it("clears only when the clipboard still matches the expected value", async () => {
    clipboardValue = "desktop-secret-token";

    await expect(
      clearSensitiveClipboardIfUnchanged("desktop-secret-token"),
    ).resolves.toBe(true);
    expect(clipboardValue).toBe("");

    clipboardValue = "different-value";

    await expect(
      clearSensitiveClipboardIfUnchanged("desktop-secret-token"),
    ).resolves.toBe(false);
    expect(clipboardValue).toBe("different-value");
  });
});
