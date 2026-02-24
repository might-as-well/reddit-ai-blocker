const blockedCountEl = document.getElementById("blockedCount");
const keyStatusEl = document.getElementById("keyStatus");
const statusEl = document.getElementById("status");
const enabledToggleEl = document.getElementById("enabledToggle");
const filterSelfPromotionToggleEl = document.getElementById("filterSelfPromotionToggle");
const addKeyButtonEl = document.getElementById("addKeyButton");
const openOptionsEl = document.getElementById("openOptions");
const keyEditorEl = document.getElementById("keyEditor");
const apiKeyInputEl = document.getElementById("apiKeyInput");
const saveKeyEl = document.getElementById("saveKey");
const cancelKeyEl = document.getElementById("cancelKey");
const SYNC_DEFAULTS = {
    enabled: true,
    filterSelfPromotion: false
};
function setStatus(text) {
    statusEl.textContent = text;
    window.setTimeout(() => {
        if (statusEl.textContent === text)
            statusEl.textContent = "";
    }, 1800);
}
function renderKeyState(hasApiKey) {
    keyStatusEl.textContent = hasApiKey ? "OpenAI API key is saved locally." : "No OpenAI API key saved.";
    addKeyButtonEl.textContent = hasApiKey ? "Update OpenAI API key" : "+ Add OpenAI API key";
}
function renderBlockedCount(count) {
    blockedCountEl.textContent = String(Math.max(0, Math.floor(count)));
}
function renderToggleState(enabled, filterSelfPromotion) {
    enabledToggleEl.checked = enabled;
    filterSelfPromotionToggleEl.checked = filterSelfPromotion;
}
async function loadToggleState() {
    const saved = (await chrome.storage.sync.get(SYNC_DEFAULTS));
    renderToggleState(Boolean(saved.enabled ?? SYNC_DEFAULTS.enabled), Boolean(saved.filterSelfPromotion ?? SYNC_DEFAULTS.filterSelfPromotion));
}
async function setSyncToggle(key, value) {
    await chrome.storage.sync.set({ [key]: value });
}
async function loadPopupState() {
    const response = (await chrome.runtime.sendMessage({ type: "GET_POPUP_STATE" }));
    if (!response?.ok) {
        renderBlockedCount(0);
        renderKeyState(false);
        return;
    }
    renderBlockedCount(Number(response.blockedCount || 0));
    renderKeyState(Boolean(response.hasApiKey));
}
function openKeyEditor() {
    keyEditorEl.classList.remove("hidden");
    apiKeyInputEl.focus();
}
function closeKeyEditor() {
    keyEditorEl.classList.add("hidden");
    apiKeyInputEl.value = "";
}
async function saveApiKey() {
    const apiKey = apiKeyInputEl.value.trim();
    const response = (await chrome.runtime.sendMessage({
        type: "SET_OPENAI_API_KEY",
        apiKey
    }));
    if (!response?.ok) {
        setStatus("Could not save API key");
        return;
    }
    renderKeyState(Boolean(response.hasApiKey));
    closeKeyEditor();
    setStatus(response.hasApiKey ? "API key saved locally" : "API key cleared");
}
addKeyButtonEl.addEventListener("click", openKeyEditor);
enabledToggleEl.addEventListener("change", () => {
    void setSyncToggle("enabled", enabledToggleEl.checked);
});
filterSelfPromotionToggleEl.addEventListener("change", () => {
    void setSyncToggle("filterSelfPromotion", filterSelfPromotionToggleEl.checked);
});
saveKeyEl.addEventListener("click", () => {
    void saveApiKey();
});
cancelKeyEl.addEventListener("click", closeKeyEditor);
apiKeyInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        void saveApiKey();
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeKeyEditor();
    }
});
openOptionsEl.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
});
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
        if (changes.blockedCount)
            renderBlockedCount(Number(changes.blockedCount.newValue || 0));
        if (changes.openaiApiKey)
            renderKeyState(Boolean(String(changes.openaiApiKey.newValue || "").trim()));
        return;
    }
    if (area === "sync") {
        if (changes.enabled)
            enabledToggleEl.checked = Boolean(changes.enabled.newValue);
        if (changes.filterSelfPromotion) {
            filterSelfPromotionToggleEl.checked = Boolean(changes.filterSelfPromotion.newValue);
        }
    }
});
void Promise.all([loadPopupState(), loadToggleState()]);
export {};
