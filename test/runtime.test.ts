import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import {
  isContextInvalidatedError,
  safeSendRuntimeMessage,
} from "../src/content/runtime";
import type { RuntimeMessage } from "../src/types";

// ── isContextInvalidatedError ─────────────────────────────────────────────────

describe("isContextInvalidatedError", () => {
  it("returns true for an Error with the invalidation message", () => {
    const err = new Error("Extension context invalidated.");
    expect(isContextInvalidatedError(err)).toBe(true);
  });

  it("returns true when the message contains extra detail after the phrase", () => {
    const err = new Error(
      "Extension context invalidated. (Extension ID: abc123)",
    );
    expect(isContextInvalidatedError(err)).toBe(true);
  });

  it("returns false for an Error with an unrelated message", () => {
    const err = new Error("Network request failed");
    expect(isContextInvalidatedError(err)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isContextInvalidatedError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isContextInvalidatedError(undefined)).toBe(false);
  });

  it("returns false for a plain string without the phrase", () => {
    expect(isContextInvalidatedError("something went wrong")).toBe(false);
  });

  it("returns true for a plain string that contains the phrase", () => {
    expect(
      isContextInvalidatedError("Extension context invalidated"),
    ).toBe(true);
  });
});

// ── safeSendRuntimeMessage ────────────────────────────────────────────────────

const TEST_MESSAGE: RuntimeMessage = { type: "INCREMENT_BLOCKED" };

describe("safeSendRuntimeMessage", () => {
  const mockSendMessage = jest.fn<() => Promise<unknown>>();

  beforeEach(() => {
    mockSendMessage.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).chrome = {
      runtime: { sendMessage: mockSendMessage },
    };
  });

  it("returns the resolved value on success", async () => {
    const response = { ok: true, blockedCount: 5 };
    mockSendMessage.mockResolvedValue(response);

    const result = await safeSendRuntimeMessage(TEST_MESSAGE);
    expect(result).toEqual(response);
    expect(mockSendMessage).toHaveBeenCalledWith(TEST_MESSAGE);
  });

  it("returns null when chrome throws a context invalidated error", async () => {
    mockSendMessage.mockRejectedValue(
      new Error("Extension context invalidated."),
    );

    const result = await safeSendRuntimeMessage(TEST_MESSAGE);
    expect(result).toBeNull();
  });

  it("rethrows errors that are not context invalidated", async () => {
    const networkError = new Error("Network failure");
    mockSendMessage.mockRejectedValue(networkError);

    await expect(safeSendRuntimeMessage(TEST_MESSAGE)).rejects.toThrow(
      "Network failure",
    );
  });

  it("passes the message object unchanged to chrome.runtime.sendMessage", async () => {
    mockSendMessage.mockResolvedValue(null);
    const msg: RuntimeMessage = { type: "CLEAR_CACHE" };
    await safeSendRuntimeMessage(msg);
    expect(mockSendMessage).toHaveBeenCalledWith(msg);
  });
});
