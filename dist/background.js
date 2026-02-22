const SYNC_DEFAULTS = {
    enabled: true,
    threshold: 8,
    customKeywords: [],
    llmEnabled: false,
    openaiModel: "gpt-4o-mini",
    llmHideConfidence: 0.68,
    maxLlmCallsPerMonth: 1000,
};
const SYNC_DEFAULT_RECORD = { ...SYNC_DEFAULTS };
const LOCAL_DEFAULTS = {
    openaiApiKey: "",
    llmUsage: null,
    llmCache: {},
    blockedCount: 0,
};
const LOCAL_DEFAULT_RECORD = { ...LOCAL_DEFAULTS };
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 600;
const CLASSIFIER_PROMPT_VERSION = "2026-02-22-v4";
function monthKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
}
function cleanReason(text) {
    return String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
}
function sanitizeConfidence(value, fallback = 0.5) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(0, Math.min(1, n));
}
function parseClassifierResult(content, hideThreshold) {
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        return {
            hide: false,
            confidence: 0,
            category: "unknown",
            reason: "Classifier returned invalid JSON",
        };
    }
    const confidence = sanitizeConfidence(parsed.confidence, 0.5);
    const hide = Boolean(parsed.hide) && confidence >= hideThreshold;
    return {
        hide,
        confidence,
        category: String(parsed.category || "unknown").toLowerCase(),
        reason: cleanReason(parsed.reason || "LLM classifier decision"),
    };
}
async function getSettings() {
    const [syncRaw, localRaw] = await Promise.all([
        chrome.storage.sync.get(SYNC_DEFAULT_RECORD),
        chrome.storage.local.get(LOCAL_DEFAULT_RECORD),
    ]);
    const sync = syncRaw;
    const local = localRaw;
    const llmCache = local.llmCache && typeof local.llmCache === "object"
        ? local.llmCache
        : {};
    return {
        llmEnabled: Boolean(sync.llmEnabled),
        openaiModel: String(sync.openaiModel || SYNC_DEFAULTS.openaiModel),
        llmHideConfidence: sanitizeConfidence(sync.llmHideConfidence, SYNC_DEFAULTS.llmHideConfidence),
        maxLlmCallsPerMonth: Math.max(1, Number(sync.maxLlmCallsPerMonth || SYNC_DEFAULTS.maxLlmCallsPerMonth)),
        openaiApiKey: String(local.openaiApiKey || ""),
        llmUsage: local.llmUsage,
        llmCache,
    };
}
function normalizeUsage(existing) {
    const key = monthKey();
    if (!existing || existing.month !== key) {
        return { month: key, calls: 0, promptTokens: 0, completionTokens: 0 };
    }
    return {
        month: key,
        calls: Number(existing.calls || 0),
        promptTokens: Number(existing.promptTokens || 0),
        completionTokens: Number(existing.completionTokens || 0),
    };
}
function cleanupCache(cache) {
    const now = Date.now();
    const entries = Object.entries(cache || {}).filter(([, value]) => {
        const updatedAt = Number(value?.updatedAt || 0);
        return updatedAt > 0 && now - updatedAt <= CACHE_TTL_MS;
    });
    entries.sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt));
    return Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
}
async function runOpenAIClassification(params) {
    const truncatedText = String(params.text || "").slice(0, 7000);
    const body = {
        model: params.model,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: "You classify Reddit posts for feed filtering. Primary criteria are writing cadence, punctuation patterns, and formatting structure (not topic). Focus on AI-templated structure: repetitive short rhetorical lines, polished slogan-like lines, over-structured bullets/framework blocks, and launch narratives with feature-list + CTA. IMPORTANT: self-promotion by itself is not evidence of AI generation and should not be hidden unless the writing structure itself looks AI-templated. Do NOT treat 'personal experiences' or project-specific details as evidence that content is benign. Strong human-imperfection signals (abbreviations like 'btw'/'ud', malformed punctuation like '.?'/'?!'/'!!', missing capitalization, awkward grammar, spelling slips, and long single-block text with minimal paragraph breaks) are evidence against AI-generation and should bias toward benign unless AI-template structure is strong. Output strict JSON only with keys: hide (boolean), confidence (0..1), category (ai|self_promo|mixed|benign), reason (short). Set hide=true only when evidence is reasonably strong.",
            },
            {
                role: "user",
                content: `Classify this Reddit post text for feed filtering. Prioritize cadence, punctuation, and formatting structure over topic keywords. Ignore personal-story framing as a benign signal. Local heuristic score: ${params.localScore}.\n\n` +
                    truncatedText,
            },
        ],
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const textBody = await response.text();
        throw new Error(`OpenAI request failed (${response.status}): ${textBody.slice(0, 200)}`);
    }
    const json = (await response.json());
    const content = json?.choices?.[0]?.message?.content || "{}";
    const result = parseClassifierResult(content, params.hideThreshold);
    return {
        result,
        usage: {
            promptTokens: Number(json?.usage?.prompt_tokens || 0),
            completionTokens: Number(json?.usage?.completion_tokens || 0),
        },
    };
}
async function classifyPost(message) {
    const settings = await getSettings();
    const usage = normalizeUsage(settings.llmUsage);
    const cleanedCache = cleanupCache(settings.llmCache);
    if (!settings.llmEnabled) {
        return { ok: false, skipped: true, reason: "LLM disabled" };
    }
    if (!settings.openaiApiKey) {
        return { ok: false, skipped: true, reason: "Missing OpenAI API key" };
    }
    if (usage.calls >= settings.maxLlmCallsPerMonth) {
        return { ok: false, skipped: true, reason: "Monthly LLM cap reached" };
    }
    const rawHash = String(message.postHash || "");
    if (!rawHash) {
        return { ok: false, skipped: true, reason: "Missing post hash" };
    }
    const key = `${CLASSIFIER_PROMPT_VERSION}:${rawHash}`;
    if (cleanedCache[key]) {
        return { ok: true, cached: true, decision: cleanedCache[key], usage };
    }
    const { result, usage: tokenUsage } = await runOpenAIClassification({
        apiKey: settings.openaiApiKey,
        model: settings.openaiModel,
        hideThreshold: settings.llmHideConfidence,
        localScore: Number(message.score || 0),
        text: message.text,
    });
    const decision = {
        hide: Boolean(result.hide),
        confidence: sanitizeConfidence(result.confidence),
        category: result.category,
        reason: result.reason,
        source: "openai",
        updatedAt: Date.now(),
    };
    const nextUsage = {
        month: usage.month,
        calls: usage.calls + 1,
        promptTokens: usage.promptTokens + tokenUsage.promptTokens,
        completionTokens: usage.completionTokens + tokenUsage.completionTokens,
    };
    cleanedCache[key] = decision;
    const finalCache = cleanupCache(cleanedCache);
    await chrome.storage.local.set({
        llmUsage: nextUsage,
        llmCache: finalCache,
    });
    return { ok: true, cached: false, decision, usage: nextUsage };
}
async function handleGetUsage() {
    const settings = await getSettings();
    return {
        ok: true,
        usage: normalizeUsage(settings.llmUsage),
        cacheSize: Object.keys(cleanupCache(settings.llmCache)).length,
    };
}
async function handleClearCache() {
    await chrome.storage.local.set({ llmCache: {} });
    return { ok: true };
}
function normalizeBlockedCount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0)
        return 0;
    return Math.floor(n);
}
function updateBadge(blockedCount) {
    const text = blockedCount > 0 ? String(blockedCount) : "";
    chrome.action.setBadgeBackgroundColor({ color: "#e4572e" });
    chrome.action.setBadgeText({ text });
}
async function handleIncrementBlocked() {
    const localRaw = await chrome.storage.local.get(LOCAL_DEFAULT_RECORD);
    const local = localRaw;
    const next = normalizeBlockedCount(local.blockedCount) + 1;
    await chrome.storage.local.set({ blockedCount: next });
    updateBadge(next);
    return { ok: true, blockedCount: next };
}
async function handleGetPopupState() {
    const localRaw = await chrome.storage.local.get(LOCAL_DEFAULT_RECORD);
    const local = localRaw;
    const blockedCount = normalizeBlockedCount(local.blockedCount);
    const hasApiKey = Boolean(String(local.openaiApiKey || "").trim());
    updateBadge(blockedCount);
    return { ok: true, blockedCount, hasApiKey };
}
async function handleSetOpenAiApiKey(apiKey) {
    const trimmed = String(apiKey || "").trim();
    await chrome.storage.local.set({ openaiApiKey: trimmed });
    return { ok: true, hasApiKey: Boolean(trimmed) };
}
void handleGetPopupState();
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object")
        return;
    if (message.type === "CLASSIFY_POST") {
        classifyPost(message)
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                skipped: true,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
    if (message.type === "GET_USAGE") {
        handleGetUsage()
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
    if (message.type === "CLEAR_CACHE") {
        handleClearCache()
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
    if (message.type === "INCREMENT_BLOCKED") {
        handleIncrementBlocked()
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
    if (message.type === "GET_POPUP_STATE") {
        handleGetPopupState()
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
    if (message.type === "SET_OPENAI_API_KEY") {
        handleSetOpenAiApiKey(message.apiKey)
            .then((result) => sendResponse(result))
            .catch((error) => {
            sendResponse({
                ok: false,
                reason: String(error?.message || error),
            });
        });
        return true;
    }
});
export {};
