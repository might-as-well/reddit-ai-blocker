import { describe, expect, it } from "@jest/globals";
import {
  performCounts,
  scoreAi,
  scoreHuman,
  scoreText,
  formatLocalReasoning,
  type ScoreCounts,
  type ScoringConfig,
} from "../../src/content/scoring/scorer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const DEFAULT_CFG: ScoringConfig = { customKeywords: [], filterSelfPromotion: false };
const PROMO_CFG: ScoringConfig = { customKeywords: [], filterSelfPromotion: true };

/** Build a minimal ScoreCounts with all fields zeroed, then merge overrides. */
function makeCounts(overrides: Partial<ScoreCounts> = {}): ScoreCounts {
  return {
    firstPersonMarkers: 0,
    sentenceChunks: [],
    averageSentenceWords: 0,
    shortSentenceCount: 0,
    veryShortSentenceCount: 0,
    mediumSentenceCount: 0,
    shortSentenceRatio: 0,
    parallelCadenceCount: 0,
    contrastCadenceCount: 0,
    bulletCount: 0,
    structuredTimelineCount: 0,
    cadenceHookCount: 0,
    stackNamedCount: 0,
    humanMarkerCount: 0,
    lowercasePronounICount: 0,
    capitalizationsPerSentence: 0,
    nonTerminalLines: 0,
    lowercaseSentenceStarts: 0,
    malformedPunctuationCount: 0,
    emphaticExclamationCount: 0,
    smushedParenthesisCount: 0,
    digitLedNounPhraseCount: 0,
    questionMarkCount: 0,
    paragraphBreakCount: 0,
    adviceSeekingCount: 0,
    arrowBulletLineCount: 0,
    domainCtaCount: 0,
    marketingLabelLineCount: 0,
    feedbackRequestCount: 0,
    featureListLeadCount: 0,
    noSignupPitchCount: 0,
    freeOfferCount: 0,
    linkFooterCount: 0,
    listLikeLineCount: 0,
    didYouCount: 0,
    questionLeadCount: 0,
    repeatedNoCadenceCount: 0,
    spacedEmDashCount: 0,
    terminalLineRatio: 0,
    effectiveBulletCount: 0,
    domListItemCount: 0,
    ...overrides,
  };
}

// ── performCounts ─────────────────────────────────────────────────────────────

