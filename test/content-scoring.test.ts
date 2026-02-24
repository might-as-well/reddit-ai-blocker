import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function installTestGlobals(): void {
  (globalThis as any).__AI_BLOCKER_TEST__ = true;
  (globalThis as any).AiBlockerUi = {
    renderDebugHud: () => undefined,
    ensurePlaceholderTemplateLoaded: async () => undefined,
    ensureDebugHudTemplateLoaded: async () => undefined,
    createPlaceholder: () => {
      const wrapper = {
        isConnected: false,
        classList: { add: () => undefined, remove: () => undefined },
      };
      const toggleButton = {
        addEventListener: () => undefined,
      } as unknown as HTMLButtonElement;
      return { wrapper, toggleButton };
    },
    setPlaceholderState: () => undefined,
    renderPlaceholderContent: () => undefined,
  };
  (globalThis as any).AiBlockerContentConfig = {
    DEFAULTS: {
      enabled: true,
      threshold: 8,
      customKeywords: [],
      filterSelfPromotion: false,
      llmEnabled: false,
    },
    LLM_LOW_DELTA: 3,
    LLM_HIGH_DELTA: 4,
    STRONG_LOCAL_MARGIN: 5,
    DEFAULTS_RECORD: {
      enabled: true,
      threshold: 8,
      customKeywords: [],
      filterSelfPromotion: false,
      llmEnabled: false,
    },
    FIRST_PERSON_MARKERS_REGEX: /\b(i|my|me)\b/g,
    PARALLEL_CADENCE_REGEX:
      /\bwe\s+[a-z]+(?:ed|ing)?\s+while\s+they\s+[a-z]+(?:ed|ing)?\b/g,
    CONTRAST_CADENCE_REGEX:
      /\b(instead of|meanwhile|ironically|the difference was|what surprised me most)\b/g,
    BULLET_REGEX: /[•▪◦]\s/g,
    STRUCTURED_TIMELINE_REGEX: /\bweek\s*\d+\s*:/g,
    CADENCE_HOOK_REGEX:
      /\b(most [a-z\s]+ don['’]t|they lack|outcome:|what this looks like in practice)\b/g,
    STACK_NAMED_REGEX:
      /\b(python|flask|supabase|firebase|api|backend|pipeline)\b/g,
  };
}

describe("local scoring", () => {
  beforeEach(async () => {
    jest.resetModules();
    installTestGlobals();
    require("../src/content");
  });

  afterEach(() => {
    delete (globalThis as any).__AI_BLOCKER_TEST__;
    delete (globalThis as any).__AI_BLOCKER_TEST_HOOKS__;
    delete (globalThis as any).AiBlockerUi;
    delete (globalThis as any).AiBlockerContentConfig;
  });

  it("detects repeated 'No X. No Y. No Z.' cadence", () => {
    const hooks = (globalThis as any).__AI_BLOCKER_TEST_HOOKS__;
    expect(hooks).toBeDefined();
    const raw = "No deep sections. No storytelling. No positioning.";
    const result = hooks.scoreText(normalize(raw), raw, 0);
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.reasoning).toContain("noCadence=");
  });

  it("caps question deduction so many questions do not stack heavily", () => {
    const hooks = (globalThis as any).__AI_BLOCKER_TEST_HOOKS__;
    const raw =
      "Did you try this? Did you test this? Did you ship this? Any advice? What were your results? How are you acquiring users?";
    const result = hooks.scoreText(normalize(raw), raw, 0);
    expect(result.questionAdjustment).toBeLessThanOrEqual(1);
  });

  it("uses DOM list item count as bullet structure signal", () => {
    const hooks = (globalThis as any).__AI_BLOCKER_TEST_HOOKS__;
    const raw = [
      "Analyzes your page",
      "Gives a full breakdown",
      "Explains how to fix it manually",
      "Generates a master prompt",
      "Helps you fix everything in one go",
      "Would love your thoughts",
    ].join("\n");
    const result = hooks.scoreText(normalize(raw), raw, 6);
    expect(result.reasoning).toContain("domLi=6");
    expect(result.hardPromoSignals).toBeGreaterThanOrEqual(1);
  });

  it("keeps obvious AI promo snippets scoring high", () => {
    const hooks = (globalThis as any).__AI_BLOCKER_TEST_HOOKS__;
    const cases = [
      {
        name: "polished landing-page pitch with list blocks",
        raw: [
          "These days many solo SaaS founders are vibe-coding with AI.",
          "But I've noticed a big problem.",
          "No deep sections. No storytelling. No positioning.",
          "What if there was a micro-SaaS app where you simply paste your URL, and AI:",
          "Analyzes your page",
          "Gives a full breakdown",
          "Explains how to fix it manually",
          "Generates a master prompt",
          "Helps you fix everything in one go",
          "The result stays average — burning your credits in the process.",
          "Would love your thoughts and suggestions.",
        ].join("\n"),
        domLi: 6,
        minScore: 8,
      },
      {
        name: "framework style cadence",
        raw: [
          "Most startups don't lack features.",
          "They lack leverage.",
          "What this looks like in practice:",
          "Week 1: Deep dive on ICP and workflow",
          "Week 2: AI opportunity map + prioritized roadmap",
          "Week 3-4: MVP spec and build with eval loops",
          "Outcome: Less manual work. Clear product direction.",
        ].join("\n"),
        domLi: 0,
        minScore: 8,
      },
      {
        name: "self promo feature dump with CTA",
        raw: [
          "Feedback Request",
          "I built a small daily planner and would love feedback.",
          "It has:",
          "Track daily habits",
          "Create and manage tasks",
          "See weekly insights",
          "Write quick reflections",
          "No signup required. Link: dailyplanner.app",
        ].join("\n"),
        domLi: 4,
        minScore: 8,
      },
    ];

    for (const sample of cases) {
      const result = hooks.scoreText(
        normalize(sample.raw),
        sample.raw,
        sample.domLi,
      );
      expect(result.adjustedScore).toBeGreaterThanOrEqual(sample.minScore);
    }
  });
});
