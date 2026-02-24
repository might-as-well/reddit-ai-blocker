import {
  FIRST_PERSON_MARKERS_REGEX,
  PARALLEL_CADENCE_REGEX,
  CONTRAST_CADENCE_REGEX,
  BULLET_REGEX,
  STRUCTURED_TIMELINE_REGEX,
  CADENCE_HOOK_REGEX,
  STACK_NAMED_REGEX,
} from "./config";

const HUMAN_WRITING_MARKERS_REGEX =
  /\b(fuck|fucked|shit|damn|wtf|ik|idk|idc|dont|doesnt|ive|youre|cant|wont|im|thats|theyre|weve|btw|lol|probs|dm['']?ing|ud|u|hehe)\b/g;

export interface ScoringConfig {
  customKeywords: string[];
  filterSelfPromotion: boolean;
}

export interface ScoreResult {
  score: number;
  adjustedScore: number;
  humanStyleSignals: number;
  hardPromoSignals: number;
  questionStyleSignals: number;
  selfPromoBoost: number;
  humanAdjustment: number;
  questionAdjustment: number;
  reasoning: string;
}

export interface ScoreCounts {
  firstPersonMarkers: number;
  sentenceChunks: string[];
  averageSentenceWords: number;
  shortSentenceCount: number;
  veryShortSentenceCount: number;
  mediumSentenceCount: number;
  shortSentenceRatio: number;
  parallelCadenceCount: number;
  contrastCadenceCount: number;
  bulletCount: number;
  structuredTimelineCount: number;
  cadenceHookCount: number;
  stackNamedCount: number;
  humanMarkerCount: number;
  lowercasePronounICount: number;
  capitalizationsPerSentence: number;
  nonTerminalLines: number;
  lowercaseSentenceStarts: number;
  malformedPunctuationCount: number;
  emphaticExclamationCount: number;
  smushedParenthesisCount: number;
  digitLedNounPhraseCount: number;
  questionMarkCount: number;
  paragraphBreakCount: number;
  adviceSeekingCount: number;
  arrowBulletLineCount: number;
  domainCtaCount: number;
  marketingLabelLineCount: number;
  feedbackRequestCount: number;
  featureListLeadCount: number;
  noSignupPitchCount: number;
  freeOfferCount: number;
  linkFooterCount: number;
  listLikeLineCount: number;
  didYouCount: number;
  questionLeadCount: number;
  repeatedNoCadenceCount: number;
  spacedEmDashCount: number;
  terminalLineRatio: number;
  effectiveBulletCount: number;
  domListItemCount: number;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

function countNonTerminalLines(rawText: string): number {
  const lines = rawText
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length >= 20);
  return lines.filter((value) => !/[.!?:]$/.test(value)).length;
}

