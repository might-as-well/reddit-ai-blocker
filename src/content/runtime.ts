import type { RuntimeMessage } from "../types";

export function isContextInvalidatedError(error: unknown): boolean {
  return String((error as Error)?.message || error).includes(
    "Extension context invalidated",
  );
}

export async function safeSendRuntimeMessage<T>(
  message: RuntimeMessage,
): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch (error: unknown) {
    if (isContextInvalidatedError(error)) return null;
    throw error;
  }
}
