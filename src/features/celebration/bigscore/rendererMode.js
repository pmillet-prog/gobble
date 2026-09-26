// Temporary, per-page A/B switch. The production default remains the CSS renderer.
export function getBigscoreRendererMode(search = globalThis.location?.search || "") {
  return new URLSearchParams(search).get("bigscoreRenderer") === "pixi" ? "pixi" : "dom";
}