export function performCounts(
  text: string,
  rawText: string,
  domListItemCount: number,
): ScoreCounts {
  const firstPersonMarkers = countMatches(text, FIRST_PERSON_MARKERS_REGEX);
  const sentenceChunks = text
    .split(/[.!?]\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const sentenceWordCounts = sentenceChunks.map(
    (value) => value.split(/\s+/).length,
  );
  const averageSentenceWords =
    sentenceWordCounts.length > 0
      ? sentenceWordCounts.reduce((total, value) => total + value, 0) /
        sentenceWordCounts.length
      : 0;
  const shortSentenceCount = sentenceChunks.filter(
    (value) => value.split(/\s+/).length <= 12,
  ).length;
  const veryShortSentenceCount = sentenceChunks.filter(
    (value) => value.split(/\s+/).length <= 6,
  ).length;
  const mediumSentenceCount = sentenceChunks.filter((value) => {
    const words = value.split(/\s+/).length;
    return words >= 13 && words <= 28;
  }).length;
  const shortSentenceRatio =
    sentenceChunks.length > 0 ? shortSentenceCount / sentenceChunks.length : 0;
  const parallelCadenceCount = countMatches(text, PARALLEL_CADENCE_REGEX);
  const contrastCadenceCount = countMatches(text, CONTRAST_CADENCE_REGEX);
  const bulletCount = countMatches(text, BULLET_REGEX);
  const structuredTimelineCount = countMatches(text, STRUCTURED_TIMELINE_REGEX);
  const cadenceHookCount = countMatches(text, CADENCE_HOOK_REGEX);
  const stackNamedCount = countMatches(text, STACK_NAMED_REGEX);
  const humanMarkerCount = countMatches(text, HUMAN_WRITING_MARKERS_REGEX);
  const lowercasePronounICount =
    (rawText.match(/(?:^|[\s(])i(?=[\s.,!?']|$)/g) || []).length;
  const sentenceCount = Math.max(1, sentenceChunks.length);
  const capitalizedWordCount = (rawText.match(/\b[A-Z][a-z]/g) || []).length;
  const capitalizationsPerSentence = capitalizedWordCount / sentenceCount;
  const nonTerminalLines = countNonTerminalLines(rawText);
  const lowercaseSentenceStarts =
    (rawText.match(/(?:^|[.!?]\s+)[a-z][a-z]/g) || []).length;
  const malformedPunctuationCount =
    (rawText.match(/(?:\.\?|\?\.|!\?|\?!|,{2,}|[.!?]{3,})/g) || []).length;
  const emphaticExclamationCount = (rawText.match(/!!+/g) || []).length;
  const smushedParenthesisCount =
    (rawText.match(/\w\([^)\s][^)]*\)/g) || []).length;
  const digitLedNounPhraseCount =
    (rawText.match(/\b\d+\s+(of|people|devs|developers|years|months)\b/gi) || []).length;
  const questionMarkCount = (rawText.match(/\?/g) || []).length;
  const paragraphBreakCount = (rawText.match(/\n\s*\n/g) || []).length;
  const adviceSeekingCount = countMatches(
    text,
    /\b(what .* easiest|what do you (all|guys) think|how do you (all|guys)|any suggestions|feeling overwhelmed|just starting to scale|would love .* advice|thank you for (any )?suggestions)\b/g,
  );
  const arrowBulletLineCount = rawText
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => /^→\s+/.test(value)).length;
  const domainCtaCount = countMatches(
    text,
    /\b(free to try|try now|get started|sign up|join waitlist|get access)\s*:?\s*[a-z0-9.-]+\.[a-z]{2,}\b/g,
  );
  const marketingLabelLineCount = rawText
    .split("\n")
    .map((value) => value.trim())
    .filter(
      (value) =>
        /^[A-Za-z0-9\s/+&-]{4,36}$/.test(value) &&
        !/[.!?:]$/.test(value) &&
        /\b(saas|ai|project|manager|b2b|b2c)\b/i.test(value),
    ).length;
  const feedbackRequestCount = countMatches(
    text,
    /\b(feedback request|would love feedback|appreciate any feedback)\b/g,
  );
  const featureListLeadCount = countMatches(
    text,
    /\b(it has:|features?:|what it does:)\b/g,
  );
  const noSignupPitchCount = countMatches(
    text,
    /\b(free and no sign ?up|no sign ?up required|without accounts? or setup)\b/g,
  );
  const freeOfferCount = countMatches(
    text,
    /\b(free\b|for free|free scan|free audit|free review|free trial|happy to run a free)\b/g,
  );
  const linkFooterCount = (rawText.match(/\blink:\s*\S+/gi) || []).length;
  const listLikeLineCount = rawText
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter(
      (value) =>
        /^[A-Za-z][A-Za-z0-9\s,&+\-]{6,80}$/.test(value) &&
        !/[.!?:]$/.test(value),
    ).length;
  const didYouCount = countMatches(text, /\bdid you\b/g);
  const questionLeadCount = countMatches(
    text,
    /\b(any advice|what were|how .* acquiring|if content)\b/g,
  );
  const repeatedNoCadenceCount = countMatches(
    text,
    /\bno\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]/g,
  );
  const spacedEmDashCount = (rawText.match(/\s—\s/g) || []).length;
  const substantialLines = rawText
    .split("\n")
    .map((value) => value.trim())
    .filter((value) => value.length >= 20);
  const terminalLineCount = substantialLines.filter((value) => /[.!?:]$/.test(value)).length;
  const terminalLineRatio =
    substantialLines.length > 0 ? terminalLineCount / substantialLines.length : 0;
  const effectiveBulletCount = Math.max(bulletCount, domListItemCount);

  return {
    firstPersonMarkers,
    sentenceChunks,
    averageSentenceWords,
    shortSentenceCount,
    veryShortSentenceCount,
    mediumSentenceCount,
    shortSentenceRatio,
    parallelCadenceCount,
    contrastCadenceCount,
    bulletCount,
    structuredTimelineCount,
    cadenceHookCount,
    stackNamedCount,
    humanMarkerCount,
    lowercasePronounICount,
    capitalizationsPerSentence,
    nonTerminalLines,
    lowercaseSentenceStarts,
    malformedPunctuationCount,
    emphaticExclamationCount,
    smushedParenthesisCount,
    digitLedNounPhraseCount,
    questionMarkCount,
    paragraphBreakCount,
    adviceSeekingCount,
    arrowBulletLineCount,
    domainCtaCount,
    marketingLabelLineCount,
    feedbackRequestCount,
    featureListLeadCount,
    noSignupPitchCount,
    freeOfferCount,
    linkFooterCount,
    listLikeLineCount,
    didYouCount,
    questionLeadCount,
    repeatedNoCadenceCount,
    spacedEmDashCount,
    terminalLineRatio,
    effectiveBulletCount,
    domListItemCount,
  };
}

export function scoreAi(
  counts: ScoreCounts,
  cfg: ScoringConfig,
): { score: number; hardPromoSignals: number } {
  let score = 0;

  if (counts.firstPersonMarkers >= 10) score += 2;
  if (
    counts.sentenceChunks.length >= 9 &&
    counts.shortSentenceCount >= 4 &&
    counts.mediumSentenceCount >= 3
  ) {
    score += 1;
  }
  if (counts.sentenceChunks.length >= 8 && counts.shortSentenceRatio >= 0.68) score += 1;
  if (counts.veryShortSentenceCount >= 2 && counts.shortSentenceCount >= 5) score += 1;
  if (
    counts.sentenceChunks.length >= 10 &&
    counts.averageSentenceWords >= 6 &&
    counts.averageSentenceWords <= 16
  ) {
    score += 2;
  }
  if (counts.parallelCadenceCount >= 1) score += 3;
  if (counts.contrastCadenceCount >= 2) score += 2;
  if (counts.repeatedNoCadenceCount >= 1) score += 3;
  if (counts.spacedEmDashCount >= 2) score += 2;
  if (counts.structuredTimelineCount >= 2) score += 3;
  if (counts.cadenceHookCount >= 2) score += 3;
  if (counts.effectiveBulletCount >= 4 && counts.stackNamedCount >= 3) score += 3;
  if (counts.effectiveBulletCount >= 3 && counts.shortSentenceCount >= 6) score += 1;

  if (
    counts.effectiveBulletCount >= 6 &&
    counts.shortSentenceCount >= 8 &&
    counts.capitalizationsPerSentence >= 0.9 &&
    counts.terminalLineRatio >= 0.65 &&
    counts.malformedPunctuationCount === 0 &&
    counts.lowercaseSentenceStarts === 0
  ) {
    score += 2;
  }

  if (counts.arrowBulletLineCount >= 3) score += 4;
  if (counts.domainCtaCount >= 1) score += 3;
  if (counts.arrowBulletLineCount >= 3 && counts.domainCtaCount >= 1) score += 3;
  if (counts.marketingLabelLineCount >= 2) score += 2;
  if (counts.featureListLeadCount >= 1 && counts.listLikeLineCount >= 3) score += 4;
  if (counts.feedbackRequestCount >= 1) score += 2;
  if (counts.noSignupPitchCount >= 1) score += 2;
  if (cfg.filterSelfPromotion && counts.freeOfferCount >= 1) score += 3;
  if (cfg.filterSelfPromotion && counts.freeOfferCount >= 2) score += 2;
  if (counts.linkFooterCount >= 1) score += 2;
  if (
    counts.feedbackRequestCount >= 1 &&
    counts.featureListLeadCount >= 1 &&
    counts.linkFooterCount >= 1
  ) {
    score += 3;
  }

  let hardPromoSignals = 0;
  if (counts.cadenceHookCount >= 2) hardPromoSignals += 1;
  if (counts.repeatedNoCadenceCount >= 1) hardPromoSignals += 1;
  if (counts.spacedEmDashCount >= 2) hardPromoSignals += 1;
  if (counts.structuredTimelineCount >= 2) hardPromoSignals += 1;
  if (counts.stackNamedCount >= 3 && counts.effectiveBulletCount >= 4) hardPromoSignals += 1;
  if (counts.sentenceChunks.length >= 8 && counts.shortSentenceRatio >= 0.7) hardPromoSignals += 1;
  if (counts.feedbackRequestCount >= 1) hardPromoSignals += 1;
  if (counts.featureListLeadCount >= 1 && counts.listLikeLineCount >= 3) hardPromoSignals += 1;
  if (counts.linkFooterCount >= 1) hardPromoSignals += 1;
  if (counts.arrowBulletLineCount >= 3) hardPromoSignals += 1;
  if (counts.domainCtaCount >= 1) hardPromoSignals += 1;
  if (counts.marketingLabelLineCount >= 2) hardPromoSignals += 1;
  if (cfg.filterSelfPromotion && counts.freeOfferCount >= 1) hardPromoSignals += 1;
  if (counts.domListItemCount >= 4 && counts.shortSentenceCount >= 5) hardPromoSignals += 1;
  if (
    counts.effectiveBulletCount >= 6 &&
    counts.shortSentenceCount >= 8 &&
    counts.capitalizationsPerSentence >= 0.9 &&
    counts.terminalLineRatio >= 0.65 &&
    counts.malformedPunctuationCount === 0 &&
    counts.lowercaseSentenceStarts === 0
  ) {
    hardPromoSignals += 1;
  }

  return { score, hardPromoSignals };
}

export function scoreHuman(
  counts: ScoreCounts,
  hardPromoSignals: number,
): {
  humanStyleSignals: number;
  questionStyleSignals: number;
  humanAdjustment: number;
  questionAdjustment: number;
} {
  let humanStyleSignals = 0;
  if (counts.humanMarkerCount >= 2) humanStyleSignals += 1;
  if (counts.humanMarkerCount >= 4) humanStyleSignals += 1;
  if (counts.nonTerminalLines >= 3 && counts.domListItemCount < 3) humanStyleSignals += 1;
  if (counts.lowercaseSentenceStarts >= 1) humanStyleSignals += 1;
  if (counts.lowercaseSentenceStarts >= 2) humanStyleSignals += 1;
  if (counts.lowercaseSentenceStarts >= 3) humanStyleSignals += 1;
  if (counts.malformedPunctuationCount >= 1) humanStyleSignals += 1;
  if (counts.emphaticExclamationCount >= 1) humanStyleSignals += 1;
  if (counts.smushedParenthesisCount >= 1) humanStyleSignals += 1;
  if (counts.digitLedNounPhraseCount >= 1) humanStyleSignals += 1;
  if (counts.lowercasePronounICount >= 2) humanStyleSignals += 1;
  if (counts.capitalizationsPerSentence <= 0.6) humanStyleSignals += 1;
  if (counts.capitalizationsPerSentence <= 0.3) humanStyleSignals += 1;
  if (counts.sentenceChunks.length >= 8 && counts.paragraphBreakCount === 0) humanStyleSignals += 2;
  if (counts.sentenceChunks.length >= 5 && counts.paragraphBreakCount <= 1) humanStyleSignals += 1;

  let questionStyleSignals = 0;
  if (
    counts.questionMarkCount >= 2 ||
    counts.didYouCount >= 1 ||
    counts.questionLeadCount >= 1 ||
    counts.adviceSeekingCount >= 1
  ) {
    questionStyleSignals = 1;
  }

  const humanAdjustment =
    hardPromoSignals <= 1 ? Math.min(6, humanStyleSignals) : Math.min(3, humanStyleSignals);
  const questionAdjustment = hardPromoSignals <= 1 ? Math.min(1, questionStyleSignals) : 0;

  return {
    humanStyleSignals,
    questionStyleSignals,
    humanAdjustment,
    questionAdjustment,
  };
}

export function scoreText(
  text: string,
  rawText: string,
  domListItemCount: number,
  cfg: ScoringConfig,
): ScoreResult {
  let score = 0;
  for (const kw of cfg.customKeywords) {
    if (kw && text.includes(kw)) score += 2;
  }

  const counts = performCounts(text, rawText, domListItemCount);
  const ai = scoreAi(counts, cfg);
  score += ai.score;
  const human = scoreHuman(counts, ai.hardPromoSignals);

  const selfPromoBoost = cfg.filterSelfPromotion
    ? Math.min(
        10,
        ai.hardPromoSignals * 2 +
          (counts.domainCtaCount >= 1 ? 2 : 0) +
          (counts.arrowBulletLineCount >= 3 ? 2 : 0) +
          (counts.feedbackRequestCount >= 1 ? 1 : 0) +
          (counts.freeOfferCount >= 1 ? 2 : 0),
      )
    : 0;

  const adjustedScore = Math.max(
    0,
    score + selfPromoBoost - human.humanAdjustment - human.questionAdjustment,
  );

  const reasoningParts: string[] = [];
  if (counts.effectiveBulletCount >= 3) reasoningParts.push(`bullets=${counts.effectiveBulletCount}`);
  if (counts.domListItemCount >= 1) reasoningParts.push(`domLi=${counts.domListItemCount}`);
  if (counts.shortSentenceRatio >= 0.6) reasoningParts.push(`shortRatio=${counts.shortSentenceRatio.toFixed(2)}`);
  if (counts.terminalLineRatio >= 0.6) reasoningParts.push(`terminalRatio=${counts.terminalLineRatio.toFixed(2)}`);
  if (counts.feedbackRequestCount >= 1) reasoningParts.push("feedback-ask");
  if (counts.domainCtaCount >= 1 || counts.linkFooterCount >= 1) reasoningParts.push("cta/link");
  if (counts.structuredTimelineCount >= 1) reasoningParts.push(`timeline=${counts.structuredTimelineCount}`);
  if (counts.cadenceHookCount >= 1) reasoningParts.push(`cadenceHooks=${counts.cadenceHookCount}`);
  if (counts.repeatedNoCadenceCount >= 1) reasoningParts.push(`noCadence=${counts.repeatedNoCadenceCount}`);
  if (counts.spacedEmDashCount >= 1) reasoningParts.push(`emDash=${counts.spacedEmDashCount}`);
  if (ai.hardPromoSignals >= 1) reasoningParts.push(`promoSignals=${ai.hardPromoSignals}`);
  if (human.humanStyleSignals >= 1) reasoningParts.push(`humanSignals=${human.humanStyleSignals}`);
  if (human.questionStyleSignals >= 1) reasoningParts.push(`questionSignals=${human.questionStyleSignals}`);

  return {
    score,
    adjustedScore,
    humanStyleSignals: human.humanStyleSignals,
    hardPromoSignals: ai.hardPromoSignals,
    questionStyleSignals: human.questionStyleSignals,
    selfPromoBoost,
    humanAdjustment: human.humanAdjustment,
    questionAdjustment: human.questionAdjustment,
    reasoning: reasoningParts.join(", ") || "no strong signals",
  };
}

export function formatLocalReasoning(result: ScoreResult): string {
  return `local(base=${result.score}; -human=${result.humanAdjustment}; -q=${result.questionAdjustment}; +promo=${result.selfPromoBoost}) ${result.reasoning}`;
}
