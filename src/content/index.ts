import { DEFAULTS, DEFAULTS_RECORD, type RuntimeConfig } from "./scoring/config";
import { toKeywordList } from "./utils";
import { setConfig, scheduleScan } from "./controllers/scan-controller";

async function loadConfig(): Promise<RuntimeConfig> {
  const saved = (await chrome.storage.sync.get(DEFAULTS_RECORD)) as Partial<RuntimeConfig>;
  return {
    enabled: Boolean(saved.enabled),
    threshold: Number(saved.threshold || DEFAULTS.threshold),
    customKeywords: toKeywordList(saved.customKeywords),
    filterSelfPromotion: Boolean(saved.filterSelfPromotion),
    llmEnabled: Boolean(saved.llmEnabled),
  };
}

async function init(): Promise<void> {
  let config = await loadConfig();
  setConfig(config);
  scheduleScan();

  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.enabled) config = { ...config, enabled: Boolean(changes.enabled.newValue) };
    if (changes.threshold) config = { ...config, threshold: Number(changes.threshold.newValue || DEFAULTS.threshold) };
    if (changes.customKeywords) config = { ...config, customKeywords: toKeywordList(changes.customKeywords.newValue) };
    if (changes.filterSelfPromotion) config = { ...config, filterSelfPromotion: Boolean(changes.filterSelfPromotion.newValue) };
    if (changes.llmEnabled) config = { ...config, llmEnabled: Boolean(changes.llmEnabled.newValue) };

    setConfig(config);
    scheduleScan({ reset: true });
  });
}

void init();
