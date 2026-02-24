"use strict";
var AiBlockerUi;
(function (AiBlockerUi) {
    const PLACEHOLDER_TEMPLATE_ID = "ai-blocker-placeholder-template";
    const PLACEHOLDER_TEMPLATE_FILE = "templates/placeholder.html";
    const DEBUG_HUD_TEMPLATE_ID = "ai-blocker-debug-hud-template";
    const DEBUG_HUD_TEMPLATE_FILE = "templates/debug-hud.html";
    function getUhtml() {
        const value = globalThis.uhtml;
        if (!value || typeof value.html !== "function" || typeof value.render !== "function") {
            return null;
        }
        return value;
    }
    async function loadTemplateFromFile(templateFile, templateId) {
        if (document.getElementById(templateId))
            return;
        try {
            const response = await fetch(chrome.runtime.getURL(templateFile));
            if (!response.ok)
                return;
            const html = await response.text();
            const parsed = new DOMParser().parseFromString(html, "text/html");
            const template = parsed.querySelector(`#${templateId}`);
            if (!template)
                return;
            document.documentElement.appendChild(document.importNode(template, true));
        }
        catch {
            // Keep behavior unchanged: proceed without throwing.
        }
    }
    async function ensurePlaceholderTemplateLoaded() {
        await loadTemplateFromFile(PLACEHOLDER_TEMPLATE_FILE, PLACEHOLDER_TEMPLATE_ID);
    }
    AiBlockerUi.ensurePlaceholderTemplateLoaded = ensurePlaceholderTemplateLoaded;
    async function ensureDebugHudTemplateLoaded() {
        await loadTemplateFromFile(DEBUG_HUD_TEMPLATE_FILE, DEBUG_HUD_TEMPLATE_ID);
    }
    AiBlockerUi.ensureDebugHudTemplateLoaded = ensureDebugHudTemplateLoaded;
    function getPlaceholderTemplate() {
        const existing = document.getElementById(PLACEHOLDER_TEMPLATE_ID);
        if (!existing) {
            throw new Error(`Missing template: ${PLACEHOLDER_TEMPLATE_ID}`);
        }
        return existing;
    }
    function renderPlaceholderContent(wrapper, meta) {
        const details = [];
        details.push(`source: ${meta.source}`);
        if (typeof meta.score === "number")
            details.push(`score: ${meta.score}`);
        if (typeof meta.confidence === "number")
            details.push(`confidence: ${meta.confidence.toFixed(2)}`);
        const uhtml = getUhtml();
        const contentEl = wrapper.querySelector(".ai-blocker-placeholder-content");
        if (uhtml && contentEl) {
            const { html, render } = uhtml;
            render(contentEl, html `<strong class="ai-blocker-placeholder-title">Hidden by AI Blocker</strong>
          <span class="ai-blocker-placeholder-details">(${details.join(" | ")})</span>
          <div class="ai-blocker-placeholder-reason">${meta.reason || "Likely AI/self-promotional post"}</div>`);
            return;
        }
        const detailsEl = wrapper.querySelector(".ai-blocker-placeholder-details");
        const reasonEl = wrapper.querySelector(".ai-blocker-placeholder-reason");
        if (detailsEl)
            detailsEl.textContent = `(${details.join(" | ")})`;
        if (reasonEl)
            reasonEl.textContent = meta.reason || "Likely AI/self-promotional post";
    }
    AiBlockerUi.renderPlaceholderContent = renderPlaceholderContent;
    function createFallbackPlaceholder(meta) {
        const wrapper = document.createElement("div");
        wrapper.className = "ai-blocker-placeholder";
        const title = document.createElement("strong");
        title.className = "ai-blocker-placeholder-title";
        title.textContent = "Hidden by AI Blocker";
        wrapper.appendChild(title);
        const details = document.createElement("span");
        details.className = "ai-blocker-placeholder-details";
        wrapper.appendChild(details);
        const reason = document.createElement("div");
        reason.className = "ai-blocker-placeholder-reason";
        wrapper.appendChild(reason);
        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = "ai-blocker-placeholder-toggle";
        const caret = document.createElement("span");
        caret.className = "caret";
        caret.setAttribute("aria-hidden", "true");
        caret.textContent = "▶";
        toggleButton.appendChild(caret);
        const label = document.createElement("span");
        label.className = "ai-blocker-placeholder-toggle-label";
        label.textContent = "Show";
        toggleButton.appendChild(label);
        wrapper.appendChild(toggleButton);
        renderPlaceholderContent(wrapper, meta);
        return { wrapper, toggleButton };
    }
    function getToggleParts(toggleButton) {
        let caret = toggleButton.querySelector(".caret");
        if (!caret) {
            caret = document.createElement("span");
            caret.className = "caret";
            caret.setAttribute("aria-hidden", "true");
            caret.textContent = "▶";
            toggleButton.prepend(caret);
        }
        let label = toggleButton.querySelector(".ai-blocker-placeholder-toggle-label");
        if (!label) {
            label = document.createElement("span");
            label.className = "ai-blocker-placeholder-toggle-label";
            label.textContent = "Show";
            toggleButton.appendChild(label);
        }
        return { caret, label };
    }
    function createPlaceholder(meta) {
        const template = getPlaceholderTemplate();
        const wrapper = template.content.firstElementChild?.cloneNode(true);
        if (!wrapper)
            return createFallbackPlaceholder(meta);
        renderPlaceholderContent(wrapper, meta);
        const toggleButton = wrapper.querySelector(".ai-blocker-placeholder-toggle");
        if (!toggleButton) {
            const created = document.createElement("button");
            created.type = "button";
            created.className = "ai-blocker-placeholder-toggle";
            wrapper.appendChild(created);
            return { wrapper, toggleButton: created };
        }
        return { wrapper, toggleButton };
    }
    AiBlockerUi.createPlaceholder = createPlaceholder;
    function setPlaceholderState(wrapper, toggleButton, isHidden) {
        const { caret, label } = getToggleParts(toggleButton);
        if (isHidden) {
            wrapper.classList.remove("ai-blocker-placeholder-previewing");
            caret.classList.remove("open");
            label.textContent = "Show";
            return;
        }
        wrapper.classList.add("ai-blocker-placeholder-previewing");
        caret.classList.add("open");
        label.textContent = "Hide";
    }
    AiBlockerUi.setPlaceholderState = setPlaceholderState;
    function getContiguousPlaceholdersBefore(postEl) {
        const placeholders = [];
        let sibling = postEl.previousElementSibling;
        while (sibling && sibling.classList.contains("ai-blocker-placeholder")) {
            placeholders.push(sibling);
            sibling = sibling.previousElementSibling;
        }
        return placeholders;
    }
    AiBlockerUi.getContiguousPlaceholdersBefore = getContiguousPlaceholdersBefore;
    function getDebugHudElement() {
        let hud = document.getElementById("aiBlockerDebugHud");
        if (hud)
            return hud;
        const template = document.getElementById(DEBUG_HUD_TEMPLATE_ID);
        if (template?.content?.firstElementChild) {
            hud = template.content.firstElementChild.cloneNode(true);
            document.documentElement.appendChild(hud);
            return hud;
        }
        hud = document.createElement("div");
        hud.id = "aiBlockerDebugHud";
        document.documentElement.appendChild(hud);
        return hud;
    }
    function renderDebugHud(model) {
        const hud = getDebugHudElement();
        const text = `AI Blocker debug | enabled=${model.enabled ? "yes" : "no"} | llm=${model.llmEnabled ? "on" : "off"} | scans=${model.scans} | ` +
            `candidates=${model.candidates} | checked=${model.checked} | ` +
            `hidden(local=${model.hiddenLocal}, llm=${model.hiddenLlm}) | ` +
            `llm(req=${model.llmRequests}, api=${model.llmApiCalls}, cache=${model.llmCacheHits}, err=${model.llmErrors}) | ${model.last}`;
        const uhtml = getUhtml();
        if (!uhtml) {
            hud.textContent = text;
            return;
        }
        const { html, render } = uhtml;
        render(hud, html `${text}`);
    }
    AiBlockerUi.renderDebugHud = renderDebugHud;
})(AiBlockerUi || (AiBlockerUi = {}));