describe("performCounts", () => {
  it("counts first-person markers (I, my, me)", () => {
    const raw = "I built this and my team loved it. Trust me.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.firstPersonMarkers).toBeGreaterThanOrEqual(3); // i, my, me
  });

  it("detects repeated No-X. No-Y. No-Z. cadence", () => {
    const raw = "No deep sections. No storytelling. No positioning.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.repeatedNoCadenceCount).toBeGreaterThanOrEqual(1);
  });

  it("requires all three 'No' clauses — two is not enough", () => {
    const raw = "No deep sections. No storytelling.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.repeatedNoCadenceCount).toBe(0);
  });

  it("counts structured timeline entries (Week N:)", () => {
    const raw = "Week 1: Discovery phase. Week 2: Build phase.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.structuredTimelineCount).toBe(2);
  });

  it("does not count Week N-M: as structured timeline", () => {
    // "Week 3-4:" should not match because the regex expects \d+ immediately before ":"
    const raw = "Week 3-4: Build and test.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.structuredTimelineCount).toBe(0);
  });

  it("detects cadence hook phrases", () => {
    const raw =
      "Most startups don't lack features. They lack leverage. What this looks like in practice is simple. Outcome: clear direction.";
    const counts = performCounts(normalize(raw), raw, 0);
    // "most ... don't", "they lack", "what this looks like in practice", "outcome:"
    expect(counts.cadenceHookCount).toBeGreaterThanOrEqual(3);
  });

  it("effectiveBulletCount = max(text bullets, domListItemCount)", () => {
    const raw = "Line one\nLine two\nLine three";
    // 0 bullet chars in text, but 6 DOM list items
    const counts = performCounts(normalize(raw), raw, 6);
    expect(counts.effectiveBulletCount).toBe(6);
  });

  it("effectiveBulletCount uses text bullets when higher than DOM count", () => {
    // 3 bullet chars, 0 DOM items
    const raw = "• Item one • Item two • Item three";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.effectiveBulletCount).toBe(3);
  });

  it("featureListLeadCount is 0 for normalized text (colon-space breaks the trailing \\b)", () => {
    // The regex /\b(it has:|features?:)\b/ requires a word boundary after ":" but
    // in normalized text "it has: track..." the ":" is followed by space (non-word → non-word = no boundary).
    // This is a known limitation; test documents the actual behavior.
    const raw = "It has: tracking. Features: reports.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.featureListLeadCount).toBe(0);
  });

  it("detects feedbackRequestCount on 'Feedback Request' and 'would love feedback'", () => {
    const raw = "Feedback Request: I would love feedback on this.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.feedbackRequestCount).toBeGreaterThanOrEqual(1);
  });

  it("detects linkFooterCount on 'Link: ...' lines", () => {
    const raw = "Check it out. Link: myapp.io";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.linkFooterCount).toBe(1);
  });

  it("detects noSignupPitchCount", () => {
    const raw = "No signup required. Just paste your URL.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.noSignupPitchCount).toBe(1);
  });

  it("counts question marks correctly", () => {
    const raw = "Did you try this? What happened? Why?";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.questionMarkCount).toBe(3);
  });

  it("counts arrowBulletLineCount for lines starting with →", () => {
    const raw = "→ First step\n→ Second step\n→ Third step\nRegular line.";
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.arrowBulletLineCount).toBe(3);
  });

  it("counts list-like lines (no terminal punctuation, alphabetic start)", () => {
    const raw = [
      "Track daily habits",
      "Create and manage tasks",
      "See weekly insights",
      "Write quick reflections",
      "This line ends with a period.",
    ].join("\n");
    const counts = performCounts(normalize(raw), raw, 0);
    expect(counts.listLikeLineCount).toBeGreaterThanOrEqual(4);
  });

  it("shortSentenceRatio is 0 for empty text", () => {
    const counts = performCounts("", "", 0);
    expect(counts.shortSentenceRatio).toBe(0);
  });
});

// ── scoreAi ───────────────────────────────────────────────────────────────────

