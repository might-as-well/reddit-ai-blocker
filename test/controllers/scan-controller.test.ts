/** @jest-environment jsdom */
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  setConfig,
  scheduleScan,
} from "../../src/content/controllers/scan-controller";
import type { RuntimeConfig } from "../../src/content/scoring/config";

// ── Chrome mock ───────────────────────────────────────────────────────────────

// Minimal chrome mock needed for safeSendRuntimeMessage (used by classifyWithLlm)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).chrome = {
  runtime: { sendMessage: jest.fn() },
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DISABLED: RuntimeConfig = {
  enabled: false,
  threshold: 8,
  customKeywords: [],
  filterSelfPromotion: false,
  llmEnabled: false,
};

const ENABLED: RuntimeConfig = {
  enabled: true,
  threshold: 8,
  customKeywords: [],
  filterSelfPromotion: false,
  llmEnabled: false,
};

/**
 * Self-promo post that scores ~10 (well above default threshold of 8):
 * repeatedNoCadence(+3) + arrowBullet>=3(+4) + domainCta(+3) + combo(+3) = 13 raw,
 * minus human adjustment (~3) = ~10 adjusted.
 */
const HIGH_SCORE_RAW = [
  "No deep sections. No storytelling. No positioning.",
  "→ Analyze your page for any issues",
  "→ Fix all identified problems",
  "→ Generate a master prompt",
  "→ Apply fixes in one go",
  "Free to try: myapp.io",
  "Check it out and sign up for access.",
].join("\n");

/**
 * Genuine question post: many question marks, minimal promo signals.
 * Scores well below threshold.
 */
const LOW_SCORE_RAW =
  "Did you try this? Did you test this? Did you ship this? Any advice? " +
  "What were your results? How are you acquiring users? I am just curious " +
  "about what everyone thinks and looking for general thoughts and opinions " +
  "from people who have experience with this kind of situation in practice.";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create an <article> element (matched by CANDIDATE_SELECTOR) and add it to the DOM. */
function makePost(textContent: string): HTMLElement {
  const el = document.createElement("article");
  el.textContent = textContent;
  document.body.appendChild(el);
  return el;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  setConfig(DISABLED); // start each test with scanning disabled
});

afterEach(() => {
  // Flush any pending scan timer so the module-level scanTimer resets to null.
  // This ensures the next test's scheduleScan() isn't a no-op.
  jest.runAllTimers();
  jest.useRealTimers();
  document.body.innerHTML = "";
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("scan-controller", () => {
  it("does not hide posts when config.enabled is false", () => {
    setConfig(DISABLED);
    const post = makePost(HIGH_SCORE_RAW);
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(false);
  });

  it("skips posts whose text is shorter than 80 characters", () => {
    setConfig(ENABLED);
    const post = makePost("Too short.");
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(false);
  });

  it("skips posts already marked data-ai-blocker-checked='1'", () => {
    setConfig(ENABLED);
    const post = makePost(HIGH_SCORE_RAW);
    post.dataset.aiBlockerChecked = "1";
    scheduleScan();
    jest.runAllTimers();
    // pre-marked posts are skipped — no hide should occur
    expect(post.classList.contains("ai-blocker-hidden")).toBe(false);
  });

  it("marks scanned posts with data-ai-blocker-checked='1'", () => {
    setConfig(ENABLED);
    const post = makePost(LOW_SCORE_RAW);
    scheduleScan();
    jest.runAllTimers();
    expect(post.dataset.aiBlockerChecked).toBe("1");
  });

  it("second scheduleScan call while timer is pending is debounced (no-op)", () => {
    scheduleScan();
    scheduleScan();
    expect(jest.getTimerCount()).toBe(1);
  });

  it("hides a high-scoring post when scanning is enabled", () => {
    setConfig(ENABLED);
    const post = makePost(HIGH_SCORE_RAW);
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(true);
  });

  it("does not hide a low-scoring human post", () => {
    setConfig(ENABLED);
    const post = makePost(LOW_SCORE_RAW);
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(false);
  });

  it("scheduleScan({ reset: true }) re-evaluates already-checked posts", () => {
    setConfig(ENABLED);
    const post = makePost(LOW_SCORE_RAW);

    // First scan: marks the post as checked
    scheduleScan();
    jest.runAllTimers();
    expect(post.dataset.aiBlockerChecked).toBe("1");

    // Reset scan: clears the checked flag, then scans again
    scheduleScan({ reset: true });
    jest.runAllTimers();
    // Post is re-checked — flag is set to "1" again
    expect(post.dataset.aiBlockerChecked).toBe("1");
  });

  it("respects a lowered threshold — hides posts that score above it", () => {
    setConfig({ ...ENABLED, threshold: 2 });
    // "No X. No Y. No Z." cadence scores +3 raw → above threshold of 2
    const post = makePost(
      "No deep sections. No storytelling. No positioning. This post goes on about many things in depth.",
    );
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(true);
  });

  it("a custom keyword match raises the score (can push a borderline post over a low threshold)", () => {
    // A post that only matches a custom keyword gets a small local boost.
    setConfig({
      ...ENABLED,
      threshold: 2,
      customKeywords: ["vibe"],
    });
    const post = makePost(
      "These days everyone is vibe coding. The vibe is strong with this one. " +
        "I wonder what other people think about the vibe in the industry right now.",
    );
    scheduleScan();
    jest.runAllTimers();
    expect(post.classList.contains("ai-blocker-hidden")).toBe(true);
  });
});
