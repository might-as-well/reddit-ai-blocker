"use strict";
const { DEFAULTS, LLM_LOW_DELTA, LLM_HIGH_DELTA, STRONG_LOCAL_MARGIN, DEFAULTS_RECORD, FIRST_PERSON_MARKERS_REGEX, PARALLEL_CADENCE_REGEX, CONTRAST_CADENCE_REGEX, BULLET_REGEX, STRUCTURED_TIMELINE_REGEX, CADENCE_HOOK_REGEX, STACK_NAMED_REGEX, } = AiBlockerContentConfig;
const CANDIDATE_SELECTOR = [
    "shreddit-post",
    "article",
    "div[data-testid='post-container']",
    "div.thing[data-fullname]",
    "faceplate-tracker[slot='content']",
].join(",");
const HUMAN_WRITING_MARKERS_REGEX = /\b(fuck|fucked|shit|damn|wtf|ik|idk|idc|dont|doesnt|ive|youre|cant|wont|im|thats|theyre|weve|btw|lol|probs|dm['’]?ing|ud|u|hehe)\b/g;
let config = { ...DEFAULTS };
const pendingClassifications = new Set();
const placeholderByPost = new WeakMap();
const debugStats = {
    scans: 0,
    candidates: 0,
    checked: 0,
    hiddenLocal: 0,
    hiddenLlm: 0,
    llmRequests: 0,
    llmApiCalls: 0,
    llmCacheHits: 0,
    llmErrors: 0,
    last: "booting",
};
function isContextInvalidatedError(error) {
    return String(error?.message || error).includes("Extension context invalidated");
}
async function safeSendRuntimeMessage(message) {
    try {
        return (await chrome.runtime.sendMessage(message));
    }
    catch (error) {
        if (isContextInvalidatedError(error))
            return null;
        throw error;
    }
}
function updateDebugHud() {
    try {
        AiBlockerUi.renderDebugHud({
            enabled: config.enabled,
            llmEnabled: config.llmEnabled,
            ...debugStats,
        });
    }
    catch (error) {
        if (isContextInvalidatedError(error))
            return;
        throw error;
    }
}
function setDebugLabel(postEl, text) {
    const htmlPost = postEl;
    let label = htmlPost.querySelector(":scope > .ai-blocker-debug-label");
    if (!label) {
        label = document.createElement("div");
        label.className = "ai-blocker-debug-label";
        htmlPost.prepend(label);
    }
    label.textContent = `AI Blocker debug: ${text}`;
}
function toKeywordList(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((item) => String(item).toLowerCase());
}
function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}
function hashText(input) {
    const text = String(input || "");
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 33) ^ text.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
}
function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
}
function getPermalinkPostIdFromPath() {
    const match = window.location.pathname.match(/\/comments\/([a-z0-9]+)\b/i);
    if (!match?.[1])
        return null;
    return `t3_${match[1].toLowerCase()}`;
}
function getElementPostId(postEl) {
    const htmlPost = postEl;
    const candidates = [
        htmlPost.dataset.postId,
        htmlPost.getAttribute("post-id"),
        htmlPost.getAttribute("id"),
        htmlPost.getAttribute("data-fullname"),
    ];
    const raw = candidates.find((value) => typeof value === "string" && value.length > 0);
    if (!raw)
        return null;
    const normalized = raw.toLowerCase();
    if (normalized.startsWith("t3_"))
        return normalized;
    return null;
}
function isPrimaryPermalinkPost(postEl) {
    const permalinkPostId = getPermalinkPostIdFromPath();
    if (!permalinkPostId)
        return false;
    const elementPostId = getElementPostId(postEl);
    return elementPostId === permalinkPostId;
}
function clearLikelyAiFlag(postEl) {
    const htmlPost = postEl;
    const existing = htmlPost.querySelector(":scope > .ai-blocker-likely-flag");
    if (existing)
        existing.remove();
}
function setLikelyAiFlag(postEl, text = "Likely AI") {
    const htmlPost = postEl;
    let flag = htmlPost.querySelector(":scope > .ai-blocker-likely-flag");
    if (!flag) {
        flag = document.createElement("div");
        flag.className = "ai-blocker-likely-flag";
        htmlPost.prepend(flag);
    }
    flag.textContent = text;
}
function getPostText(postEl) {
    const title = postEl.querySelector("h1, h2, h3, [slot='title']")?.textContent || "";
    const body = postEl.textContent || "";
    const richBody = postEl.innerText || body;
    const raw = `${title}\n${richBody}`.trim();
    return { raw, normalized: normalize(raw) };
}
function countNonTerminalLines(rawText) {
    const lines = rawText
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length >= 20);
    return lines.filter((value) => !/[.!?:]$/.test(value)).length;
}
function countDomListItems(postEl) {
    return postEl.querySelectorAll("ul li, ol li").length;
}
function formatLocalReasoning(result) {
    return `local(base=${result.score}; -human=${result.humanAdjustment}; -q=${result.questionAdjustment}; +promo=${result.selfPromoBoost}) ${result.reasoning}`;
}
function performCounts(text, rawText, domListItemCount) {
    const firstPersonMarkers = countMatches(text, FIRST_PERSON_MARKERS_REGEX);
    const sentenceChunks = text
        .split(/[.!?]\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
    const sentenceWordCounts = sentenceChunks.map((value) => value.split(/\s+/).length);
    const averageSentenceWords = sentenceWordCounts.length > 0
        ? sentenceWordCounts.reduce((total, value) => total + value, 0) /
            sentenceWordCounts.length
        : 0;
    const shortSentenceCount = sentenceChunks.filter((value) => value.split(/\s+/).length <= 12).length;
    const veryShortSentenceCount = sentenceChunks.filter((value) => value.split(/\s+/).length <= 6).length;
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
    const lowercasePronounICount = (rawText.match(/(?:^|[\s(])i(?=[\s.,!?')]|$)/g) || []).length;
    const sentenceCount = Math.max(1, sentenceChunks.length);
    const capitalizedWordCount = (rawText.match(/\b[A-Z][a-z]/g) || []).length;
    const capitalizationsPerSentence = capitalizedWordCount / sentenceCount;
    const nonTerminalLines = countNonTerminalLines(rawText);
    const lowercaseSentenceStarts = (rawText.match(/(?:^|[.!?]\s+)[a-z][a-z]/g) || []).length;
    const malformedPunctuationCount = (rawText.match(/(?:\.\?|\?\.|\!\?|\?\!|,{2,}|[.!?]{3,})/g) || []).length;
    const emphaticExclamationCount = (rawText.match(/!!+/g) || []).length;
    const smushedParenthesisCount = (rawText.match(/\w\([^)\s][^)]*\)/g) || []).length;
    const digitLedNounPhraseCount = (rawText.match(/\b\d+\s+(of|people|devs|developers|years|months)\b/gi) || []).length;
    const questionMarkCount = (rawText.match(/\?/g) || []).length;
    const paragraphBreakCount = (rawText.match(/\n\s*\n/g) || []).length;
    const adviceSeekingCount = countMatches(text, /\b(what .* easiest|what do you (all|guys) think|how do you (all|guys)|any suggestions|feeling overwhelmed|just starting to scale|would love .* advice|thank you for (any )?suggestions)\b/g);
    const arrowBulletLineCount = rawText
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => /^→\s+/.test(value)).length;
    const domainCtaCount = countMatches(text, /\b(free to try|try now|get started|sign up|join waitlist|get access)\s*:?\s*[a-z0-9.-]+\.[a-z]{2,}\b/g);
    const marketingLabelLineCount = rawText
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => /^[A-Za-z0-9\s/+&-]{4,36}$/.test(value) &&
        !/[.!?:]$/.test(value) &&
        /\b(saas|ai|project|manager|b2b|b2c)\b/i.test(value)).length;
    const feedbackRequestCount = countMatches(text, /\b(feedback request|would love feedback|appreciate any feedback)\b/g);
    const featureListLeadCount = countMatches(text, /\b(it has:|features?:|what it does:)\b/g);
    const noSignupPitchCount = countMatches(text, /\b(free and no sign ?up|no sign ?up required|without accounts? or setup)\b/g);
    const freeOfferCount = countMatches(text, /\b(free\b|for free|free scan|free audit|free review|free trial|happy to run a free)\b/g);
    const linkFooterCount = (rawText.match(/\blink:\s*\S+/gi) || []).length;
    const listLikeLineCount = rawText
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .filter((value) => /^[A-Za-z][A-Za-z0-9\s,&+\-]{6,80}$/.test(value) &&
        !/[.!?:]$/.test(value)).length;
    const didYouCount = countMatches(text, /\bdid you\b/g);
    const questionLeadCount = countMatches(text, /\b(any advice|what were|how .* acquiring|if content)\b/g);
    const repeatedNoCadenceCount = countMatches(text, /\bno\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]\s+no\s+[^.!?\n]{2,50}[.!?]/g);
    const spacedEmDashCount = (rawText.match(/\s—\s/g) || []).length;
    const substantialLines = rawText
        .split("\n")
        .map((value) => value.trim())
        .filter((value) => value.length >= 20);
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
        sentenceCount,
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
        substantialLines,
        terminalLineCount,
        terminalLineRatio,
        effectiveBulletCount,
        domListItemCount,
    };
}
function scoreAi(counts) {
    let score = 0;
    if (counts.firstPersonMarkers >= 10) {
        score += 2;
    }
    // AI-written narratives often use dense runs of short declarative lines in a polished arc.
    // Keep this light so concise human posts are not over-weighted locally.
    if (counts.sentenceChunks.length >= 9 &&
        counts.shortSentenceCount >= 4 &&
        counts.mediumSentenceCount >= 3) {
        score += 1;
    }
    // Cadence signal: stricter threshold and lighter weight to avoid over-flagging.
    if (counts.sentenceChunks.length >= 8 && counts.shortSentenceRatio >= 0.68) {
        score += 1;
    }
    // Short headline-like statements followed by compact explanation are common AI templates.
    // Keep this as a mild hint only.
    if (counts.veryShortSentenceCount >= 2 && counts.shortSentenceCount >= 5) {
        score += 1;
    }
    // Overly regular sentence lengths across long posts is another synthetic-writing tell.
    if (counts.sentenceChunks.length >= 10 &&
        counts.averageSentenceWords >= 6 &&
        counts.averageSentenceWords <= 16) {
        score += 2;
    }
    // Parallel "we X while they Y" cadence is a frequent templated persuasion pattern.
    if (counts.parallelCadenceCount >= 1) {
        score += 3;
    }
    if (counts.contrastCadenceCount >= 2) {
        score += 2;
    }
    if (counts.repeatedNoCadenceCount >= 1) {
        score += 3;
    }
    if (counts.spacedEmDashCount >= 2) {
        score += 2;
    }
    if (counts.structuredTimelineCount >= 2) {
        score += 3;
    }
    if (counts.cadenceHookCount >= 2) {
        score += 3;
    }
    // Capability-list + stack dump in one post is commonly templated AI copy.
    if (counts.effectiveBulletCount >= 4 && counts.stackNamedCount >= 3) {
        score += 3;
    }
    if (counts.effectiveBulletCount >= 3 && counts.shortSentenceCount >= 6) {
        score += 1;
    }
    // Highly polished, list-heavy pitch structure is often AI-assisted promo copy.
    if (counts.effectiveBulletCount >= 6 &&
        counts.shortSentenceCount >= 8 &&
        counts.capitalizationsPerSentence >= 0.9 &&
        counts.terminalLineRatio >= 0.65 &&
        counts.malformedPunctuationCount === 0 &&
        counts.lowercaseSentenceStarts === 0) {
        score += 2;
    }
    // Arrow-bullet feature dumps with direct domain CTA are strong promo template signals.
    if (counts.arrowBulletLineCount >= 3) {
        score += 4;
    }
    if (counts.domainCtaCount >= 1) {
        score += 3;
    }
    if (counts.arrowBulletLineCount >= 3 && counts.domainCtaCount >= 1) {
        score += 3;
    }
    if (counts.marketingLabelLineCount >= 2) {
        score += 2;
    }
    // "Feedback request + features + no-signup + link" launch template.
    if (counts.featureListLeadCount >= 1 && counts.listLikeLineCount >= 3) {
        score += 4;
    }
    if (counts.feedbackRequestCount >= 1) {
        score += 2;
    }
    if (counts.noSignupPitchCount >= 1) {
        score += 2;
    }
    if (config.filterSelfPromotion && counts.freeOfferCount >= 1) {
        score += 3;
    }
    if (config.filterSelfPromotion && counts.freeOfferCount >= 2) {
        score += 2;
    }
    if (counts.linkFooterCount >= 1) {
        score += 2;
    }
    if (counts.feedbackRequestCount >= 1 &&
        counts.featureListLeadCount >= 1 &&
        counts.linkFooterCount >= 1) {
        score += 3;
    }
    let hardPromoSignals = 0;
    if (counts.cadenceHookCount >= 2)
        hardPromoSignals += 1;
    if (counts.repeatedNoCadenceCount >= 1)
        hardPromoSignals += 1;
    if (counts.spacedEmDashCount >= 2)
        hardPromoSignals += 1;
    if (counts.structuredTimelineCount >= 2)
        hardPromoSignals += 1;
    if (counts.stackNamedCount >= 3 && counts.effectiveBulletCount >= 4)
        hardPromoSignals += 1;
    if (counts.sentenceChunks.length >= 8 && counts.shortSentenceRatio >= 0.7)
        hardPromoSignals += 1;
    if (counts.feedbackRequestCount >= 1)
        hardPromoSignals += 1;
    if (counts.featureListLeadCount >= 1 && counts.listLikeLineCount >= 3)
        hardPromoSignals += 1;
    if (counts.linkFooterCount >= 1)
        hardPromoSignals += 1;
    if (counts.arrowBulletLineCount >= 3)
        hardPromoSignals += 1;
    if (counts.domainCtaCount >= 1)
        hardPromoSignals += 1;
    if (counts.marketingLabelLineCount >= 2)
        hardPromoSignals += 1;
    if (config.filterSelfPromotion && counts.freeOfferCount >= 1)
        hardPromoSignals += 1;
    if (counts.domListItemCount >= 4 && counts.shortSentenceCount >= 5)
        hardPromoSignals += 1;
    if (counts.effectiveBulletCount >= 6 &&
        counts.shortSentenceCount >= 8 &&
        counts.capitalizationsPerSentence >= 0.9 &&
        counts.terminalLineRatio >= 0.65 &&
        counts.malformedPunctuationCount === 0 &&
        counts.lowercaseSentenceStarts === 0) {
        hardPromoSignals += 1;
    }
    return { score, hardPromoSignals };
}
function scoreHuman(counts, hardPromoSignals) {
    let humanStyleSignals = 0;
    if (counts.humanMarkerCount >= 2)
        humanStyleSignals += 1;
    if (counts.humanMarkerCount >= 4)
        humanStyleSignals += 1;
    if (counts.nonTerminalLines >= 3 && counts.domListItemCount < 3)
        humanStyleSignals += 1;
    if (counts.lowercaseSentenceStarts >= 1)
        humanStyleSignals += 1;
    if (counts.lowercaseSentenceStarts >= 2)
        humanStyleSignals += 1;
    if (counts.lowercaseSentenceStarts >= 3)
        humanStyleSignals += 1;
    if (counts.malformedPunctuationCount >= 1)
        humanStyleSignals += 1;
    if (counts.emphaticExclamationCount >= 1)
        humanStyleSignals += 1;
    if (counts.smushedParenthesisCount >= 1)
        humanStyleSignals += 1;
    if (counts.digitLedNounPhraseCount >= 1)
        humanStyleSignals += 1;
    if (counts.lowercasePronounICount >= 2)
        humanStyleSignals += 1;
    if (counts.capitalizationsPerSentence <= 0.6)
        humanStyleSignals += 1;
    if (counts.capitalizationsPerSentence <= 0.3)
        humanStyleSignals += 1;
    if (counts.sentenceChunks.length >= 8 && counts.paragraphBreakCount === 0)
        humanStyleSignals += 2;
    if (counts.sentenceChunks.length >= 5 && counts.paragraphBreakCount <= 1)
        humanStyleSignals += 1;
    let questionStyleSignals = 0;
    if (counts.questionMarkCount >= 2 ||
        counts.didYouCount >= 1 ||
        counts.questionLeadCount >= 1 ||
        counts.adviceSeekingCount >= 1) {
        questionStyleSignals = 1;
    }
    const humanAdjustment = hardPromoSignals <= 1 ? Math.min(6, humanStyleSignals) : Math.min(3, humanStyleSignals);
    const questionAdjustment = hardPromoSignals <= 1 ? Math.min(1, questionStyleSignals) : 0;
    return {
        humanStyleSignals,
        questionStyleSignals,
        humanAdjustment,
        questionAdjustment,
    };
}
function scoreText(text, rawText, domListItemCount) {
    let score = 0;
    for (const kw of config.customKeywords) {
        if (kw && text.includes(kw))
            score += 2;
    }
    const counts = performCounts(text, rawText, domListItemCount);
    const aiScore = scoreAi(counts);
    score += aiScore.score;
    const humanScore = scoreHuman(counts, aiScore.hardPromoSignals);
    const selfPromoBoost = config.filterSelfPromotion
        ? Math.min(10, aiScore.hardPromoSignals * 2 +
            (counts.domainCtaCount >= 1 ? 2 : 0) +
            (counts.arrowBulletLineCount >= 3 ? 2 : 0) +
            (counts.feedbackRequestCount >= 1 ? 1 : 0) +
            (counts.freeOfferCount >= 1 ? 2 : 0))
        : 0;
    const adjustedScore = Math.max(0, score + selfPromoBoost - humanScore.humanAdjustment - humanScore.questionAdjustment);
    const reasoningParts = [];
    if (counts.effectiveBulletCount >= 3)
        reasoningParts.push(`bullets=${counts.effectiveBulletCount}`);
    if (counts.domListItemCount >= 1)
        reasoningParts.push(`domLi=${counts.domListItemCount}`);
    if (counts.shortSentenceRatio >= 0.6)
        reasoningParts.push(`shortRatio=${counts.shortSentenceRatio.toFixed(2)}`);
    if (counts.terminalLineRatio >= 0.6)
        reasoningParts.push(`terminalRatio=${counts.terminalLineRatio.toFixed(2)}`);
    if (counts.feedbackRequestCount >= 1)
        reasoningParts.push("feedback-ask");
    if (counts.domainCtaCount >= 1 || counts.linkFooterCount >= 1)
        reasoningParts.push("cta/link");
    if (counts.structuredTimelineCount >= 1)
        reasoningParts.push(`timeline=${counts.structuredTimelineCount}`);
    if (counts.cadenceHookCount >= 1)
        reasoningParts.push(`cadenceHooks=${counts.cadenceHookCount}`);
    if (counts.repeatedNoCadenceCount >= 1)
        reasoningParts.push(`noCadence=${counts.repeatedNoCadenceCount}`);
    if (counts.spacedEmDashCount >= 1)
        reasoningParts.push(`emDash=${counts.spacedEmDashCount}`);
    if (aiScore.hardPromoSignals >= 1)
        reasoningParts.push(`promoSignals=${aiScore.hardPromoSignals}`);
    if (humanScore.humanStyleSignals >= 1)
        reasoningParts.push(`humanSignals=${humanScore.humanStyleSignals}`);
    if (humanScore.questionStyleSignals >= 1)
        reasoningParts.push(`questionSignals=${humanScore.questionStyleSignals}`);
    return {
        score,
        adjustedScore,
        humanStyleSignals: humanScore.humanStyleSignals,
        hardPromoSignals: aiScore.hardPromoSignals,
        questionStyleSignals: humanScore.questionStyleSignals,
        selfPromoBoost,
        humanAdjustment: humanScore.humanAdjustment,
        questionAdjustment: humanScore.questionAdjustment,
        reasoning: reasoningParts.join(", ") || "no strong signals",
    };
}
function setConfigForTest(next) {
    config = {
        ...config,
        ...next,
        customKeywords: next.customKeywords
            ? toKeywordList(next.customKeywords)
            : config.customKeywords,
    };
}
function hidePost(postEl, meta) {
    const htmlPost = postEl;
    if (htmlPost.dataset.aiBlockerHidden === "1")
        return;
    htmlPost.dataset.aiBlockerHidden = "1";
    htmlPost.classList.add("ai-blocker-hidden");
    let handle = placeholderByPost.get(htmlPost);
    if (!handle || !handle.wrapper.isConnected) {
        const previous = htmlPost.previousElementSibling;
        if (previous && previous.classList.contains("ai-blocker-placeholder")) {
            const wrapper = previous;
            let toggleButton = wrapper.querySelector(".ai-blocker-placeholder-toggle");
            if (!toggleButton) {
                toggleButton = document.createElement("button");
                toggleButton.type = "button";
                toggleButton.className = "ai-blocker-placeholder-toggle";
                wrapper.appendChild(toggleButton);
            }
            const rebound = toggleButton.cloneNode(true);
            toggleButton.replaceWith(rebound);
            handle = { wrapper, toggleButton: rebound };
        }
        else {
            handle = AiBlockerUi.createPlaceholder(meta);
            htmlPost.insertAdjacentElement("beforebegin", handle.wrapper);
        }
        handle.toggleButton.addEventListener("click", () => {
            const isHidden = htmlPost.dataset.aiBlockerHidden === "1";
            if (isHidden) {
                htmlPost.classList.remove("ai-blocker-hidden");
                htmlPost.dataset.aiBlockerHidden = "0";
                AiBlockerUi.setPlaceholderState(handle.wrapper, handle.toggleButton, false);
                return;
            }
            htmlPost.classList.add("ai-blocker-hidden");
            htmlPost.dataset.aiBlockerHidden = "1";
            AiBlockerUi.setPlaceholderState(handle.wrapper, handle.toggleButton, true);
        });
        placeholderByPost.set(htmlPost, handle);
    }
    AiBlockerUi.renderPlaceholderContent(handle.wrapper, meta);
    AiBlockerUi.setPlaceholderState(handle.wrapper, handle.toggleButton, true);
    if (meta.source === "local")
        debugStats.hiddenLocal += 1;
    if (meta.source === "llm")
        debugStats.hiddenLlm += 1;
    debugStats.last = `hide:${meta.source}`;
    updateDebugHud();
    if (htmlPost.dataset.aiBlockerCounted !== "1") {
        htmlPost.dataset.aiBlockerCounted = "1";
        void safeSendRuntimeMessage({ type: "INCREMENT_BLOCKED" }).catch(() => {
            // Ignore transient extension/runtime errors.
        });
    }
}
function getCandidatePosts() {
    const all = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
    return all.filter((postEl) => !postEl.parentElement?.closest(CANDIDATE_SELECTOR));
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
    if (pendingClassifications.has(postHash))
        return;
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
            text,
        });
        if (!result) {
            setDebugLabel(postEl, `checked (score=${localScore}) -> LLM unavailable`);
            debugStats.last = "llm:unavailable";
            updateDebugHud();
            return;
        }
        if (!result || !result.ok || !result.decision) {
            const reason = result?.reason || "no decision";
            setDebugLabel(postEl, `checked (score=${localScore}) -> LLM skipped (${reason})`);
            debugStats.last = `llm:skipped ${reason}`;
            updateDebugHud();
            return;
        }
        if (result.cached) {
            debugStats.llmCacheHits += 1;
            debugStats.last = `llm:cache calls=${Number(result.usage?.calls || 0)}`;
        }
        else {
            debugStats.llmApiCalls += 1;
            debugStats.last = `llm:api calls=${Number(result.usage?.calls || 0)}`;
        }
        updateDebugHud();
        if (result.decision.hide) {
            if (keepVisibleOnHide) {
                setDebugLabel(postEl, `checked (score=${localScore}) -> likely AI (conf=${Number(result.decision.confidence || 0).toFixed(2)}), kept visible on post page`);
                setLikelyAiFlag(postEl, "Likely AI");
                debugStats.last = "flag:llm";
                updateDebugHud();
                return;
            }
            setDebugLabel(postEl, `checked (score=${localScore}) -> LLM hide (conf=${Number(result.decision.confidence || 0).toFixed(2)})`);
            hidePost(postEl, {
                score: localScore,
                source: "llm",
                confidence: Number(result.decision.confidence || 0),
                reason: result.decision.reason ||
                    "LLM classifier marked as AI/self-promotional",
            });
            return;
        }
        setDebugLabel(postEl, `checked (score=${localScore}) -> LLM pass (conf=${Number(result.decision.confidence || 0).toFixed(2)}): ${result.decision.reason || "benign"}`);
        debugStats.last = "llm:pass";
        updateDebugHud();
    }
    catch {
        // Ignore transient extension/runtime errors.
        setDebugLabel(postEl, `checked (score=${localScore}) -> LLM error`);
        debugStats.llmErrors += 1;
        debugStats.last = "llm:error";
        updateDebugHud();
    }
    finally {
        pendingClassifications.delete(postHash);
    }
}
function processPost(postEl) {
    const htmlPost = postEl;
    if (htmlPost.dataset.aiBlockerChecked === "1")
        return;
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
    const scoreResult = scoreText(textBundle.normalized, textBundle.raw, domListItemCount);
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
        hidePost(postEl, {
            score,
            source: "local",
            reason: "Strong local filter match",
        });
        return;
    }
    if (config.filterSelfPromotion &&
        scoreResult.hardPromoSignals >= 3 &&
        score >= config.threshold - 1) {
        if (keepVisibleOnHide) {
            setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}, promo+${scoreResult.selfPromoBoost}) -> likely AI/self-promo, kept visible on post page | ${localReason}`);
            setLikelyAiFlag(postEl, "Likely AI");
            debugStats.last = "flag:promo";
            updateDebugHud();
            return;
        }
        setDebugLabel(postEl, `checked (score=${score} raw=${scoreResult.score}, promo+${scoreResult.selfPromoBoost}) -> hidden locally (self-promo filter) | ${localReason}`);
        hidePost(postEl, {
            score,
            source: "local",
            reason: "Self-promotion filter matched",
        });
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
        hidePost(postEl, {
            score,
            source: "local",
            reason: "Local filter matched AI/self-promo signals",
        });
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
        return;
    }
}
function scan() {
    debugStats.scans += 1;
    const posts = getCandidatePosts();
    debugStats.candidates = posts.length;
    debugStats.last = config.enabled ? "scan:running" : "scan:disabled";
    updateDebugHud();
    if (!config.enabled)
        return;
    for (const post of posts) {
        processPost(post);
    }
}
function resetPostChecks() {
    const posts = getCandidatePosts();
    for (const post of posts) {
        post.dataset.aiBlockerChecked = "0";
    }
}
let scanTimer = null;
function scheduleScan({ reset = false } = {}) {
    if (scanTimer)
        return;
    scanTimer = window.setTimeout(() => {
        scanTimer = null;
        if (reset)
            resetPostChecks();
        scan();
    }, 150);
}
async function loadConfig() {
    const saved = (await chrome.storage.sync.get(DEFAULTS_RECORD));
    config = {
        enabled: Boolean(saved.enabled),
        threshold: Number(saved.threshold || DEFAULTS.threshold),
        customKeywords: toKeywordList(saved.customKeywords),
        filterSelfPromotion: Boolean(saved.filterSelfPromotion),
        llmEnabled: Boolean(saved.llmEnabled),
    };
}
async function init() {
    await AiBlockerUi.ensurePlaceholderTemplateLoaded();
    await AiBlockerUi.ensureDebugHudTemplateLoaded();
    await loadConfig();
    debugStats.last = "init:loaded";
    updateDebugHud();
    scan();
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync")
            return;
        if (changes.enabled)
            config.enabled = Boolean(changes.enabled.newValue);
        if (changes.threshold)
            config.threshold = Number(changes.threshold.newValue || DEFAULTS.threshold);
        if (changes.customKeywords) {
            config.customKeywords = toKeywordList(changes.customKeywords.newValue);
        }
        if (changes.filterSelfPromotion) {
            config.filterSelfPromotion = Boolean(changes.filterSelfPromotion.newValue);
        }
        if (changes.llmEnabled)
            config.llmEnabled = Boolean(changes.llmEnabled.newValue);
        scheduleScan({ reset: true });
    });
}
if (globalThis.__AI_BLOCKER_TEST__) {
    globalThis.__AI_BLOCKER_TEST_HOOKS__ = {
        performCounts,
        scoreAi,
        scoreHuman,
        scoreText,
        setConfigForTest,
    };
}
else {
    void init();
}
