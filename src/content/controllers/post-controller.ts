import type { HideMeta } from "../scoring/config";
import {
  createWrapper,
  renderPlaceholder,
  type PlaceholderMeta,
} from "../ui/Placeholder";

export interface PlaceholderHandle {
  wrapper: HTMLDivElement;
}

export interface HideCallbacks {
  onHidden?: (source: HideMeta["source"]) => void;
  onIncrementBlocked?: () => void;
}

// ── Placeholder DOM insertion ────────────────────────────────────────────────

const handleByPost = new WeakMap<HTMLElement, PlaceholderHandle>();

function getPostMarker(postEl: HTMLElement): string {
  return postEl.dataset.postId || postEl.getAttribute("id") || "";
}

function markWrapper(wrapper: HTMLDivElement, postEl: HTMLElement): void {
  const marker = getPostMarker(postEl);
  if (marker) wrapper.dataset.aiBlockerFor = marker;
}

function findExistingWrapper(postEl: HTMLElement): HTMLDivElement | null {
  const previous = postEl.previousElementSibling as HTMLElement | null;
  if (!previous || !previous.classList.contains("ai-blocker-placeholder")) {
    return null;
  }

  const marker = getPostMarker(postEl);
  if (!marker) return previous as HTMLDivElement;

  if (!previous.dataset.aiBlockerFor || previous.dataset.aiBlockerFor === marker) {
    return previous as HTMLDivElement;
  }

  return null;
}

function createHandleFromExisting(wrapper: HTMLDivElement): PlaceholderHandle {
  return { wrapper };
}

function createPlaceholder(meta: PlaceholderMeta): PlaceholderHandle {
  const wrapper = createWrapper();
  renderPlaceholderState(wrapper, meta, true, () => undefined);
  return { wrapper };
}

function ensureHandle(postEl: HTMLElement, meta: PlaceholderMeta): PlaceholderHandle {
  const cached = handleByPost.get(postEl);
  if (cached?.wrapper?.isConnected) {
    return cached;
  }

  const existingWrapper = findExistingWrapper(postEl);
  const handle = existingWrapper
    ? createHandleFromExisting(existingWrapper)
    : createPlaceholder(meta);

  if (!existingWrapper) {
    postEl.insertAdjacentElement("beforebegin", handle.wrapper);
  }

  markWrapper(handle.wrapper, postEl);
  handleByPost.set(postEl, handle);
  return handle;
}

// ── Placeholder state rendering ──────────────────────────────────────────────

function renderPlaceholderState(
  wrapper: HTMLDivElement,
  meta: PlaceholderMeta,
  isHidden: boolean,
  onToggle: () => void,
): void {
  renderPlaceholder(wrapper, { meta, isHidden, onToggle });
}

export function renderState(
  postEl: HTMLElement,
  meta: PlaceholderMeta,
  isHidden: boolean,
): void {
  const handle = ensureHandle(postEl, meta);
  renderPlaceholderState(handle.wrapper, meta, isHidden, () => {
    const nextHidden = postEl.dataset.aiBlockerHidden !== "1";
    if (nextHidden) {
      postEl.classList.add("ai-blocker-hidden");
      postEl.dataset.aiBlockerHidden = "1";
    } else {
      postEl.classList.remove("ai-blocker-hidden");
      postEl.dataset.aiBlockerHidden = "0";
    }
    renderState(postEl, meta, nextHidden);
  });
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

// ── Post visibility controls ─────────────────────────────────────────────────

export function setDebugLabel(postEl: Element, text: string): void {
  const htmlPost = postEl as HTMLElement;
  let label = htmlPost.querySelector(
    ":scope > .ai-blocker-debug-label",
  ) as HTMLDivElement | null;
  if (!label) {
    label = document.createElement("div");
    label.className = "ai-blocker-debug-label";
    htmlPost.prepend(label);
  }
  label.textContent = `AI Blocker debug: ${text}`;
}

export function clearLikelyAiFlag(postEl: Element): void {
  const htmlPost = postEl as HTMLElement;
  const existing = htmlPost.querySelector(":scope > .ai-blocker-likely-flag");
  if (existing) existing.remove();
}

export function setLikelyAiFlag(postEl: Element, text = "Likely AI"): void {
  const htmlPost = postEl as HTMLElement;
  let flag = htmlPost.querySelector(
    ":scope > .ai-blocker-likely-flag",
  ) as HTMLDivElement | null;
  if (!flag) {
    flag = document.createElement("div");
    flag.className = "ai-blocker-likely-flag";
    htmlPost.prepend(flag);
  }
  flag.textContent = text;
}

export function hidePost(
  postEl: Element,
  meta: HideMeta,
  callbacks: HideCallbacks = {},
): void {
  const htmlPost = postEl as HTMLElement;
  if (htmlPost.dataset.aiBlockerHidden === "1") return;

  htmlPost.dataset.aiBlockerHidden = "1";
  htmlPost.classList.add("ai-blocker-hidden");
  renderState(htmlPost, meta, true);

  callbacks.onHidden?.(meta.source);

  if (htmlPost.dataset.aiBlockerCounted !== "1") {
    htmlPost.dataset.aiBlockerCounted = "1";
    callbacks.onIncrementBlocked?.();
  }
}