describe("scoreAi", () => {
  it("repeatedNoCadenceCount >= 1 adds 3 to score and 1 to hardPromoSignals", () => {
    const counts = makeCounts({ repeatedNoCadenceCount: 1 });
    const { score, hardPromoSignals } = scoreAi(counts, DEFAULT_CFG);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(hardPromoSignals).toBeGreaterThanOrEqual(1);
  });

  it("cadenceHookCount >= 2 adds 3 to score and 1 to hardPromoSignals", () => {
    const baseline = scoreAi(makeCounts({ cadenceHookCount: 1 }), DEFAULT_CFG);
    const triggered = scoreAi(makeCounts({ cadenceHookCount: 2 }), DEFAULT_CFG);
    expect(triggered.score).toBeGreaterThan(baseline.score);
    expect(triggered.score - baseline.score).toBe(3);
    expect(triggered.hardPromoSignals).toBe(baseline.hardPromoSignals + 1);
  });

  it("structuredTimelineCount >= 2 adds 3 to score and 1 to hardPromoSignals", () => {
    const baseline = scoreAi(makeCounts({ structuredTimelineCount: 1 }), DEFAULT_CFG);
    const triggered = scoreAi(makeCounts({ structuredTimelineCount: 2 }), DEFAULT_CFG);
    expect(triggered.score - baseline.score).toBe(3);
    expect(triggered.hardPromoSignals).toBe(baseline.hardPromoSignals + 1);
  });

  it("featureListLeadCount >= 1 + listLikeLineCount >= 3 adds 4 to score", () => {
    const baseline = scoreAi(makeCounts({ listLikeLineCount: 3 }), DEFAULT_CFG);
    const triggered = scoreAi(
      makeCounts({ featureListLeadCount: 1, listLikeLineCount: 3 }),
      DEFAULT_CFG,
    );
    expect(triggered.score - baseline.score).toBe(4);
  });

  it("feedbackRequest + featureListLead + linkFooter combo adds extra 3 to score", () => {
    const partial = scoreAi(
      makeCounts({ feedbackRequestCount: 1, featureListLeadCount: 1, listLikeLineCount: 3 }),
      DEFAULT_CFG,
    );
    const full = scoreAi(
      makeCounts({
        feedbackRequestCount: 1,
        featureListLeadCount: 1,
        listLikeLineCount: 3,
        linkFooterCount: 1,
      }),
      DEFAULT_CFG,
    );
    // Adding linkFooterCount contributes its own points (2) plus the combo bonus (3)
    expect(full.score).toBeGreaterThan(partial.score);
    expect(full.score - partial.score).toBeGreaterThanOrEqual(5);
  });

  it("freeOfferCount adds nothing when filterSelfPromotion is false", () => {
    const without = scoreAi(makeCounts({}), DEFAULT_CFG);
    const with1 = scoreAi(makeCounts({ freeOfferCount: 1 }), DEFAULT_CFG);
    expect(with1.score).toBe(without.score);
    expect(with1.hardPromoSignals).toBe(without.hardPromoSignals);
  });

  it("freeOfferCount >= 1 adds to score and hardPromoSignals when filterSelfPromotion is true", () => {
    const without = scoreAi(makeCounts({}), PROMO_CFG);
    const with1 = scoreAi(makeCounts({ freeOfferCount: 1 }), PROMO_CFG);
    expect(with1.score).toBeGreaterThan(without.score);
    expect(with1.hardPromoSignals).toBeGreaterThan(without.hardPromoSignals);
  });

  it("arrowBulletLineCount >= 3 adds 4 to score", () => {
    const baseline = scoreAi(makeCounts({ arrowBulletLineCount: 2 }), DEFAULT_CFG);
    const triggered = scoreAi(makeCounts({ arrowBulletLineCount: 3 }), DEFAULT_CFG);
    expect(triggered.score - baseline.score).toBe(4);
  });

  it("domainCtaCount >= 1 adds 3 to score", () => {
    const without = scoreAi(makeCounts({}), DEFAULT_CFG);
    const with1 = scoreAi(makeCounts({ domainCtaCount: 1 }), DEFAULT_CFG);
    expect(with1.score - without.score).toBe(3);
  });

  it("noSignupPitchCount >= 1 adds 2 to score", () => {
    const without = scoreAi(makeCounts({}), DEFAULT_CFG);
    const with1 = scoreAi(makeCounts({ noSignupPitchCount: 1 }), DEFAULT_CFG);
    expect(with1.score - without.score).toBe(2);
  });

  it("feedbackRequestCount >= 1 adds 2 to score and 1 to hardPromoSignals", () => {
    const without = scoreAi(makeCounts({}), DEFAULT_CFG);
    const with1 = scoreAi(makeCounts({ feedbackRequestCount: 1 }), DEFAULT_CFG);
    expect(with1.score - without.score).toBe(2);
    expect(with1.hardPromoSignals - without.hardPromoSignals).toBe(1);
  });

  it("returns score 0 and hardPromoSignals 0 for all-zero counts", () => {
    const { score, hardPromoSignals } = scoreAi(makeCounts(), DEFAULT_CFG);
    expect(score).toBe(0);
    expect(hardPromoSignals).toBe(0);
  });
});

// ── scoreHuman ────────────────────────────────────────────────────────────────

