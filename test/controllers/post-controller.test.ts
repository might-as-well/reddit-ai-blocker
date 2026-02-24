/** @jest-environment jsdom */
import { describe, expect, it, beforeEach, jest } from "@jest/globals";
import {
  setDebugLabel,
  clearLikelyAiFlag,
  setLikelyAiFlag,
  hidePost,
  getContiguousPlaceholdersBefore,
} from "../../src/content/controllers/post-controller";

// ── helpers ───────────────────────────────────────────────────────────────────

function makePost(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  document.body.innerHTML = "";
});

// ── setDebugLabel ─────────────────────────────────────────────────────────────

describe("setDebugLabel", () => {
  it("creates a .ai-blocker-debug-label child element with prefixed text", () => {
    const post = makePost();
    setDebugLabel(post, "checked -> passed");

    const label = post.querySelector(".ai-blocker-debug-label");
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("AI Blocker debug: checked -> passed");
  });

  it("updates the label text without creating a second element on repeated calls", () => {
    const post = makePost();
    setDebugLabel(post, "first message");
    setDebugLabel(post, "second message");

    const labels = post.querySelectorAll(".ai-blocker-debug-label");
    expect(labels.length).toBe(1);
    expect(labels[0].textContent).toBe("AI Blocker debug: second message");
  });
});

// ── clearLikelyAiFlag ─────────────────────────────────────────────────────────

describe("clearLikelyAiFlag", () => {
  it("removes an existing .ai-blocker-likely-flag element", () => {
    const post = makePost();
    const flag = document.createElement("div");
    flag.className = "ai-blocker-likely-flag";
    post.appendChild(flag);

    clearLikelyAiFlag(post);

    expect(post.querySelector(".ai-blocker-likely-flag")).toBeNull();
  });

  it("does not throw when no flag exists", () => {
    const post = makePost();
    expect(() => clearLikelyAiFlag(post)).not.toThrow();
  });
});

// ── setLikelyAiFlag ───────────────────────────────────────────────────────────

describe("setLikelyAiFlag", () => {
  it("creates a .ai-blocker-likely-flag element with default text 'Likely AI'", () => {
    const post = makePost();
    setLikelyAiFlag(post);

    const flag = post.querySelector(".ai-blocker-likely-flag");
    expect(flag).not.toBeNull();
    expect(flag!.textContent).toBe("Likely AI");
  });

  it("creates a flag with custom text when provided", () => {
    const post = makePost();
    setLikelyAiFlag(post, "Probably AI");

    const flag = post.querySelector(".ai-blocker-likely-flag");
    expect(flag!.textContent).toBe("Probably AI");
  });

  it("updates text in-place on repeated calls (no duplicate elements)", () => {
    const post = makePost();
    setLikelyAiFlag(post, "Likely AI");
    setLikelyAiFlag(post, "Definitely AI");

    const flags = post.querySelectorAll(".ai-blocker-likely-flag");
    expect(flags.length).toBe(1);
    expect(flags[0].textContent).toBe("Definitely AI");
  });
});

// ── getContiguousPlaceholdersBefore ───────────────────────────────────────────

describe("getContiguousPlaceholdersBefore", () => {
  it("returns empty array when there are no previous siblings", () => {
    const post = makePost();
    expect(getContiguousPlaceholdersBefore(post)).toEqual([]);
  });

  it("returns an empty array when the adjacent sibling is not a placeholder", () => {
    const other = document.createElement("div");
    document.body.appendChild(other);
    const post = makePost();
    expect(getContiguousPlaceholdersBefore(post)).toHaveLength(0);
  });

  it("returns a single placeholder when one is adjacent", () => {
    const ph = document.createElement("div");
    ph.className = "ai-blocker-placeholder";
    document.body.appendChild(ph);
    const post = makePost();

    const result = getContiguousPlaceholdersBefore(post);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ph);
  });

  it("returns multiple contiguous placeholders in closest-first order", () => {
    const ph1 = document.createElement("div");
    ph1.className = "ai-blocker-placeholder";
    const ph2 = document.createElement("div");
    ph2.className = "ai-blocker-placeholder";
    document.body.appendChild(ph1);
    document.body.appendChild(ph2);
    const post = makePost();

    const result = getContiguousPlaceholdersBefore(post);
    expect(result).toHaveLength(2);
    // closest-first: ph2 is immediately before post, ph1 is before ph2
    expect(result[0]).toBe(ph2);
    expect(result[1]).toBe(ph1);
  });

  it("stops collecting at the first non-placeholder sibling", () => {
    const nonPh = document.createElement("div");
    const ph = document.createElement("div");
    ph.className = "ai-blocker-placeholder";
    document.body.appendChild(nonPh);
    document.body.appendChild(ph);
    const post = makePost();

    const result = getContiguousPlaceholdersBefore(post);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ph);
  });
});

// ── hidePost ──────────────────────────────────────────────────────────────────

describe("hidePost", () => {
  it("adds the ai-blocker-hidden class to the post element", () => {
    const post = makePost();
    hidePost(post, { source: "local", score: 9 });
    expect(post.classList.contains("ai-blocker-hidden")).toBe(true);
  });

  it("sets data-ai-blocker-hidden='1' on the post", () => {
    const post = makePost();
    hidePost(post, { source: "local", score: 9 });
    expect((post as HTMLElement).dataset.aiBlockerHidden).toBe("1");
  });

  it("calls onHidden with the correct source", () => {
    const post = makePost();
    const onHidden = jest.fn();
    hidePost(post, { source: "llm", confidence: 0.9 }, { onHidden });
    expect(onHidden).toHaveBeenCalledWith("llm");
  });

  it("calls onIncrementBlocked on the first hide", () => {
    const post = makePost();
    const onIncrementBlocked = jest.fn();
    hidePost(post, { source: "local" }, { onIncrementBlocked });
    expect(onIncrementBlocked).toHaveBeenCalledTimes(1);
  });

  it("does not call onHidden or onIncrementBlocked again on repeated calls (idempotent)", () => {
    const post = makePost();
    const onHidden = jest.fn();
    const onIncrementBlocked = jest.fn();

    hidePost(post, { source: "local" }, { onHidden, onIncrementBlocked });
    hidePost(post, { source: "local" }, { onHidden, onIncrementBlocked });

    expect(onHidden).toHaveBeenCalledTimes(1);
    expect(onIncrementBlocked).toHaveBeenCalledTimes(1);
  });

  it("inserts a placeholder element before the post", () => {
    const post = makePost();
    hidePost(post, { source: "local", score: 9 });

    const prev = post.previousElementSibling;
    expect(prev).not.toBeNull();
    expect(prev!.classList.contains("ai-blocker-placeholder")).toBe(true);
  });
});
