import * as preact from "preact";
import { useState, useEffect } from "preact/hooks";
import type { RuntimeMessage, SyncSettings, UsageResponse } from "../types";

const SYNC_DEFAULTS: SyncSettings = {
  enabled: true,
  threshold: 8,
  customKeywords: [],
  filterSelfPromotion: false,
  llmEnabled: false,
  openaiModel: "gpt-4o-mini",
  llmHideConfidence: 0.68,
  maxLlmCallsPerMonth: 1000,
};

const LOCAL_DEFAULTS = { openaiApiKey: "" };
const SYNC_DEFAULT_RECORD: Record<string, unknown> = { ...SYNC_DEFAULTS };
const LOCAL_DEFAULT_RECORD: Record<string, unknown> = { ...LOCAL_DEFAULTS };

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

export default function App() {
  const [enabled, setEnabled] = useState(SYNC_DEFAULTS.enabled);
  const [threshold, setThreshold] = useState(String(SYNC_DEFAULTS.threshold));
  const [keywords, setKeywords] = useState("");
  const [filterSelfPromotion, setFilterSelfPromotion] = useState(SYNC_DEFAULTS.filterSelfPromotion);
  const [llmEnabled, setLlmEnabled] = useState(SYNC_DEFAULTS.llmEnabled);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(SYNC_DEFAULTS.openaiModel);
  const [llmConfidence, setLlmConfidence] = useState(
    SYNC_DEFAULTS.llmHideConfidence.toFixed(2),
  );
  const [monthlyCap, setMonthlyCap] = useState(String(SYNC_DEFAULTS.maxLlmCallsPerMonth));
  const [usage, setUsage] = useState("Usage: loading...");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    const [syncRaw, localRaw] = await Promise.all([
      chrome.storage.sync.get(SYNC_DEFAULT_RECORD),
      chrome.storage.local.get(LOCAL_DEFAULT_RECORD),
    ]);
    const syncSaved = syncRaw as Partial<SyncSettings>;
    const localSaved = localRaw as { openaiApiKey?: unknown };
    const customKeywords = Array.isArray(syncSaved.customKeywords)
      ? syncSaved.customKeywords.map(String)
      : [];

    setEnabled(Boolean(syncSaved.enabled));
    setThreshold(String(Number(syncSaved.threshold || SYNC_DEFAULTS.threshold)));
    setKeywords(customKeywords.join("\n"));
    setFilterSelfPromotion(Boolean(syncSaved.filterSelfPromotion));
    setLlmEnabled(Boolean(syncSaved.llmEnabled));
    setApiKey(String(localSaved.openaiApiKey || ""));
    setModel(String(syncSaved.openaiModel || SYNC_DEFAULTS.openaiModel));
    setLlmConfidence(
      Number(syncSaved.llmHideConfidence || SYNC_DEFAULTS.llmHideConfidence).toFixed(2),
    );
    setMonthlyCap(
      String(Number(syncSaved.maxLlmCallsPerMonth || SYNC_DEFAULTS.maxLlmCallsPerMonth)),
    );

    await refreshUsage();
  }

  async function refreshUsage(): Promise<void> {
    try {
      const result = (await chrome.runtime.sendMessage(
        { type: "GET_USAGE" } satisfies RuntimeMessage,
      )) as UsageResponse;
      if (!result || !result.ok || !result.usage) {
        setUsage("Usage: unavailable");
        return;
      }
      const u = result.usage;
      setUsage(
        `Usage (${u.month}): ${u.calls} calls, ${u.promptTokens} prompt tok, ${u.completionTokens} completion tok, cache ${result.cacheSize || 0}`,
      );
    } catch {
      setUsage("Usage: unavailable");
    }
  }

  function flashStatus(text: string): void {
    setStatus(text);
    window.setTimeout(() => setStatus((prev) => (prev === text ? "" : prev)), 1500);
  }

  async function save(): Promise<void> {
    const t = boundedInt(threshold, SYNC_DEFAULTS.threshold, 1, 20);
    const confidence = boundedFloat(llmConfidence, SYNC_DEFAULTS.llmHideConfidence, 0, 1);
    const cap = boundedInt(monthlyCap, SYNC_DEFAULTS.maxLlmCallsPerMonth, 1, 50000);
    const customKeywords = keywords
      .split("\n")
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    const cleanModel = (model || "").trim() || SYNC_DEFAULTS.openaiModel;
    const cleanApiKey = (apiKey || "").trim();

    await Promise.all([
      chrome.storage.sync.set({
        enabled,
        threshold: t,
        customKeywords,
        filterSelfPromotion,
        llmEnabled,
        openaiModel: cleanModel,
        llmHideConfidence: confidence,
        maxLlmCallsPerMonth: cap,
      }),
      chrome.storage.local.set({ openaiApiKey: cleanApiKey }),
    ]);

    setThreshold(String(t));
    setLlmConfidence(confidence.toFixed(2));
    setMonthlyCap(String(cap));
    setModel(cleanModel);

    flashStatus("Saved");
    await refreshUsage();
  }

  async function clearCache(): Promise<void> {
    await chrome.runtime.sendMessage({ type: "CLEAR_CACHE" } satisfies RuntimeMessage);
    flashStatus("Cache cleared");
    await refreshUsage();
  }

  return (
    <main>
      <h1>AI Blocker for Reddit</h1>
      <p>Hybrid mode: local scoring first, OpenAI only for borderline posts.</p>

      <label class="row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled((e.target as HTMLInputElement).checked)}
        />
        <span>Enable blocker</span>
      </label>

      <label for="threshold">Local aggressiveness threshold (1-20)</label>
      <input
        id="threshold"
        type="number"
        min="1"
        max="20"
        value={threshold}
        onInput={(e) => setThreshold((e.target as HTMLInputElement).value)}
      />
      <p class="hint">Lower catches more locally. Borderline posts can be sent to OpenAI.</p>

      <label for="keywords">Extra keywords (one per line)</label>
      <textarea
        id="keywords"
        rows={6}
        placeholder="my product&#10;join my waitlist"
        value={keywords}
        onInput={(e) => setKeywords((e.target as HTMLTextAreaElement).value)}
      />

      <label class="row">
        <input
          type="checkbox"
          checked={filterSelfPromotion}
          onChange={(e) => setFilterSelfPromotion((e.target as HTMLInputElement).checked)}
        />
        <span>Filter self-promotion aggressively</span>
      </label>
      <p class="hint">
        When enabled, posts that are self promoting are much more likely to be hidden locally.
      </p>

      <section class="panel">
        <h2>OpenAI (Borderline Classifier)</h2>

        <label class="row">
          <input
            type="checkbox"
            checked={llmEnabled}
            onChange={(e) => setLlmEnabled((e.target as HTMLInputElement).checked)}
          />
          <span>Enable OpenAI on uncertain posts</span>
        </label>

        <label for="apiKey">OpenAI API key</label>
        <input
          id="apiKey"
          type="password"
          placeholder="sk-..."
          autocomplete="off"
          value={apiKey}
          onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
        />

        <label for="model">Model</label>
        <input
          id="model"
          type="text"
          placeholder="gpt-4o-mini"
          value={model}
          onInput={(e) => setModel((e.target as HTMLInputElement).value)}
        />

        <label for="llmConfidence">Hide confidence threshold (0.00-1.00)</label>
        <input
          id="llmConfidence"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={llmConfidence}
          onInput={(e) => setLlmConfidence((e.target as HTMLInputElement).value)}
        />

        <label for="monthlyCap">Monthly LLM call cap</label>
        <input
          id="monthlyCap"
          type="number"
          min="1"
          max="50000"
          value={monthlyCap}
          onInput={(e) => setMonthlyCap((e.target as HTMLInputElement).value)}
        />

        <div class="hint">{usage}</div>
        <button type="button" class="secondary" onClick={() => void clearCache()}>
          Clear LLM cache
        </button>
      </section>

      <button type="button" onClick={() => void save()}>
        Save
      </button>
      {status && <span role="status">{status}</span>}
    </main>
  );
}
