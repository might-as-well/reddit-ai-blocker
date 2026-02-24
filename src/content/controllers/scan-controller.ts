import type { ClassifyResponse } from "../../types";
import {
  LLM_LOW_DELTA,
  LLM_HIGH_DELTA,
  STRONG_LOCAL_MARGIN,
  type RuntimeConfig,
} from "../scoring/config";
import { scoreText, formatLocalReasoning, type ScoreResult } from "../scoring/scorer";
import {
  isPrimaryPermalinkPost,
  getPostText,
  countDomListItems,
  hashText,
} from "../utils";
import { isContextInvalidatedError, safeSendRuntimeMessage } from "../runtime";
import {
  setDebugLabel,
  clearLikelyAiFlag,
  setLikelyAiFlag,
  hidePost,
} from "./post-controller";
import { renderDebugHud } from "./debug-hud-controller";

const CANDIDATE_SELECTOR = [
  "shreddit-post",
  "article",
  "div[data-testid='post-container']",
  "div.thing[data-fullname]",
  "faceplate-tracker[slot='content']",
].join(",");

let config: RuntimeConfig = {
  enabled: false,
  threshold: 8,
  customKeywords: [],
  filterSelfPromotion: false,
  llmEnabled: false,
};

const pendingClassifications = new Set<string>();

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

export function setConfig(c: RuntimeConfig): void {
  config = c;
}

// ── HUD ──────────────────────────────────────────────────────────────────────

function updateDebugHud(): void {
  try {
    renderDebugHud({ enabled: config.enabled, llmEnabled: config.llmEnabled, ...debugStats });
  } catch (error: unknown) {
    if (isContextInvalidatedError(error)) return;
    throw error;
  }
}

// ── Post hiding ───────────────────────────────────────────────────────────────

function hideWithTracking(
  postEl: Element,
  meta: { score?: number; source: "local" | "llm"; confidence?: number; reason?: string },
): void {
  hidePost(postEl, meta, {
    onHidden: (source) => {
      if (source === "local") debugStats.hiddenLocal += 1;
      if (source === "llm") debugStats.hiddenLlm += 1;
      debugStats.last = `hide:${source}`;
      updateDebugHud();
    },
    onIncrementBlocked: () => {
      void safeSendRuntimeMessage<unknown>({ type: "INCREMENT_BLOCKED" }).catch(() => {
        // Ignore transient extension/runtime errors.
      });
    },
  });
}

// ── LLM classification ────────────────────────────────────────────────────────

function shouldSendToLlm(localScore: number): boolean {
  const low = config.threshold - LLM_LOW_DELTA;
  const high = config.threshold + LLM_HIGH_DELTA;
  return localScore >= low && localScore <= high;
}

function shouldEscalateStrongLocalToLlm(result: ScoreResult): boolean {
  return result.humanStyleSignals >= 3 && result.hardPromoSignals <= 2;
}

async function classifyWithLlm(
  postEl: Element,
  text: string,
  localScore: number,
  postHash: string,
  keepVisibleOnHide: boolean,
): Promise<void> {
  if (pendingClassifications.has(postHash)) return;
  pendingClassifications.add(postHash);
  debugStats.llmRequests += 1;
  setDebugLabel(postEl, `checked (score=${localScore}) -> LLM pending`);
  debugStats.last = `llm:pending score=${localScore}`;
  updateDebugHud();

  try {
    const message = {
      type: "CLASSIFY_POST" as const,
      postHash,
      score: localScore,
      text,
    };
    let result: ClassifyResponse;
    try {
      result = (await chrome.runtime.sendMessage(message)) as ClassifyResponse;
    } catch (firstError: unknown) {
      if (isContextInvalidatedError(firstError)) {
        await new Promise((resolve) => window.setTimeout(resolve, 200));
        try {
          result = (await chrome.runtime.sendMessage(message)) as ClassifyResponse;
        } catch (retryError: unknown) {
          const detail = String((retryError as Error)?.message || retryError);
          setDebugLabel(
            postEl,
            `checked (score=${localScore}) -> LLM unavailable (${detail.slice(0, 120)})`,
          );
          debugStats.last = "llm:unavailable context-invalidated";
          updateDebugHud();
          return;
        }
      } else {
        throw firstError;
      }
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
          `checked (score=${localScore}) -> likely AI (conf=${Number(result.decision.confidence || 0).toFixed(2)}), kept visible on post page`,
        );
        setLikelyAiFlag(postEl, "Likely AI");
        debugStats.last = "flag:llm";
        updateDebugHud();
        return;
      }
      setDebugLabel(
        postEl,
        `checked (score=${localScore}) -> LLM hide (conf=${Number(result.decision.confidence || 0).toFixed(2)})`,
      );
      hideWithTracking(postEl, {
        score: localScore,
        source: "llm",
        confidence: Number(result.decision.confidence || 0),
        reason: result.decision.reason || "LLM classifier marked as AI/self-promotional",
      });
      return;
    }

    setDebugLabel(
      postEl,
      `checked (score=${localScore}) -> LLM pass (conf=${Number(result.decision.confidence || 0).toFixed(2)}): ${result.decision.reason || "benign"}`,
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

// ── Per-post processing ───────────────────────────────────────────────────────

function processPost(postEl: Element): void {
  const htmlPost = postEl as HTMLElement;
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
    filterSelfPromotion: config.filterSelfPromotion,
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

// ── Scan loop ─────────────────────────────────────────────────────────────────

function getCandidatePosts(): Element[] {
  const all = Array.from(document.querySelectorAll(CANDIDATE_SELECTOR));
  return all.filter((postEl) => !postEl.parentElement?.closest(CANDIDATE_SELECTOR));
}

function resetPostChecks(): void {
  for (const post of getCandidatePosts()) {
    (post as HTMLElement).dataset.aiBlockerChecked = "0";
  }
}

function scan(): void {
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

let scanTimer: number | null = null;

export function scheduleScan({ reset = false }: { reset?: boolean } = {}): void {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    if (reset) resetPostChecks();
    scan();
  }, 150);
}
