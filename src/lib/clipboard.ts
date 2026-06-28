import { invoke } from "@tauri-apps/api/core";

export async function copyText(text: string): Promise<void> {
  try {
    await invoke("copy_text_to_clipboard", { text });
    return;
  } catch (nativeError) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (webError) {
      throw webError instanceof Error
        ? webError
        : nativeError instanceof Error
          ? nativeError
          : new Error(String(webError || nativeError));
    }
  }
}

const DEFAULT_SENSITIVE_CLIPBOARD_CLEAR_DELAY_MS = 60_000;

interface SensitiveClipboardOptions {
  clearDelayMs?: number;
}

async function writeSensitiveClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  await copyText(text);
}

async function readSensitiveClipboardText(): Promise<string | null> {
  if (!navigator.clipboard?.readText) {
    return null;
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export async function clearSensitiveClipboardIfUnchanged(
  expectedText: string,
): Promise<boolean> {
  const currentText = await readSensitiveClipboardText();
  if (currentText !== expectedText) {
    return false;
  }

  try {
    await writeSensitiveClipboardText("");
    return true;
  } catch {
    return false;
  }
}

export async function copySensitiveText(
  text: string,
  options: SensitiveClipboardOptions = {},
): Promise<void> {
  await writeSensitiveClipboardText(text);

  const clearDelayMs =
    options.clearDelayMs ?? DEFAULT_SENSITIVE_CLIPBOARD_CLEAR_DELAY_MS;
  if (clearDelayMs <= 0) {
    return;
  }

  globalThis.setTimeout(() => {
    void clearSensitiveClipboardIfUnchanged(text);
  }, clearDelayMs);
}