describe("scoreHuman", () => {
  it("humanMarkerCount >= 2 gives 1 humanStyleSignal", () => {
    const result = scoreHuman(makeCounts({ humanMarkerCount: 2 }), 0);
    expect(result.humanStyleSignals).toBeGreaterThanOrEqual(1);
  });

  it("humanMarkerCount >= 4 gives at least 2 humanStyleSignals", () => {
    const result = scoreHuman(makeCounts({ humanMarkerCount: 4 }), 0);
    expect(result.humanStyleSignals).toBeGreaterThanOrEqual(2);
  });

  it("lowercaseSentenceStarts >= 3 gives at least 3 humanStyleSignals from that alone", () => {
    const result = scoreHuman(makeCounts({ lowercaseSentenceStarts: 3 }), 0);
    expect(result.humanStyleSignals).toBeGreaterThanOrEqual(3);
  });

  it("questionStyleSignals is capped at 1 regardless of signal count", () => {
    // Many questions all at once
    const result = scoreHuman(
      makeCounts({ questionMarkCount: 10, didYouCount: 5, questionLeadCount: 3, adviceSeekingCount: 2 }),
      0,
    );
    expect(result.questionStyleSignals).toBe(1);
  });

  it("questionStyleSignals is 0 when no question signals present", () => {
    const result = scoreHuman(makeCounts({}), 0);
    expect(result.questionStyleSignals).toBe(0);
  });

  it("humanAdjustment = min(6, signals) when hardPromoSignals <= 1", () => {
    // 10 human style signals, but cap is 6
    const result = scoreHuman(makeCounts({ humanMarkerCount: 20, lowercaseSentenceStarts: 5 }), 0);
    expect(result.humanAdjustment).toBeLessThanOrEqual(6);
  });

  it("humanAdjustment = min(3, signals) when hardPromoSignals >= 2", () => {
    // Many human signals but promo signals are high
    const result = scoreHuman(makeCounts({ humanMarkerCount: 20, lowercaseSentenceStarts: 5 }), 3);
    expect(result.humanAdjustment).toBeLessThanOrEqual(3);
  });

  it("humanAdjustment is lower (more restricted) with hardPromoSignals >= 2 than with 0", () => {
    const counts = makeCounts({ humanMarkerCount: 10, lowercaseSentenceStarts: 3 });
    const low = scoreHuman(counts, 0);
    const high = scoreHuman(counts, 3);
    expect(high.humanAdjustment).toBeLessThanOrEqual(low.humanAdjustment);
  });

  it("questionAdjustment is 0 when hardPromoSignals >= 2", () => {
    const result = scoreHuman(
      makeCounts({ questionMarkCount: 5, didYouCount: 2 }),
      2,
    );
    expect(result.questionAdjustment).toBe(0);
  });

  it("questionAdjustment can be 1 when hardPromoSignals <= 1 and question signals present", () => {
    const result = scoreHuman(makeCounts({ questionMarkCount: 3 }), 0);
    expect(result.questionAdjustment).toBe(1);
  });
});

// ── scoreText integration ─────────────────────────────────────────────────────

