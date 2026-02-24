import * as preact from "preact";
import { render } from "preact";

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

interface DebugHudProps {
  model: DebugHudModel;
}

function DebugHudText({ model }: DebugHudProps) {
  const text =
    `AI Blocker debug | enabled=${model.enabled ? "yes" : "no"} | llm=${model.llmEnabled ? "on" : "off"} | scans=${model.scans} | ` +
    `candidates=${model.candidates} | checked=${model.checked} | ` +
    `hidden(local=${model.hiddenLocal}, llm=${model.hiddenLlm}) | ` +
    `llm(req=${model.llmRequests}, api=${model.llmApiCalls}, cache=${model.llmCacheHits}, err=${model.llmErrors}) | ${model.last}`;

  return <span>{text}</span>;
}

export function renderHud(hud: HTMLDivElement, model: DebugHudModel): void {
  render(<DebugHudText model={model} />, hud);
}
