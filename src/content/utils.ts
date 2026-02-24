export function toKeywordList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).toLowerCase());
}

export function normalize(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashText(input: string): string {
  const text = String(input || "");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function getPermalinkPostIdFromPath(): string | null {
  const match = window.location.pathname.match(/\/comments\/([a-z0-9]+)\b/i);
  if (!match?.[1]) return null;
  return `t3_${match[1].toLowerCase()}`;
}

export function getElementPostId(postEl: Element): string | null {
  const htmlPost = postEl as HTMLElement;
  const candidates = [
    htmlPost.dataset.postId,
    htmlPost.getAttribute("post-id"),
    htmlPost.getAttribute("id"),
    htmlPost.getAttribute("data-fullname"),
  ];
  const raw = candidates.find(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.startsWith("t3_")) return normalized;
  return null;
}

export function isPrimaryPermalinkPost(postEl: Element): boolean {
  const permalinkPostId = getPermalinkPostIdFromPath();
  if (!permalinkPostId) return false;
  const elementPostId = getElementPostId(postEl);
  return elementPostId === permalinkPostId;
}

export function getPostText(postEl: Element): { raw: string; normalized: string } {
  const title =
    postEl.querySelector("h1, h2, h3, [slot='title']")?.textContent || "";
  const body = postEl.textContent || "";
  const richBody = (postEl as HTMLElement).innerText || body;
  const raw = `${title}\n${richBody}`.trim();
  return { raw, normalized: normalize(raw) };
}

export function countDomListItems(postEl: Element): number {
  return postEl.querySelectorAll("ul li, ol li").length;
}
