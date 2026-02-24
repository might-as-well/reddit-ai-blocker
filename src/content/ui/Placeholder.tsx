import * as preact from "preact";
import { render } from "preact";

export interface PlaceholderMeta {
  score?: number;
  source: "local" | "llm";
  confidence?: number;
  reason?: string;
}

interface PlaceholderViewProps {
  meta: PlaceholderMeta;
  isHidden: boolean;
  onToggle: () => void;
}

function PlaceholderView({ meta, isHidden, onToggle }: PlaceholderViewProps) {
  const details: string[] = [];
  details.push(`source: ${meta.source}`);
  if (typeof meta.score === "number") details.push(`score: ${meta.score}`);
  if (typeof meta.confidence === "number") {
    details.push(`confidence: ${meta.confidence.toFixed(2)}`);
  }

  return (
    <>
      <div class="ai-blocker-placeholder-content">
        <strong class="ai-blocker-placeholder-title">Hidden by AI Blocker</strong>
        <span class="ai-blocker-placeholder-details">({details.join(" | ")})</span>
        <div class="ai-blocker-placeholder-reason">
          {meta.reason || "Likely AI/self-promotional post"}
        </div>
      </div>
      <button type="button" class="ai-blocker-placeholder-toggle" onClick={onToggle}>
        <span class={isHidden ? "caret" : "caret open"} aria-hidden="true">
          ▶
        </span>
        <span class="ai-blocker-placeholder-toggle-label">{isHidden ? "Show" : "Hide"}</span>
      </button>
    </>
  );
}

export function createWrapper(): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "ai-blocker-placeholder";
  return wrapper;
}

export function renderPlaceholder(
  wrapper: HTMLDivElement,
  props: PlaceholderViewProps,
): void {
  render(<PlaceholderView {...props} />, wrapper);
  if (props.isHidden) {
    wrapper.classList.remove("ai-blocker-placeholder-previewing");
    return;
  }
  wrapper.classList.add("ai-blocker-placeholder-previewing");
}
