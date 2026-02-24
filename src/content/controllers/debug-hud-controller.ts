import { renderHud, type DebugHudModel } from "../ui/DebugHud";

export type { DebugHudModel };

function getDebugHudElement(): HTMLDivElement {
  let hud = document.getElementById("aiBlockerDebugHud") as HTMLDivElement | null;
  if (hud) return hud;

  hud = document.createElement("div");
  hud.id = "aiBlockerDebugHud";
  document.documentElement.appendChild(hud);
  return hud;
}

export function renderDebugHud(model: DebugHudModel): void {
  const hud = getDebugHudElement();
  renderHud(hud, model);
}
