namespace AiBlockerUi {
  const PLACEHOLDER_TEMPLATE_ID = "ai-blocker-placeholder-template";
  const PLACEHOLDER_TEMPLATE_FILE = "templates/placeholder.html";
  const DEBUG_HUD_TEMPLATE_ID = "ai-blocker-debug-hud-template";
  const DEBUG_HUD_TEMPLATE_FILE = "templates/debug-hud.html";

  export interface PlaceholderMeta {
    score?: number;
    source: "local" | "llm";
    confidence?: number;
    reason?: string;
  }

  export interface PlaceholderHandle {
    wrapper: HTMLDivElement;
    toggleButton: HTMLButtonElement;
  }

  export interface DebugHudModel {
    enabled: boolean;
    llmEnabled: boolean;
    scans: number;
    candidates: number;
    checked: number;
    hiddenLocal: number;
    hiddenLlm: number;
    llmRequests: number;
    llmApiCalls: number;
    llmCacheHits: number;
    llmErrors: number;
    last: string;
  }

  async function loadTemplateFromFile(templateFile: string, templateId: string): Promise<void> {
    if (document.getElementById(templateId)) return;

    try {
      const response = await fetch(chrome.runtime.getURL(templateFile));
      if (!response.ok) return;

      const html = await response.text();
      const parsed = new DOMParser().parseFromString(html, "text/html");
      const template = parsed.querySelector(`#${templateId}`) as HTMLTemplateElement | null;
      if (!template) return;

      document.documentElement.appendChild(document.importNode(template, true));
    } catch {
      // Keep behavior unchanged: proceed without throwing.
    }
  }

  export async function ensurePlaceholderTemplateLoaded(): Promise<void> {
    await loadTemplateFromFile(PLACEHOLDER_TEMPLATE_FILE, PLACEHOLDER_TEMPLATE_ID);
  }

  export async function ensureDebugHudTemplateLoaded(): Promise<void> {
    await loadTemplateFromFile(DEBUG_HUD_TEMPLATE_FILE, DEBUG_HUD_TEMPLATE_ID);
  }

  function getPlaceholderTemplate(): HTMLTemplateElement {
    const existing = document.getElementById(PLACEHOLDER_TEMPLATE_ID) as HTMLTemplateElement | null;
    if (!existing) {
      throw new Error(`Missing template: ${PLACEHOLDER_TEMPLATE_ID}`);
    }
    return existing;
  }

  export function renderPlaceholderContent(wrapper: HTMLDivElement, meta: PlaceholderMeta): void {
    const details: string[] = [];
    details.push(`source: ${meta.source}`);
    if (typeof meta.score === "number") details.push(`score: ${meta.score}`);
    if (typeof meta.confidence === "number") details.push(`confidence: ${meta.confidence.toFixed(2)}`);

    const detailsEl = wrapper.querySelector(".ai-blocker-placeholder-details") as HTMLSpanElement | null;
    const reasonEl = wrapper.querySelector(".ai-blocker-placeholder-reason") as HTMLDivElement | null;
    if (detailsEl) detailsEl.textContent = `(${details.join(" | ")})`;
    if (reasonEl) reasonEl.textContent = meta.reason || "Likely AI/self-promotional post";
  }

  function createFallbackPlaceholder(meta: PlaceholderMeta): PlaceholderHandle {
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

  function getToggleParts(toggleButton: HTMLButtonElement): {
    caret: HTMLSpanElement;
    label: HTMLSpanElement;
  } {
    let caret = toggleButton.querySelector(".caret") as HTMLSpanElement | null;
    if (!caret) {
      caret = document.createElement("span");
      caret.className = "caret";
      caret.setAttribute("aria-hidden", "true");
      caret.textContent = "▶";
      toggleButton.prepend(caret);
    }

    let label = toggleButton.querySelector(".ai-blocker-placeholder-toggle-label") as HTMLSpanElement | null;
    if (!label) {
      label = document.createElement("span");
      label.className = "ai-blocker-placeholder-toggle-label";
      label.textContent = "Show";
      toggleButton.appendChild(label);
    }

    return { caret, label };
  }

  export function createPlaceholder(meta: PlaceholderMeta): PlaceholderHandle {
    const template = getPlaceholderTemplate();
    const wrapper = template.content.firstElementChild?.cloneNode(true) as HTMLDivElement | null;
    if (!wrapper) return createFallbackPlaceholder(meta);

    renderPlaceholderContent(wrapper, meta);

    const toggleButton = wrapper.querySelector(".ai-blocker-placeholder-toggle") as HTMLButtonElement | null;
    if (!toggleButton) {
      const created = document.createElement("button");
      created.type = "button";
      created.className = "ai-blocker-placeholder-toggle";
      wrapper.appendChild(created);
      return { wrapper, toggleButton: created };
    }

    return { wrapper, toggleButton };
  }

  export function setPlaceholderState(wrapper: HTMLDivElement, toggleButton: HTMLButtonElement, isHidden: boolean): void {
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

  export function getContiguousPlaceholdersBefore(postEl: HTMLElement): HTMLDivElement[] {
    const placeholders: HTMLDivElement[] = [];
    let sibling = postEl.previousElementSibling as HTMLElement | null;
    while (sibling && sibling.classList.contains("ai-blocker-placeholder")) {
      placeholders.push(sibling as HTMLDivElement);
      sibling = sibling.previousElementSibling as HTMLElement | null;
    }
    return placeholders;
  }

  function getDebugHudElement(): HTMLDivElement {
    let hud = document.getElementById("aiBlockerDebugHud") as HTMLDivElement | null;
    if (hud) return hud;

    const template = document.getElementById(DEBUG_HUD_TEMPLATE_ID) as HTMLTemplateElement | null;
    if (template?.content?.firstElementChild) {
      hud = template.content.firstElementChild.cloneNode(true) as HTMLDivElement;
      document.documentElement.appendChild(hud);
      return hud;
    }

    hud = document.createElement("div");
    hud.id = "aiBlockerDebugHud";
    document.documentElement.appendChild(hud);
    return hud;
  }

  export function renderDebugHud(model: DebugHudModel): void {
    const hud = getDebugHudElement();
    hud.textContent =
      `AI Blocker debug | enabled=${model.enabled ? "yes" : "no"} | llm=${model.llmEnabled ? "on" : "off"} | scans=${model.scans} | ` +
      `candidates=${model.candidates} | checked=${model.checked} | ` +
      `hidden(local=${model.hiddenLocal}, llm=${model.hiddenLlm}) | ` +
      `llm(req=${model.llmRequests}, api=${model.llmApiCalls}, cache=${model.llmCacheHits}, err=${model.llmErrors}) | ${model.last}`;
  }
}
