import type { RuntimeMessage, SyncSettings, UsageResponse } from "./types";

const SYNC_DEFAULTS: SyncSettings = {
  enabled: true,
  threshold: 8,
  customKeywords: [],
  llmEnabled: false,
  openaiModel: "gpt-4o-mini",
  llmHideConfidence: 0.68,
  maxLlmCallsPerMonth: 1000
};

const LOCAL_DEFAULTS = {
  openaiApiKey: ""
};
const SYNC_DEFAULT_RECORD: Record<string, unknown> = { ...SYNC_DEFAULTS };
const LOCAL_DEFAULT_RECORD: Record<string, unknown> = { ...LOCAL_DEFAULTS };

const enabledEl = document.getElementById("enabled") as HTMLInputElement;
const thresholdEl = document.getElementById("threshold") as HTMLInputElement;
const keywordsEl = document.getElementById("keywords") as HTMLTextAreaElement;
const llmEnabledEl = document.getElementById("llmEnabled") as HTMLInputElement;
const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement;
const modelEl = document.getElementById("model") as HTMLInputElement;
const llmConfidenceEl = document.getElementById("llmConfidence") as HTMLInputElement;
const monthlyCapEl = document.getElementById("monthlyCap") as HTMLInputElement;
const usageEl = document.getElementById("usage") as HTMLDivElement;
const clearCacheEl = document.getElementById("clearCache") as HTMLButtonElement;
const saveEl = document.getElementById("save") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;

function setStatus(text: string): void {
  statusEl.textContent = text;
  window.setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = "";
  }, 1500);
}

async function refreshUsage(): Promise<void> {
  try {
    const result = (await chrome.runtime.sendMessage({ type: "GET_USAGE" } satisfies RuntimeMessage)) as UsageResponse;
    if (!result || !result.ok || !result.usage) {
      usageEl.textContent = "Usage: unavailable";
      return;
    }
    const usage = result.usage;
    usageEl.textContent = `Usage (${usage.month}): ${usage.calls} calls, ${usage.promptTokens} prompt tok, ${usage.completionTokens} completion tok, cache ${result.cacheSize || 0}`;
  } catch {
    usageEl.textContent = "Usage: unavailable";
  }
}

async function load(): Promise<void> {
  const [syncRaw, localRaw] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULT_RECORD),
    chrome.storage.local.get(LOCAL_DEFAULT_RECORD)
  ]);
  const syncSaved = syncRaw as Partial<SyncSettings>;
  const localSaved = localRaw as { openaiApiKey?: unknown };
  const customKeywords = Array.isArray(syncSaved.customKeywords) ? syncSaved.customKeywords.map(String) : [];

  enabledEl.checked = Boolean(syncSaved.enabled);
  thresholdEl.value = String(Number(syncSaved.threshold || SYNC_DEFAULTS.threshold));
  keywordsEl.value = customKeywords.join("\n");
  llmEnabledEl.checked = Boolean(syncSaved.llmEnabled);
  apiKeyEl.value = String(localSaved.openaiApiKey || "");
  modelEl.value = String(syncSaved.openaiModel || SYNC_DEFAULTS.openaiModel);
  llmConfidenceEl.value = Number(syncSaved.llmHideConfidence || SYNC_DEFAULTS.llmHideConfidence).toFixed(2);
  monthlyCapEl.value = String(Number(syncSaved.maxLlmCallsPerMonth || SYNC_DEFAULTS.maxLlmCallsPerMonth));

  await refreshUsage();
}

function boundedInt(value: string, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function boundedFloat(value: string, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function save(): Promise<void> {
  const threshold = boundedInt(thresholdEl.value, SYNC_DEFAULTS.threshold, 1, 20);
  const llmHideConfidence = boundedFloat(llmConfidenceEl.value, SYNC_DEFAULTS.llmHideConfidence, 0, 1);
  const maxLlmCallsPerMonth = boundedInt(monthlyCapEl.value, SYNC_DEFAULTS.maxLlmCallsPerMonth, 1, 50000);
  const customKeywords = keywordsEl.value
    .split("\n")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const model = (modelEl.value || "").trim() || SYNC_DEFAULTS.openaiModel;
  const apiKey = (apiKeyEl.value || "").trim();

  await Promise.all([
    chrome.storage.sync.set({
      enabled: enabledEl.checked,
      threshold,
      customKeywords,
      llmEnabled: llmEnabledEl.checked,
      openaiModel: model,
      llmHideConfidence,
      maxLlmCallsPerMonth
    }),
    chrome.storage.local.set({ openaiApiKey: apiKey })
  ]);

  thresholdEl.value = String(threshold);
  llmConfidenceEl.value = llmHideConfidence.toFixed(2);
  monthlyCapEl.value = String(maxLlmCallsPerMonth);
  modelEl.value = model;

  setStatus("Saved");
  await refreshUsage();
}

async function clearCache(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "CLEAR_CACHE" } satisfies RuntimeMessage);
  setStatus("Cache cleared");
  await refreshUsage();
}

saveEl.addEventListener("click", () => {
  void save();
});
clearCacheEl.addEventListener("click", () => {
  void clearCache();
});

void load();