describe("scoreText", () => {
  it("plain question-only post scores low (below threshold)", () => {
    const raw =
      "Did you try this? Did you test this? Did you ship this? Any advice? What were your results? How are you acquiring users?";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    expect(result.adjustedScore).toBeLessThan(4);
  });

  it("self-promo with arrow bullets + CTA scores >= 8", () => {
    // repeatedNoCadence(+3) + arrowBullet>=3(+4) + domainCta(+3) + combo(+3) = 13 raw,
    // minus human adjustment (~3) = 10 adjusted
    const raw = [
      "No deep sections. No storytelling. No positioning.",
      "→ Analyze your page for any issues",
      "→ Fix all identified problems",
      "→ Generate a master prompt",
      "→ Apply fixes in one go",
      "Free to try: myapp.io",
      "Check it out and sign up for access.",
    ].join("\n");
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    expect(result.adjustedScore).toBeGreaterThanOrEqual(8);
  });

  it("each custom keyword adds 2 to the score (presence check, not occurrence count)", () => {
    // text.includes(kw) is boolean — +2 per unique keyword regardless of occurrences
    const raw = "This post is about vibe coding and vibes everywhere.";
    const withKeyword = scoreText(normalize(raw), raw, 0, {
      customKeywords: ["vibe"],
      filterSelfPromotion: false,
    });
    const without = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    expect(withKeyword.score - without.score).toBe(2);
  });

  it("filterSelfPromotion: true increases selfPromoBoost for promo content", () => {
    const raw = [
      "Free trial available. Free scan today. Free review — no commitment.",
      "Feedback Request",
      "It has:",
      "Feature one",
      "Feature two",
      "Feature three",
    ].join("\n");
    const without = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    const withPromo = scoreText(normalize(raw), raw, 0, PROMO_CFG);
    expect(withPromo.selfPromoBoost).toBeGreaterThan(without.selfPromoBoost);
  });

  it("adjustedScore is never negative", () => {
    // Text with many human signals but no promo signals should still be >= 0
    const raw =
      "wtf this is so frustrating lol idk why it keeps breaking!! cant believe it tbh smh.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
  });

  it("repeated No-cadence pattern drives score up", () => {
    const raw = "No deep sections. No storytelling. No positioning. Just vibes.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    // repeatedNoCadenceCount fires (+3 score)
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.reasoning).toContain("noCadence=");
  });

  it("DOM list items appear in reasoning string", () => {
    const raw = "Some text about things and features and products and so on.";
    const result = scoreText(normalize(raw), raw, 6, DEFAULT_CFG);
    expect(result.reasoning).toContain("domLi=6");
  });

  it("result contains all expected ScoreResult fields", () => {
    const raw = "Just a plain post with some content.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    expect(typeof result.score).toBe("number");
    expect(typeof result.adjustedScore).toBe("number");
    expect(typeof result.humanStyleSignals).toBe("number");
    expect(typeof result.hardPromoSignals).toBe("number");
    expect(typeof result.questionStyleSignals).toBe("number");
    expect(typeof result.selfPromoBoost).toBe("number");
    expect(typeof result.humanAdjustment).toBe("number");
    expect(typeof result.questionAdjustment).toBe("number");
    expect(typeof result.reasoning).toBe("string");
  });
});

// ── formatLocalReasoning ──────────────────────────────────────────────────────

describe("formatLocalReasoning", () => {
  it("contains the required format labels", () => {
    const raw = "Some post text.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    const formatted = formatLocalReasoning(result);
    expect(formatted).toContain("local(base=");
    expect(formatted).toContain("-human=");
    expect(formatted).toContain("-q=");
    expect(formatted).toContain("+promo=");
  });

  it("includes noCadence= when repeated No-cadence fires", () => {
    const raw = "No deep sections. No storytelling. No positioning.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    const formatted = formatLocalReasoning(result);
    expect(formatted).toContain("noCadence=");
  });

  it("includes domLi= when DOM list items > 0", () => {
    const raw = "A post with some text content here.";
    const result = scoreText(normalize(raw), raw, 3, DEFAULT_CFG);
    const formatted = formatLocalReasoning(result);
    expect(formatted).toContain("domLi=3");
  });

  it("reflects actual score values in the output string", () => {
    const raw = "Plain boring post.";
    const result = scoreText(normalize(raw), raw, 0, DEFAULT_CFG);
    const formatted = formatLocalReasoning(result);
    expect(formatted).toContain(`base=${result.score}`);
    expect(formatted).toContain(`-human=${result.humanAdjustment}`);
    expect(formatted).toContain(`+promo=${result.selfPromoBoost}`);
  });
});
