"use strict";
(() => {
  // src/content/scoring/config.ts
  var DEFAULTS = {
    enabled: true,
    threshold: 8,
    customKeywords: [],
    filterSelfPromotion: false,
    llmEnabled: false
  };
  var LLM_LOW_DELTA = 3;
  var LLM_HIGH_DELTA = 4;
  var STRONG_LOCAL_MARGIN = 5;
  var DEFAULTS_RECORD = { ...DEFAULTS };
  var FIRST_PERSON_MARKERS_REGEX = /\b(i|my|me)\b/g;
  var PARALLEL_CADENCE_REGEX = /\bwe\s+[a-z]+(?:ed|ing)?\s+while\s+they\s+[a-z]+(?:ed|ing)?\b/g;
  var CONTRAST_CADENCE_REGEX = /\b(instead of|meanwhile|ironically|the difference was|what surprised me most)\b/g;
  var BULLET_REGEX = /[•▪◦]\s/g;
  var STRUCTURED_TIMELINE_REGEX = /\bweek\s*\d+\s*:/g;
  var CADENCE_HOOK_REGEX = /\b(most [a-z\s]+ don['']t|they lack|outcome:|what this looks like in practice)\b/g;
  var STACK_NAMED_REGEX = /\b(python|flask|supabase|firebase|api|backend|pipeline)\b/g;

  // src/content/utils.ts
  function toKeywordList(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item).toLowerCase());
  }
  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function hashText(input) {
    const text = String(input || "");
    let hash = 5381;
    for (let i2 = 0; i2 < text.length; i2 += 1) {
      hash = hash * 33 ^ text.charCodeAt(i2);
    }
    return (hash >>> 0).toString(36);
  }
  function getPermalinkPostIdFromPath() {
    const match = window.location.pathname.match(/\/comments\/([a-z0-9]+)\b/i);
    if (!match?.[1]) return null;
    return `t3_${match[1].toLowerCase()}`;
  }
  function getElementPostId(postEl) {
    const htmlPost = postEl;
    const candidates = [
      htmlPost.dataset.postId,
      htmlPost.getAttribute("post-id"),
      htmlPost.getAttribute("id"),
      htmlPost.getAttribute("data-fullname")
    ];
    const raw = candidates.find(
      (value) => typeof value === "string" && value.length > 0
    );
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized.startsWith("t3_")) return normalized;
    return null;
  }
  function isPrimaryPermalinkPost(postEl) {
    const permalinkPostId = getPermalinkPostIdFromPath();
    if (!permalinkPostId) return false;
    const elementPostId = getElementPostId(postEl);
    return elementPostId === permalinkPostId;
  }
  function getPostText(postEl) {
    const title = postEl.querySelector("h1, h2, h3, [slot='title']")?.textContent || "";
    const body = postEl.textContent || "";
    const richBody = postEl.innerText || body;
    const raw = `${title}
${richBody}`.trim();
    return { raw, normalized: normalize(raw) };
  }
  function countDomListItems(postEl) {
    return postEl.querySelectorAll("ul li, ol li").length;
  }

  // src/content/scoring/scorer.ts
  var HUMAN_WRITING_MARKERS_REGEX = /\b(fuck|fucked|shit|damn|wtf|ik|idk|idc|dont|doesnt|ive|youre|cant|wont|im|thats|theyre|weve|btw|lol|probs|dm['']?ing|ud|u|hehe)\b/g;
  function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
  }
  function countNonTerminalLines(rawText) {
    const lines = rawText.split("\n").map((value) => value.trim()).filter((value) => value.length >= 20);
    return lines.filter((value) => !/[.!?:]$/.test(value)).length;
  }
  function performCounts(text, rawText, domListItemCount) {
    const firstPersonMarkers = countMatches(text, FIRST_PERSON_MARKERS_REGEX);
    const sentenceChunks = text.split(/[.!?]\s+/).map((value) => value.trim()).filter(Boolean);
    const sentenceWordCounts = sentenceChunks.map(
      (value) => value.split(/\s+/).length
    );
    const averageSentenceWords = sentenceWordCounts.length > 0 ? sentenceWordCounts.reduce((total, value) => total + value, 0) / sentenceWordCounts.length : 0;
    const shortSentenceCount = sentenceChunks.filter(
      (value) => value.split(/\s+/).length <= 12
    ).length;
    const veryShortSentenceCount = sentenceChunks.filter(
      (value) => value.split(/\s+/).length <= 6
    ).length;
    const mediumSentenceCount = sentenceChunks.filter((value) => {
      const words = value.split(/\s+/).length;
      return words >= 13 && words <= 28;
    }).length;
    const shortSentenceRatio = sentenceChunks.length > 0 ? shortSentenceCount / sentenceChunks.length : 0;
    const parallelCadenceCount = countMatches(text, PARALLEL_CADENCE_REGEX);
    const contrastCadenceCount = countMatches(text, CONTRAST_CADENCE_REGEX);
    const bulletCount = countMatches(text, BULLET_REGEX);
    const structuredTimelineCount = countMatches(text, STRUCTURED_TIMELINE_REGEX);
    const cadenceHookCount = countMatches(text, CADENCE_HOOK_REGEX);
    const stackNamedCount = countMatches(text, STACK_NAMED_REGEX);
    const humanMarkerCount = countMatches(text, HUMAN_WRITING_MARKERS_REGEX);
    const lowercasePronounICount = (rawText.match(/(?:^|[\s(])i(?=[\s.,!?']|$)/g) || []).length;
    const sentenceCount = Math.max(1, sentenceChunks.length);
    const capitalizedWordCount = (rawText.match(/\b[A-Z][a-z]/g) || []).length;
    const capitalizationsPerSentence = capitalizedWordCount / sentenceCount;
    const nonTerminalLines = countNonTerminalLines(rawText);
    const lowercaseSentenceStarts = (rawText.match(/(?:^|[.!?]\s+)[a-z][a-z]/g) || []).length;
    const malformedPunctuationCount = (rawText.match(/(?:\.\?|\?\.|!\?|\?!|,{2,}|[.!?]{3,})/g) || []).length;
    const emphaticExclamationCount = (rawText.match(/!!+/g) || []).length;
    const smushedParenthesisCount = (rawText.match(/\w\([^)\s][^)]*\)/g) || []).length;
    const digitLedNounPhraseCount = (rawText.match(/\b\d+\s+(of|people|devs|developers|years|months)\b/gi) || []).length;
    const questionMarkCount = (rawText.match(/\?/g) || []).length;
    const paragraphBreakCount = (rawText.match(/\n\s*\n/g) || []).length;
    const adviceSeekingCount = countMatches(
      text,
      /\b(what .* easiest|what do you (all|guys) think|how do you (all|guys)|any suggestions|feeling overwhelmed|just starting to scale|would love .* advice|thank you for (any )?suggestions)\b/g
    );
    const arrowBulletLineCount = rawText.split("\n").map((value) => value.trim()).filter((value) => /^→\s+/.test(value)).length;
    const domainCtaCount = countMatches(
      text,
      /\b(free to try|try now|get started|sign up|join waitlist|get access)\s*:?\s*[a-z0-9.-]+\.[a-z]{2,}\b/g
    );
    const marketingLabelLineCount = rawText.split("\n").map((value) => value.trim()).filter(
      (value) => /^[A-Za-z0-9\s/+&-]{4,36}$/.test(value) && !/[.!?:]$/.test(value) && /\b(saas|ai|project|manager|b2b|b2c)\b/i.test(value)
    ).length;
    const feedbackRequestCount = countMatches(
      text,
      /\b(feedback request|would love feedback|appreciate any feedback)\b/g
    );
    const featureListLeadCount = countMatches(
      text,
      /\b(it has:|features?:|what it does:)\b/g
    );
    const noSignupPitchCount = countMatches(
      text,
      /\b(free and no sign ?up|no sign ?up required|without accounts? or setup)\b/g
    );
    const freeOfferCount = countMatches(
      text,
      /\b(free\b|for free|free scan|free audit|free review|free trial|happy to run a free)\b/g
    );
    const linkFooterCount = (rawText.match(/\blink:\s*\S+/gi) || []).length;
    const listLikeLineCount = rawText.split("\n").map((value) => value.trim()).filter((value) => value.length > 0).filter(
      (value) => /^[A-Za-z][A-Za-z0-9\s,&+\-]{6,80}$/.test(value) && !/[.!?:]$/.test(value)
    ).length;
    const didYouCount = countMatches(text, /\bdid you\b/g);
    const questionLeadCount = countMatches(
      text,
      /\b(any advice|what were|how .* acquiring|if content)\b/g
    );
    const repeatedNoCadenceCount = countMatches(
      text,
      /\bno\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]/g
    );
    const spacedEmDashCount = (rawText.match(/\s—\s/g) || []).length;
    const substantialLines = rawText.split("\n").map((value) => value.trim()).filter((value) => value.length >= 20);
    const terminalLineCount = substantialLines.filter((value) => /[.!?:]$/.test(value)).length;
    const terminalLineRatio = substantialLines.length > 0 ? terminalLineCount / substantialLines.length : 0;
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
      domListItemCount
    };
  }
  function scoreAi(counts, cfg) {
    let score = 0;
    if (counts.firstPersonMarkers >= 10) score += 2;
    if (counts.sentenceChunks.length >= 9 && counts.shortSentenceCount >= 4 && counts.mediumSentenceCount >= 3) {
      score += 1;
    }
    if (counts.sentenceChunks.length >= 8 && counts.shortSentenceRatio >= 0.68) score += 1;
    if (counts.veryShortSentenceCount >= 2 && counts.shortSentenceCount >= 5) score += 1;
    if (counts.sentenceChunks.length >= 10 && counts.averageSentenceWords >= 6 && counts.averageSentenceWords <= 16) {
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
    if (counts.effectiveBulletCount >= 6 && counts.shortSentenceCount >= 8 && counts.capitalizationsPerSentence >= 0.9 && counts.terminalLineRatio >= 0.65 && counts.malformedPunctuationCount === 0 && counts.lowercaseSentenceStarts === 0) {
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
    if (counts.feedbackRequestCount >= 1 && counts.featureListLeadCount >= 1 && counts.linkFooterCount >= 1) {
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
    if (counts.effectiveBulletCount >= 6 && counts.shortSentenceCount >= 8 && counts.capitalizationsPerSentence >= 0.9 && counts.terminalLineRatio >= 0.65 && counts.malformedPunctuationCount === 0 && counts.lowercaseSentenceStarts === 0) {
      hardPromoSignals += 1;
    }
    return { score, hardPromoSignals };
  }
  function scoreHuman(counts, hardPromoSignals) {
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
    if (counts.questionMarkCount >= 2 || counts.didYouCount >= 1 || counts.questionLeadCount >= 1 || counts.adviceSeekingCount >= 1) {
      questionStyleSignals = 1;
    }
    const humanAdjustment = hardPromoSignals <= 1 ? Math.min(6, humanStyleSignals) : Math.min(3, humanStyleSignals);
    const questionAdjustment = hardPromoSignals <= 1 ? Math.min(1, questionStyleSignals) : 0;
    return {
      humanStyleSignals,
      questionStyleSignals,
      humanAdjustment,
      questionAdjustment
    };
  }
  function scoreText(text, rawText, domListItemCount, cfg) {
    let score = 0;
    for (const kw of cfg.customKeywords) {
      if (kw && text.includes(kw)) score += 2;
    }
    const counts = performCounts(text, rawText, domListItemCount);
    const ai = scoreAi(counts, cfg);
    score += ai.score;
    const human = scoreHuman(counts, ai.hardPromoSignals);
    const selfPromoBoost = cfg.filterSelfPromotion ? Math.min(
      10,
      ai.hardPromoSignals * 2 + (counts.domainCtaCount >= 1 ? 2 : 0) + (counts.arrowBulletLineCount >= 3 ? 2 : 0) + (counts.feedbackRequestCount >= 1 ? 1 : 0) + (counts.freeOfferCount >= 1 ? 2 : 0)
    ) : 0;
    const adjustedScore = Math.max(
      0,
      score + selfPromoBoost - human.humanAdjustment - human.questionAdjustment
    );
    const reasoningParts = [];
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
      reasoning: reasoningParts.join(", ") || "no strong signals"
    };
  }
  function formatLocalReasoning(result) {
    return `local(base=${result.score}; -human=${result.humanAdjustment}; -q=${result.questionAdjustment}; +promo=${result.selfPromoBoost}) ${result.reasoning}`;
  }

  // src/content/runtime.ts
  function isContextInvalidatedError(error) {
    return String(error?.message || error).includes(
      "Extension context invalidated"
    );
  }
  async function safeSendRuntimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (isContextInvalidatedError(error)) return null;
      throw error;
    }
  }

  // node_modules/preact/dist/preact.module.js
  var n;
  var l;
  var u;
  var t;
  var i;
  var r;
  var o;
  var e;
  var f;
  var c;
  var s;
  var a;
  var h;
  var p = {};
  var v = [];
  var y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  var d = Array.isArray;
  function w(n2, l2) {
    for (var u2 in l2) n2[u2] = l2[u2];
    return n2;
  }
  function g(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function _(l2, u2, t2) {
    var i2, r2, o2, e2 = {};
    for (o2 in u2) "key" == o2 ? i2 = u2[o2] : "ref" == o2 ? r2 = u2[o2] : e2[o2] = u2[o2];
    if (arguments.length > 2 && (e2.children = arguments.length > 3 ? n.call(arguments, 2) : t2), "function" == typeof l2 && null != l2.defaultProps) for (o2 in l2.defaultProps) void 0 === e2[o2] && (e2[o2] = l2.defaultProps[o2]);
    return m(l2, e2, i2, r2, null);
  }
  function m(n2, t2, i2, r2, o2) {
    var e2 = { type: n2, props: t2, key: i2, ref: r2, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o2 ? ++u : o2, __i: -1, __u: 0 };
    return null == o2 && null != l.vnode && l.vnode(e2), e2;
  }
  function k(n2) {
    return n2.children;
  }
  function x(n2, l2) {
    this.props = n2, this.context = l2;
  }
  function S(n2, l2) {
    if (null == l2) return n2.__ ? S(n2.__, n2.__i + 1) : null;
    for (var u2; l2 < n2.__k.length; l2++) if (null != (u2 = n2.__k[l2]) && null != u2.__e) return u2.__e;
    return "function" == typeof n2.type ? S(n2) : null;
  }
  function C(n2) {
    if (n2.__P && n2.__d) {
      var u2 = n2.__v, t2 = u2.__e, i2 = [], r2 = [], o2 = w({}, u2);
      o2.__v = u2.__v + 1, l.vnode && l.vnode(o2), z(n2.__P, o2, u2, n2.__n, n2.__P.namespaceURI, 32 & u2.__u ? [t2] : null, i2, null == t2 ? S(u2) : t2, !!(32 & u2.__u), r2), o2.__v = u2.__v, o2.__.__k[o2.__i] = o2, V(i2, o2, r2), u2.__e = u2.__ = null, o2.__e != t2 && M(o2);
    }
  }
  function M(n2) {
    if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l2) {
      if (null != l2 && null != l2.__e) return n2.__e = n2.__c.base = l2.__e;
    }), M(n2);
  }
  function $(n2) {
    (!n2.__d && (n2.__d = true) && i.push(n2) && !I.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(I);
  }
  function I() {
    for (var n2, l2 = 1; i.length; ) i.length > l2 && i.sort(e), n2 = i.shift(), l2 = i.length, C(n2);
    I.__r = 0;
  }
  function P(n2, l2, u2, t2, i2, r2, o2, e2, f2, c2, s2) {
    var a2, h2, y2, d2, w2, g2, _2, m2 = t2 && t2.__k || v, b = l2.length;
    for (f2 = A(u2, l2, m2, f2, b), a2 = 0; a2 < b; a2++) null != (y2 = u2.__k[a2]) && (h2 = -1 != y2.__i && m2[y2.__i] || p, y2.__i = a2, g2 = z(n2, y2, h2, i2, r2, o2, e2, f2, c2, s2), d2 = y2.__e, y2.ref && h2.ref != y2.ref && (h2.ref && D(h2.ref, null, y2), s2.push(y2.ref, y2.__c || d2, y2)), null == w2 && null != d2 && (w2 = d2), (_2 = !!(4 & y2.__u)) || h2.__k === y2.__k ? f2 = H(y2, f2, n2, _2) : "function" == typeof y2.type && void 0 !== g2 ? f2 = g2 : d2 && (f2 = d2.nextSibling), y2.__u &= -7);
    return u2.__e = w2, f2;
  }
  function A(n2, l2, u2, t2, i2) {
    var r2, o2, e2, f2, c2, s2 = u2.length, a2 = s2, h2 = 0;
    for (n2.__k = new Array(i2), r2 = 0; r2 < i2; r2++) null != (o2 = l2[r2]) && "boolean" != typeof o2 && "function" != typeof o2 ? ("string" == typeof o2 || "number" == typeof o2 || "bigint" == typeof o2 || o2.constructor == String ? o2 = n2.__k[r2] = m(null, o2, null, null, null) : d(o2) ? o2 = n2.__k[r2] = m(k, { children: o2 }, null, null, null) : void 0 === o2.constructor && o2.__b > 0 ? o2 = n2.__k[r2] = m(o2.type, o2.props, o2.key, o2.ref ? o2.ref : null, o2.__v) : n2.__k[r2] = o2, f2 = r2 + h2, o2.__ = n2, o2.__b = n2.__b + 1, e2 = null, -1 != (c2 = o2.__i = T(o2, u2, f2, a2)) && (a2--, (e2 = u2[c2]) && (e2.__u |= 2)), null == e2 || null == e2.__v ? (-1 == c2 && (i2 > s2 ? h2-- : i2 < s2 && h2++), "function" != typeof o2.type && (o2.__u |= 4)) : c2 != f2 && (c2 == f2 - 1 ? h2-- : c2 == f2 + 1 ? h2++ : (c2 > f2 ? h2-- : h2++, o2.__u |= 4))) : n2.__k[r2] = null;
    if (a2) for (r2 = 0; r2 < s2; r2++) null != (e2 = u2[r2]) && 0 == (2 & e2.__u) && (e2.__e == t2 && (t2 = S(e2)), E(e2, e2));
    return t2;
  }
  function H(n2, l2, u2, t2) {
    var i2, r2;
    if ("function" == typeof n2.type) {
      for (i2 = n2.__k, r2 = 0; i2 && r2 < i2.length; r2++) i2[r2] && (i2[r2].__ = n2, l2 = H(i2[r2], l2, u2, t2));
      return l2;
    }
    n2.__e != l2 && (t2 && (l2 && n2.type && !l2.parentNode && (l2 = S(n2)), u2.insertBefore(n2.__e, l2 || null)), l2 = n2.__e);
    do {
      l2 = l2 && l2.nextSibling;
    } while (null != l2 && 8 == l2.nodeType);
    return l2;
  }
  function T(n2, l2, u2, t2) {
    var i2, r2, o2, e2 = n2.key, f2 = n2.type, c2 = l2[u2], s2 = null != c2 && 0 == (2 & c2.__u);
    if (null === c2 && null == e2 || s2 && e2 == c2.key && f2 == c2.type) return u2;
    if (t2 > (s2 ? 1 : 0)) {
      for (i2 = u2 - 1, r2 = u2 + 1; i2 >= 0 || r2 < l2.length; ) if (null != (c2 = l2[o2 = i2 >= 0 ? i2-- : r2++]) && 0 == (2 & c2.__u) && e2 == c2.key && f2 == c2.type) return o2;
    }
    return -1;
  }
  function j(n2, l2, u2) {
    "-" == l2[0] ? n2.setProperty(l2, null == u2 ? "" : u2) : n2[l2] = null == u2 ? "" : "number" != typeof u2 || y.test(l2) ? u2 : u2 + "px";
  }
  function F(n2, l2, u2, t2, i2) {
    var r2, o2;
    n: if ("style" == l2) if ("string" == typeof u2) n2.style.cssText = u2;
    else {
      if ("string" == typeof t2 && (n2.style.cssText = t2 = ""), t2) for (l2 in t2) u2 && l2 in u2 || j(n2.style, l2, "");
      if (u2) for (l2 in u2) t2 && u2[l2] == t2[l2] || j(n2.style, l2, u2[l2]);
    }
    else if ("o" == l2[0] && "n" == l2[1]) r2 = l2 != (l2 = l2.replace(f, "$1")), o2 = l2.toLowerCase(), l2 = o2 in n2 || "onFocusOut" == l2 || "onFocusIn" == l2 ? o2.slice(2) : l2.slice(2), n2.l || (n2.l = {}), n2.l[l2 + r2] = u2, u2 ? t2 ? u2.u = t2.u : (u2.u = c, n2.addEventListener(l2, r2 ? a : s, r2)) : n2.removeEventListener(l2, r2 ? a : s, r2);
    else {
      if ("http://www.w3.org/2000/svg" == i2) l2 = l2.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l2 && "height" != l2 && "href" != l2 && "list" != l2 && "form" != l2 && "tabIndex" != l2 && "download" != l2 && "rowSpan" != l2 && "colSpan" != l2 && "role" != l2 && "popover" != l2 && l2 in n2) try {
        n2[l2] = null == u2 ? "" : u2;
        break n;
      } catch (n3) {
      }
      "function" == typeof u2 || (null == u2 || false === u2 && "-" != l2[4] ? n2.removeAttribute(l2) : n2.setAttribute(l2, "popover" == l2 && 1 == u2 ? "" : u2));
    }
  }
  function O(n2) {
    return function(u2) {
      if (this.l) {
        var t2 = this.l[u2.type + n2];
        if (null == u2.t) u2.t = c++;
        else if (u2.t < t2.u) return;
        return t2(l.event ? l.event(u2) : u2);
      }
    };
  }
  function z(n2, u2, t2, i2, r2, o2, e2, f2, c2, s2) {
    var a2, h2, p2, y2, _2, m2, b, S2, C2, M2, $2, I2, A2, H2, L, T2 = u2.type;
    if (void 0 !== u2.constructor) return null;
    128 & t2.__u && (c2 = !!(32 & t2.__u), o2 = [f2 = u2.__e = t2.__e]), (a2 = l.__b) && a2(u2);
    n: if ("function" == typeof T2) try {
      if (S2 = u2.props, C2 = "prototype" in T2 && T2.prototype.render, M2 = (a2 = T2.contextType) && i2[a2.__c], $2 = a2 ? M2 ? M2.props.value : a2.__ : i2, t2.__c ? b = (h2 = u2.__c = t2.__c).__ = h2.__E : (C2 ? u2.__c = h2 = new T2(S2, $2) : (u2.__c = h2 = new x(S2, $2), h2.constructor = T2, h2.render = G), M2 && M2.sub(h2), h2.state || (h2.state = {}), h2.__n = i2, p2 = h2.__d = true, h2.__h = [], h2._sb = []), C2 && null == h2.__s && (h2.__s = h2.state), C2 && null != T2.getDerivedStateFromProps && (h2.__s == h2.state && (h2.__s = w({}, h2.__s)), w(h2.__s, T2.getDerivedStateFromProps(S2, h2.__s))), y2 = h2.props, _2 = h2.state, h2.__v = u2, p2) C2 && null == T2.getDerivedStateFromProps && null != h2.componentWillMount && h2.componentWillMount(), C2 && null != h2.componentDidMount && h2.__h.push(h2.componentDidMount);
      else {
        if (C2 && null == T2.getDerivedStateFromProps && S2 !== y2 && null != h2.componentWillReceiveProps && h2.componentWillReceiveProps(S2, $2), u2.__v == t2.__v || !h2.__e && null != h2.shouldComponentUpdate && false === h2.shouldComponentUpdate(S2, h2.__s, $2)) {
          u2.__v != t2.__v && (h2.props = S2, h2.state = h2.__s, h2.__d = false), u2.__e = t2.__e, u2.__k = t2.__k, u2.__k.some(function(n3) {
            n3 && (n3.__ = u2);
          }), v.push.apply(h2.__h, h2._sb), h2._sb = [], h2.__h.length && e2.push(h2);
          break n;
        }
        null != h2.componentWillUpdate && h2.componentWillUpdate(S2, h2.__s, $2), C2 && null != h2.componentDidUpdate && h2.__h.push(function() {
          h2.componentDidUpdate(y2, _2, m2);
        });
      }
      if (h2.context = $2, h2.props = S2, h2.__P = n2, h2.__e = false, I2 = l.__r, A2 = 0, C2) h2.state = h2.__s, h2.__d = false, I2 && I2(u2), a2 = h2.render(h2.props, h2.state, h2.context), v.push.apply(h2.__h, h2._sb), h2._sb = [];
      else do {
        h2.__d = false, I2 && I2(u2), a2 = h2.render(h2.props, h2.state, h2.context), h2.state = h2.__s;
      } while (h2.__d && ++A2 < 25);
      h2.state = h2.__s, null != h2.getChildContext && (i2 = w(w({}, i2), h2.getChildContext())), C2 && !p2 && null != h2.getSnapshotBeforeUpdate && (m2 = h2.getSnapshotBeforeUpdate(y2, _2)), H2 = null != a2 && a2.type === k && null == a2.key ? q(a2.props.children) : a2, f2 = P(n2, d(H2) ? H2 : [H2], u2, t2, i2, r2, o2, e2, f2, c2, s2), h2.base = u2.__e, u2.__u &= -161, h2.__h.length && e2.push(h2), b && (h2.__E = h2.__ = null);
    } catch (n3) {
      if (u2.__v = null, c2 || null != o2) if (n3.then) {
        for (u2.__u |= c2 ? 160 : 128; f2 && 8 == f2.nodeType && f2.nextSibling; ) f2 = f2.nextSibling;
        o2[o2.indexOf(f2)] = null, u2.__e = f2;
      } else {
        for (L = o2.length; L--; ) g(o2[L]);
        N(u2);
      }
      else u2.__e = t2.__e, u2.__k = t2.__k, n3.then || N(u2);
      l.__e(n3, u2, t2);
    }
    else null == o2 && u2.__v == t2.__v ? (u2.__k = t2.__k, u2.__e = t2.__e) : f2 = u2.__e = B(t2.__e, u2, t2, i2, r2, o2, e2, c2, s2);
    return (a2 = l.diffed) && a2(u2), 128 & u2.__u ? void 0 : f2;
  }
  function N(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(N));
  }
  function V(n2, u2, t2) {
    for (var i2 = 0; i2 < t2.length; i2++) D(t2[i2], t2[++i2], t2[++i2]);
    l.__c && l.__c(u2, n2), n2.some(function(u3) {
      try {
        n2 = u3.__h, u3.__h = [], n2.some(function(n3) {
          n3.call(u3);
        });
      } catch (n3) {
        l.__e(n3, u3.__v);
      }
    });
  }
  function q(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : d(n2) ? n2.map(q) : w({}, n2);
  }
  function B(u2, t2, i2, r2, o2, e2, f2, c2, s2) {
    var a2, h2, v2, y2, w2, _2, m2, b = i2.props || p, k2 = t2.props, x2 = t2.type;
    if ("svg" == x2 ? o2 = "http://www.w3.org/2000/svg" : "math" == x2 ? o2 = "http://www.w3.org/1998/Math/MathML" : o2 || (o2 = "http://www.w3.org/1999/xhtml"), null != e2) {
      for (a2 = 0; a2 < e2.length; a2++) if ((w2 = e2[a2]) && "setAttribute" in w2 == !!x2 && (x2 ? w2.localName == x2 : 3 == w2.nodeType)) {
        u2 = w2, e2[a2] = null;
        break;
      }
    }
    if (null == u2) {
      if (null == x2) return document.createTextNode(k2);
      u2 = document.createElementNS(o2, x2, k2.is && k2), c2 && (l.__m && l.__m(t2, e2), c2 = false), e2 = null;
    }
    if (null == x2) b === k2 || c2 && u2.data == k2 || (u2.data = k2);
    else {
      if (e2 = e2 && n.call(u2.childNodes), !c2 && null != e2) for (b = {}, a2 = 0; a2 < u2.attributes.length; a2++) b[(w2 = u2.attributes[a2]).name] = w2.value;
      for (a2 in b) w2 = b[a2], "dangerouslySetInnerHTML" == a2 ? v2 = w2 : "children" == a2 || a2 in k2 || "value" == a2 && "defaultValue" in k2 || "checked" == a2 && "defaultChecked" in k2 || F(u2, a2, null, w2, o2);
      for (a2 in k2) w2 = k2[a2], "children" == a2 ? y2 = w2 : "dangerouslySetInnerHTML" == a2 ? h2 = w2 : "value" == a2 ? _2 = w2 : "checked" == a2 ? m2 = w2 : c2 && "function" != typeof w2 || b[a2] === w2 || F(u2, a2, w2, b[a2], o2);
      if (h2) c2 || v2 && (h2.__html == v2.__html || h2.__html == u2.innerHTML) || (u2.innerHTML = h2.__html), t2.__k = [];
      else if (v2 && (u2.innerHTML = ""), P("template" == t2.type ? u2.content : u2, d(y2) ? y2 : [y2], t2, i2, r2, "foreignObject" == x2 ? "http://www.w3.org/1999/xhtml" : o2, e2, f2, e2 ? e2[0] : i2.__k && S(i2, 0), c2, s2), null != e2) for (a2 = e2.length; a2--; ) g(e2[a2]);
      c2 || (a2 = "value", "progress" == x2 && null == _2 ? u2.removeAttribute("value") : null != _2 && (_2 !== u2[a2] || "progress" == x2 && !_2 || "option" == x2 && _2 != b[a2]) && F(u2, a2, _2, b[a2], o2), a2 = "checked", null != m2 && m2 != u2[a2] && F(u2, a2, m2, b[a2], o2));
    }
    return u2;
  }
  function D(n2, u2, t2) {
    try {
      if ("function" == typeof n2) {
        var i2 = "function" == typeof n2.__u;
        i2 && n2.__u(), i2 && null == u2 || (n2.__u = n2(u2));
      } else n2.current = u2;
    } catch (n3) {
      l.__e(n3, t2);
    }
  }
  function E(n2, u2, t2) {
    var i2, r2;
    if (l.unmount && l.unmount(n2), (i2 = n2.ref) && (i2.current && i2.current != n2.__e || D(i2, null, u2)), null != (i2 = n2.__c)) {
      if (i2.componentWillUnmount) try {
        i2.componentWillUnmount();
      } catch (n3) {
        l.__e(n3, u2);
      }
      i2.base = i2.__P = null;
    }
    if (i2 = n2.__k) for (r2 = 0; r2 < i2.length; r2++) i2[r2] && E(i2[r2], u2, t2 || "function" != typeof n2.type);
    t2 || g(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function G(n2, l2, u2) {
    return this.constructor(n2, u2);
  }
  function J(u2, t2, i2) {
    var r2, o2, e2, f2;
    t2 == document && (t2 = document.documentElement), l.__ && l.__(u2, t2), o2 = (r2 = "function" == typeof i2) ? null : i2 && i2.__k || t2.__k, e2 = [], f2 = [], z(t2, u2 = (!r2 && i2 || t2).__k = _(k, null, [u2]), o2 || p, p, t2.namespaceURI, !r2 && i2 ? [i2] : o2 ? null : t2.firstChild ? n.call(t2.childNodes) : null, e2, !r2 && i2 ? i2 : o2 ? o2.__e : t2.firstChild, r2, f2), V(e2, u2, f2);
  }
  n = v.slice, l = { __e: function(n2, l2, u2, t2) {
    for (var i2, r2, o2; l2 = l2.__; ) if ((i2 = l2.__c) && !i2.__) try {
      if ((r2 = i2.constructor) && null != r2.getDerivedStateFromError && (i2.setState(r2.getDerivedStateFromError(n2)), o2 = i2.__d), null != i2.componentDidCatch && (i2.componentDidCatch(n2, t2 || {}), o2 = i2.__d), o2) return i2.__E = i2;
    } catch (l3) {
      n2 = l3;
    }
    throw n2;
  } }, u = 0, t = function(n2) {
    return null != n2 && void 0 === n2.constructor;
  }, x.prototype.setState = function(n2, l2) {
    var u2;
    u2 = null != this.__s && this.__s != this.state ? this.__s : this.__s = w({}, this.state), "function" == typeof n2 && (n2 = n2(w({}, u2), this.props)), n2 && w(u2, n2), null != n2 && this.__v && (l2 && this._sb.push(l2), $(this));
  }, x.prototype.forceUpdate = function(n2) {
    this.__v && (this.__e = true, n2 && this.__h.push(n2), $(this));
  }, x.prototype.render = k, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l2) {
    return n2.__v.__b - l2.__v.__b;
  }, I.__r = 0, f = /(PointerCapture)$|Capture$/i, c = 0, s = O(false), a = O(true), h = 0;

  // src/content/ui/Placeholder.tsx
  function PlaceholderView({ meta, isHidden, onToggle }) {
    const details = [];
    details.push(`source: ${meta.source}`);
    if (typeof meta.score === "number") details.push(`score: ${meta.score}`);
    if (typeof meta.confidence === "number") {
      details.push(`confidence: ${meta.confidence.toFixed(2)}`);
    }
    return /* @__PURE__ */ _(k, null, /* @__PURE__ */ _("div", { class: "ai-blocker-placeholder-content" }, /* @__PURE__ */ _("strong", { class: "ai-blocker-placeholder-title" }, "Hidden by AI Blocker"), /* @__PURE__ */ _("span", { class: "ai-blocker-placeholder-details" }, "(", details.join(" | "), ")"), /* @__PURE__ */ _("div", { class: "ai-blocker-placeholder-reason" }, meta.reason || "Likely AI/self-promotional post")), /* @__PURE__ */ _("button", { type: "button", class: "ai-blocker-placeholder-toggle", onClick: onToggle }, /* @__PURE__ */ _("span", { class: isHidden ? "caret" : "caret open", "aria-hidden": "true" }, "\u25B6"), /* @__PURE__ */ _("span", { class: "ai-blocker-placeholder-toggle-label" }, isHidden ? "Show" : "Hide")));
  }
  function createWrapper() {
    const wrapper = document.createElement("div");
    wrapper.className = "ai-blocker-placeholder";
    return wrapper;
  }
  function renderPlaceholder(wrapper, props) {
    J(/* @__PURE__ */ _(PlaceholderView, { ...props }), wrapper);
    if (props.isHidden) {
      wrapper.classList.remove("ai-blocker-placeholder-previewing");
      return;
    }
    wrapper.classList.add("ai-blocker-placeholder-previewing");
  }

  // src/content/controllers/post-controller.ts
  var handleByPost = /* @__PURE__ */ new WeakMap();
  function getPostMarker(postEl) {
    return postEl.dataset.postId || postEl.getAttribute("id") || "";
  }
  function markWrapper(wrapper, postEl) {
    const marker = getPostMarker(postEl);
    if (marker) wrapper.dataset.aiBlockerFor = marker;
  }
  function findExistingWrapper(postEl) {
    const previous = postEl.previousElementSibling;
    if (!previous || !previous.classList.contains("ai-blocker-placeholder")) {
      return null;
    }
    const marker = getPostMarker(postEl);
    if (!marker) return previous;
    if (!previous.dataset.aiBlockerFor || previous.dataset.aiBlockerFor === marker) {
      return previous;
    }
    return null;
  }
  function createHandleFromExisting(wrapper) {
    return { wrapper };
  }
  function createPlaceholder(meta) {
    const wrapper = createWrapper();
    renderPlaceholderState(wrapper, meta, true, () => void 0);
    return { wrapper };
  }
  function ensureHandle(postEl, meta) {
    const cached = handleByPost.get(postEl);
    if (cached?.wrapper?.isConnected) {
      return cached;
    }
    const existingWrapper = findExistingWrapper(postEl);
    const handle = existingWrapper ? createHandleFromExisting(existingWrapper) : createPlaceholder(meta);
    if (!existingWrapper) {
      postEl.insertAdjacentElement("beforebegin", handle.wrapper);
    }
    markWrapper(handle.wrapper, postEl);
    handleByPost.set(postEl, handle);
    return handle;
  }
  function renderPlaceholderState(wrapper, meta, isHidden, onToggle) {
    renderPlaceholder(wrapper, { meta, isHidden, onToggle });
  }
  function renderState(postEl, meta, isHidden) {
    const handle = ensureHandle(postEl, meta);
    renderPlaceholderState(handle.wrapper, meta, isHidden, () => {
      const nextHidden = postEl.dataset.aiBlockerHidden !== "1";
      if (nextHidden) {
        postEl.classList.add("ai-blocker-hidden");
        postEl.dataset.aiBlockerHidden = "1";
      } else {
        postEl.classList.remove("ai-blocker-hidden");
        postEl.dataset.aiBlockerHidden = "0";
      }
      renderState(postEl, meta, nextHidden);
    });
  }
  function setDebugLabel(postEl, text) {
    const htmlPost = postEl;
    let label = htmlPost.querySelector(
      ":scope > .ai-blocker-debug-label"
    );
    if (!label) {
      label = document.createElement("div");
      label.className = "ai-blocker-debug-label";
      htmlPost.prepend(label);
    }
    label.textContent = `AI Blocker debug: ${text}`;
  }
  function clearLikelyAiFlag(postEl) {
    const htmlPost = postEl;
    const existing = htmlPost.querySelector(":scope > .ai-blocker-likely-flag");
    if (existing) existing.remove();
  }
  function setLikelyAiFlag(postEl, text = "Likely AI") {
    const htmlPost = postEl;
    let flag = htmlPost.querySelector(
      ":scope > .ai-blocker-likely-flag"
    );
    if (!flag) {
      flag = document.createElement("div");
      flag.className = "ai-blocker-likely-flag";
      htmlPost.prepend(flag);
    }
    flag.textContent = text;
  }
  function hidePost(postEl, meta, callbacks = {}) {
    const htmlPost = postEl;
    if (htmlPost.dataset.aiBlockerHidden === "1") return;
    htmlPost.dataset.aiBlockerHidden = "1";
    htmlPost.classList.add("ai-blocker-hidden");
    renderState(htmlPost, meta, true);
    callbacks.onHidden?.(meta.source);
    if (htmlPost.dataset.aiBlockerCounted !== "1") {
      htmlPost.dataset.aiBlockerCounted = "1";
      callbacks.onIncrementBlocked?.();
    }
  }

  // src/content/ui/DebugHud.tsx
  function DebugHudText({ model }) {
    const text = `AI Blocker debug | enabled=${model.enabled ? "yes" : "no"} | llm=${model.llmEnabled ? "on" : "off"} | scans=${model.scans} | candidates=${model.candidates} | checked=${model.checked} | hidden(local=${model.hiddenLocal}, llm=${model.hiddenLlm}) | llm(req=${model.llmRequests}, api=${model.llmApiCalls}, cache=${model.llmCacheHits}, err=${model.llmErrors}) | ${model.last}`;
    return /* @__PURE__ */ _("span", null, text);
  }
  function renderHud(hud, model) {
    J(/* @__PURE__ */ _(DebugHudText, { model }), hud);
  }

  // src/content/controllers/debug-hud-controller.ts
  function getDebugHudElement() {
    let hud = document.getElementById("aiBlockerDebugHud");
    if (hud) return hud;
    hud = document.createElement("div");
    hud.id = "aiBlockerDebugHud";
    document.documentElement.appendChild(hud);
    return hud;
  }
  function renderDebugHud(model) {
    const hud = getDebugHudElement();
    renderHud(hud, model);
  }

  // src/content/controllers/scan-controller.ts
  var CANDIDATE_SELECTOR = [
    "shreddit-post",
    "article",
    "div[data-testid='post-container']",
    "div.thing[data-fullname]",
    "faceplate-tracker[slot='content']"
  ].join(",");
  var config = {
    enabled: false,
    threshold: 8,
    customKeywords: [],
    filterSelfPromotion: false,
    llmEnabled: false
  };
  var pendingClassifications = /* @__PURE__ */ new Set();
  var debugStats = {
    scans: 0,
    candidates: 0,
    checked: 0,
    hiddenLocal: 0,
    hiddenLlm: 0,
    llmRequests: 0,
    llmApiCalls: 0,
    llmCacheHits: 0,
    llmErrors: 0,
    last: "booting"
  };
  function setConfig(c2) {
    config = c2;
  }
  function updateDebugHud() {
    try {
      renderDebugHud({ enabled: config.enabled, llmEnabled: config.llmEnabled, ...debugStats });
    } catch (error) {
      if (isContextInvalidatedError(error)) return;
      throw error;
    }
  }
  function hideWithTracking(postEl, meta) {
    hidePost(postEl, meta, {
      onHidden: (source) => {
        if (source === "local") debugStats.hiddenLocal += 1;
        if (source === "llm") debugStats.hiddenLlm += 1;
        debugStats.last = `hide:${source}`;
        updateDebugHud();
      },
      onIncrementBlocked: () => {
        void safeSendRuntimeMessage({ type: "INCREMENT_BLOCKED" }).catch(() => {
        });
      }
    });
  }
  function shouldSendToLlm(localScore) {
    const low = config.threshold - LLM_LOW_DELTA;
    const high = config.threshold + LLM_HIGH_DELTA;
    return localScore >= low && localScore <= high;
  }
  function shouldEscalateStrongLocalToLlm(result) {
    return result.humanStyleSignals >= 3 && result.hardPromoSignals <= 2;
  }
  async function classifyWithLlm(postEl, text, localScore, postHash, keepVisibleOnHide) {
    if (pendingClassifications.has(postHash)) return;
    pendingClassifications.add(postHash);
    debugStats.llmRequests += 1;
    setDebugLabel(postEl, `checked (score=${localScore}) -> LLM pending`);
    debugStats.last = `llm:pending score=${localScore}`;
    updateDebugHud();
    try {
      const result = await safeSendRuntimeMessage({
        type: "CLASSIFY_POST",
        postHash,
        score: localScore,
        text
      });
      if (!result) {
        setDebugLabel(postEl, `checked (score=${localScore}) -> LLM unavailable`);
        debugStats.last = "llm:unavailable";
        updateDebugHud();
        return;
      }
      if (!result.ok || !result.decision) {
        const reason = result.reason || "no decision";
        setDebugLabel(postEl, `checked (score=${localScore}) -> LLM skipped (${reason})`);
        debugStats.last = `llm:skipped ${reason}`;
        updateDebugHud();
        return;
      }
      if (result.cached) {
        debugStats.llmCacheHits += 1;
        debugStats.last = `llm:cache calls=${Number(result.usage?.calls || 0)}`;
      } else {
        debugStats.llmApiCalls += 1;
        debugStats.last = `llm:api calls=${Number(result.usage?.calls || 0)}`;
      }
      updateDebugHud();
      if (result.decision.hide) {
        if (keepVisibleOnHide) {
          setDebugLabel(
            postEl,
            `checked (score=${localScore}) -> likely AI (conf=${Number(result.decision.confidence || 0).toFixed(2)}), kept visible on post page`
          );
          setLikelyAiFlag(postEl, "Likely AI");
          debugStats.last = "flag:llm";
          updateDebugHud();
          return;
        }
        setDebugLabel(
          postEl,
          `checked (score=${localScore}) -> LLM hide (conf=${Number(result.decision.confidence || 0).toFixed(2)})`
        );
        hideWithTracking(postEl, {
          score: localScore,
          source: "llm",
          confidence: Number(result.decision.confidence || 0),
          reason: result.decision.reason || "LLM classifier marked as AI/self-promotional"
        });
        return;
      }
      setDebugLabel(
        postEl,
        `checked (score=${localScore}) -> LLM pass (conf=${Number(result.decision.confidence || 0).toFixed(2)}): ${result.decision.reason || "benign"}`
      );
      debugStats.last = "llm:pass";
      updateDebugHud();
    } catch {
      setDebugLabel(postEl, `checked (score=${localScore}) -> LLM error`);
      debugStats.llmErrors += 1;
      debugStats.last = "llm:error";
      updateDebugHud();
    } finally {
      pendingClassifications.delete(postHash);
    }
  }
  function processPost(postEl) {
    const htmlPost = postEl;
    if (htmlPost.dataset.aiBlockerChecked === "1") return;
    htmlPost.dataset.aiBlockerChecked = "1";
    clearLikelyAiFlag(postEl);
    debugStats.checked += 1;
    const keepVisibleOnHide = isPrimaryPermalinkPost(postEl);
    const textBundle = getPostText(postEl);
    if (!textBundle.normalized || textBundle.normalized.length < 80) {
      setDebugLabel(postEl, "checked -> skipped (too short)");
      debugStats.last = "skip:short";
      updateDebugHud();
      return;
    }
    const domListItemCount = countDomListItems(postEl);
    const scoreResult = scoreText(textBundle.normalized, textBundle.raw, domListItemCount, {
      customKeywords: config.customKeywords,
      filterSelfPromotion: config.filterSelfPromotion
    });
    const score = scoreResult.adjustedScore;
    const localReason = formatLocalReasoning(scoreResult);
    if (score >= config.threshold + STRONG_LOCAL_MARGIN) {
      if (config.llmEnabled && shouldEscalateStrongLocalToLlm(scoreResult)) {
        const postHash = hashText(textBundle.normalized);
        setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}) -> LLM (human-style override) | ${localReason}`);
        void classifyWithLlm(postEl, textBundle.normalized, score, postHash, keepVisibleOnHide);
        return;
      }
      if (keepVisibleOnHide) {
        setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}) -> likely AI, kept visible on post page | ${localReason}`);
        setLikelyAiFlag(postEl, "Likely AI");
        debugStats.last = "flag:local";
        updateDebugHud();
        return;
      }
      setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}) -> hidden locally | ${localReason}`);
      hideWithTracking(postEl, { score, source: "local", reason: "Strong local filter match" });
      return;
    }
    if (config.filterSelfPromotion && scoreResult.hardPromoSignals >= 3 && score >= config.threshold - 1) {
      if (keepVisibleOnHide) {
        setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}, promo+${scoreResult.selfPromoBoost}) -> likely AI/self-promo, kept visible on post page | ${localReason}`);
        setLikelyAiFlag(postEl, "Likely AI");
        debugStats.last = "flag:promo";
        updateDebugHud();
        return;
      }
      setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}, promo+${scoreResult.selfPromoBoost}) -> hidden locally (self-promo filter) | ${localReason}`);
      hideWithTracking(postEl, { score, source: "local", reason: "Self-promotion filter matched" });
      return;
    }
    if (config.llmEnabled && shouldSendToLlm(score)) {
      const postHash = hashText(textBundle.normalized);
      setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}) -> LLM pending | ${localReason}`);
      void classifyWithLlm(postEl, textBundle.normalized, score, postHash, keepVisibleOnHide);
      return;
    }
    if (score >= config.threshold) {
      if (keepVisibleOnHide) {
        setDebugLabel(postEl, `checked (score=${score}) -> likely AI, kept visible on post page | ${localReason}`);
        setLikelyAiFlag(postEl, "Likely AI");
        debugStats.last = "flag:local";
        updateDebugHud();
        return;
      }
      setDebugLabel(postEl, `checked (score=${score}) -> hidden locally | ${localReason}`);
      hideWithTracking(postEl, { score, source: "local", reason: "Local filter matched AI/self-promo signals" });
      return;
    }
    if (!config.llmEnabled) {
      setDebugLabel(postEl, `checked (score=${score}) -> passed locally (llm disabled) | ${localReason}`);
      debugStats.last = `pass:local score=${score} llm=off`;
      updateDebugHud();
      return;
    }
    if (!shouldSendToLlm(score)) {
      setDebugLabel(postEl, `checked (score=${score}) -> passed locally (outside llm range) | ${localReason}`);
      debugStats.last = `pass:local score=${score} outside-llm-range`;
      updateDebugHud();
    }
  }
  function getCandidatePosts() {
    const all = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
    return all.filter((postEl) => !postEl.parentElement?.closest(CANDIDATE_SELECTOR));
  }
  function resetPostChecks() {
    for (const post of getCandidatePosts()) {
      post.dataset.aiBlockerChecked = "0";
    }
  }
  function scan() {
    debugStats.scans += 1;
    const posts = getCandidatePosts();
    debugStats.candidates = posts.length;
    debugStats.last = config.enabled ? "scan:running" : "scan:disabled";
    updateDebugHud();
    if (!config.enabled) return;
    for (const post of posts) {
      processPost(post);
    }
  }
  var scanTimer = null;
  function scheduleScan({ reset = false } = {}) {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      if (reset) resetPostChecks();
      scan();
    }, 150);
  }

  // src/content/index.ts
  async function loadConfig() {
    const saved = await chrome.storage.sync.get(DEFAULTS_RECORD);
    return {
      enabled: Boolean(saved.enabled),
      threshold: Number(saved.threshold || DEFAULTS.threshold),
      customKeywords: toKeywordList(saved.customKeywords),
      filterSelfPromotion: Boolean(saved.filterSelfPromotion),
      llmEnabled: Boolean(saved.llmEnabled)
    };
  }
  async function init() {
    let config2 = await loadConfig();
    setConfig(config2);
    scheduleScan();
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.enabled) config2 = { ...config2, enabled: Boolean(changes.enabled.newValue) };
      if (changes.threshold) config2 = { ...config2, threshold: Number(changes.threshold.newValue || DEFAULTS.threshold) };
      if (changes.customKeywords) config2 = { ...config2, customKeywords: toKeywordList(changes.customKeywords.newValue) };
      if (changes.filterSelfPromotion) config2 = { ...config2, filterSelfPromotion: Boolean(changes.filterSelfPromotion.newValue) };
      if (changes.llmEnabled) config2 = { ...config2, llmEnabled: Boolean(changes.llmEnabled.newValue) };
      setConfig(config2);
      scheduleScan({ reset: true });
    });
  }
  void init();
})();
//# sourceMappingURL=content.js.map
