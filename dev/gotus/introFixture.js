// Test telemetry for the real portal and real Web Audio graph. No production hooks.
export function installGotusIntroProbe(assetManager) {
  const frames = [], events = [];
  const seen = new WeakSet(), previous = new WeakMap();
  const audioNow = () => assetManager.getAudioOutput()?.ctx.currentTime ?? null;
  const sample = overlay => {
    if (!overlay?.matches?.(".gotus-intro")) return;
    const progress = Number(overlay.dataset.progress || 0), state = overlay.dataset.state;
    if (previous.get(overlay) === `${state}:${progress}`) return;
    previous.set(overlay, `${state}:${progress}`);
    const logo = overlay.querySelector(".gotus-intro__logo");
    frames.push({ wall: performance.now(), audio: audioNow(), state, progress,
      durationMs: Number(overlay.dataset.durationMs || 0), connected: overlay.isConnected,
      transform: logo?.style.transform || "", rect: logo?.getBoundingClientRect().toJSON() || null });
  };
  const find = node => node?.nodeType === Node.ELEMENT_NODE
    ? [node.matches(".gotus-intro") ? node : null, ...node.querySelectorAll(".gotus-intro")].filter(Boolean) : [];
  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes || []) for (const overlay of find(node)) {
        if (!seen.has(overlay)) { seen.add(overlay); events.push({ type: "mounted", wall: performance.now(), audio: audioNow() }); }
        sample(overlay);
      }
      if (record.type === "attributes") sample(record.target.closest(".gotus-intro"));
      for (const node of record.removedNodes || []) for (const overlay of find(node)) {
        sample(overlay); events.push({ type: "removed", wall: performance.now(), audio: audioNow() });
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ["data-progress", "data-state", "data-duration-ms", "style"] });
  return { frames, events, audioNow, prepared: () => !!assetManager.getSfxBuffer("gotus:intro"),
    reset: () => { frames.length = 0; events.length = 0; } };
}
