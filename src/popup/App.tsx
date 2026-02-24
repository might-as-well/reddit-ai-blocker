import * as preact from "preact";
import { useState, useEffect } from "preact/hooks";
import type { PopupStateResponse, RuntimeMessage, SetOpenAiApiKeyResponse } from "../types";

const SYNC_DEFAULTS = { enabled: true, filterSelfPromotion: false };

export default function App() {
  const [blockedCount, setBlockedCount] = useState(0);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [enabled, setEnabled] = useState(SYNC_DEFAULTS.enabled);
  const [filterSelfPromotion, setFilterSelfPromotion] = useState(SYNC_DEFAULTS.filterSelfPromotion);
  const [keyEditorOpen, setKeyEditorOpen] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    void loadPopupState();
    void loadToggleState();

    const handler = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local") {
        if (changes.blockedCount) {
          setBlockedCount(Math.max(0, Math.floor(Number(changes.blockedCount.newValue || 0))));
        }
        if (changes.openaiApiKey) {
          setHasApiKey(Boolean(String(changes.openaiApiKey.newValue || "").trim()));
        }
      }
      if (area === "sync") {
        if (changes.enabled) setEnabled(Boolean(changes.enabled.newValue));
        if (changes.filterSelfPromotion) {
          setFilterSelfPromotion(Boolean(changes.filterSelfPromotion.newValue));
        }
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, []);

  async function loadPopupState(): Promise<void> {
    const response = (await chrome.runtime.sendMessage(
      { type: "GET_POPUP_STATE" } satisfies RuntimeMessage,
    )) as PopupStateResponse;
    if (!response?.ok) return;
    setBlockedCount(Math.max(0, Math.floor(Number(response.blockedCount || 0))));
    setHasApiKey(Boolean(response.hasApiKey));
  }

  async function loadToggleState(): Promise<void> {
    const saved = (await chrome.storage.sync.get(SYNC_DEFAULTS)) as Partial<typeof SYNC_DEFAULTS>;
    setEnabled(Boolean(saved.enabled ?? SYNC_DEFAULTS.enabled));
    setFilterSelfPromotion(Boolean(saved.filterSelfPromotion ?? SYNC_DEFAULTS.filterSelfPromotion));
  }

  function flashStatus(text: string): void {
    setStatus(text);
    window.setTimeout(() => setStatus((prev) => (prev === text ? "" : prev)), 1800);
  }

  async function saveApiKey(): Promise<void> {
    const response = (await chrome.runtime.sendMessage({
      type: "SET_OPENAI_API_KEY",
      apiKey: apiKeyInput.trim(),
    } satisfies RuntimeMessage)) as SetOpenAiApiKeyResponse;

    if (!response?.ok) {
      flashStatus("Could not save API key");
      return;
    }

    setHasApiKey(Boolean(response.hasApiKey));
    setKeyEditorOpen(false);
    setApiKeyInput("");
    flashStatus(response.hasApiKey ? "API key saved locally" : "API key cleared");
  }

  function handleToggleEnabled(e: Event): void {
    const val = (e.target as HTMLInputElement).checked;
    setEnabled(val);
    void chrome.storage.sync.set({ enabled: val });
  }

  function handleToggleFilterSelfPromotion(e: Event): void {
    const val = (e.target as HTMLInputElement).checked;
    setFilterSelfPromotion(val);
    void chrome.storage.sync.set({ filterSelfPromotion: val });
  }

  return (
    <main class="panel">
      <h1>AI Blocker</h1>
      <p class="counter">
        Blocked posts: <span>{Math.max(0, Math.floor(blockedCount))}</span>
      </p>

      <section class="toggle-group" aria-label="Quick toggles">
        <label class="toggle-row" for="enabledToggle">
          <span>Enabled</span>
          <input
            id="enabledToggle"
            type="checkbox"
            checked={enabled}
            onChange={handleToggleEnabled}
          />
        </label>
        <label class="toggle-row" for="filterSelfPromotionToggle">
          <span>Filter self-promotional posts</span>
          <input
            id="filterSelfPromotionToggle"
            type="checkbox"
            checked={filterSelfPromotion}
            onChange={handleToggleFilterSelfPromotion}
          />
        </label>
      </section>

      <p class="muted">
        {hasApiKey ? "OpenAI API key is saved locally." : "No OpenAI API key saved."}
      </p>

      <div class="actions">
        <button type="button" onClick={() => setKeyEditorOpen(true)}>
          {hasApiKey ? "Update OpenAI API key" : "+ Add OpenAI API key"}
        </button>
        <button
          type="button"
          class="secondary"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          More settings
        </button>
      </div>

      {keyEditorOpen && (
        <section class="key-editor">
          <h2>OpenAI API key</h2>
          <label for="apiKeyInput">Paste key</label>
          <input
            id="apiKeyInput"
            type="password"
            placeholder="sk-..."
            autocomplete="off"
            value={apiKeyInput}
            onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveApiKey();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setKeyEditorOpen(false);
                setApiKeyInput("");
              }
            }}
          />
          <p class="muted">Stored only in local extension storage.</p>
          <div class="actions">
            <button type="button" onClick={() => void saveApiKey()}>
              Save
            </button>
            <button
              type="button"
              class="secondary"
              onClick={() => {
                setKeyEditorOpen(false);
                setApiKeyInput("");
              }}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {status && (
        <p class="status" role="status">
          {status}
        </p>
      )}
    </main>
  );
}
