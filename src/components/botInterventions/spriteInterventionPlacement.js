import { computeInterventionPlacement } from "./spriteInterventionAnimation.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function getViewportBounds(viewport) {
  const left = (viewport.left || 0) + 8;
  const top = (viewport.top || 0) + 8;
  return {
    left,
    top,
    right: left + Math.max(1, viewport.width - 16),
    bottom: top + Math.max(1, viewport.height - 16),
  };
}

export function computeHostedInterventionLayout(rect, viewport, config, requestedWidth, characterHeightLimit = Infinity) {
  const bounds = getViewportBounds(viewport);
  const maxWidth = bounds.right - bounds.left;
  // Reserve the space above the action bar, including space above a short feed.
  const bottom = clamp(rect.top + rect.height - 6, bounds.top + 1, bounds.bottom);
  const maxHeight = bottom - bounds.top;
  const aspect = config.frameAspectRatio || 5 / 6;
  const fullHeight = Math.min(config.characterHeightPx || 190, characterHeightLimit, maxHeight);
  const fullWidth = (config.bubbleMaxWidthPx || 340) + fullHeight * aspect + 10;
  const width = clamp(requestedWidth ?? Math.min(rect.width - 12, fullWidth), Math.min(240, maxWidth), maxWidth);
  const stacked = width < 240 + Math.min(112, fullHeight) * aspect + 10;
  const characterHeight = stacked
    ? Math.min(100, fullHeight)
    : Math.min(fullHeight, (width - 250) / aspect);
  const characterWidth = characterHeight * aspect;
  return {
    width,
    maxWidth,
    maxHeight,
    stacked,
    characterWidth,
    characterHeight,
    bubbleWidth: stacked ? width : width - characterWidth - 10,
    bubbleBottom: stacked ? 0 : Math.round(characterHeight * 0.247),
  };
}

export function computeHostedInterventionPlacement(rect, viewport, surface) {
  const bounds = getViewportBounds(viewport);
  const bottom = clamp(rect.top + rect.height - 6, bounds.top + surface.height, bounds.bottom);
  const top = clamp(rect.top + 6, bounds.top, bottom - surface.height);
  return {
    anchorX: clamp(rect.left + rect.width / 2, bounds.left + surface.width / 2, bounds.right - surface.width / 2),
    anchorBottom: (viewport.layoutHeight ?? viewport.height) - top - surface.height,
    scale: 1,
  };
}

function fitHostedIntervention(layer, surface, rect, viewport, config) {
  const applyLayout = (layout) => {
    layer.dataset.hostedLayout = layout.stacked ? "stacked" : "beside";
    for (const [name, value] of Object.entries({
      width: layout.width,
      "bubble-width": layout.bubbleWidth,
      "bubble-bottom": layout.bubbleBottom,
      "character-width": layout.characterWidth,
      "character-height": layout.characterHeight,
    })) {
      layer.style.setProperty(`--sprite-intervention-hosted-${name}`, `${value}px`);
    }
  };
  let layout = computeHostedInterventionLayout(rect, viewport, config);
  applyLayout(layout);
  // The hidden full-text bubble measures the final height, even during typing.
  // A long message also gets a compact portrait before borrowing more width.
  let characterHeightLimit = Infinity;
  if (surface.offsetHeight > layout.maxHeight) {
    characterHeightLimit = 100;
    layout = computeHostedInterventionLayout(rect, viewport, config, undefined, characterHeightLimit);
    applyLayout(layout);
  }
  // Only expand outside the column when reflow is needed to keep all text visible.
  for (let attempt = 0; attempt < 4; attempt++) {
    const height = surface.offsetHeight;
    if (height <= layout.maxHeight || layout.width >= layout.maxWidth) break;
    const width = attempt === 3
      ? layout.maxWidth
      : Math.max(layout.width + 64, layout.width * height / layout.maxHeight);
    layout = computeHostedInterventionLayout(rect, viewport, config, width, characterHeightLimit);
    applyLayout(layout);
  }
  if (surface.offsetHeight > layout.maxHeight) {
    applyLayout(computeHostedInterventionLayout(rect, viewport, config, layout.maxWidth, 64));
  }
}

export function updateInterventionPlacement({ layer, surface, character, host, config, originRect }) {
  if (!layer || !surface) return;
  const viewport = { height: window.innerHeight, width: window.innerWidth };
  const hostRect = host?.element?.getBoundingClientRect?.();
  const hosted = host?.mode === "inside-top" && hostRect;
  let hostedViewport;
  if (hosted) {
    const visible = window.visualViewport;
    hostedViewport = {
      width: Math.min(viewport.width, visible?.width ?? viewport.width),
      height: Math.min(viewport.height, visible?.height ?? viewport.height),
      left: visible?.offsetLeft || 0,
      top: visible?.offsetTop || 0,
      layoutHeight: viewport.height,
    };
    fitHostedIntervention(layer, surface, hostRect, hostedViewport, config);
  } else {
    delete layer.dataset.hostedLayout;
  }
  // Layout dimensions stay stable throughout entry/exit animations and scaling.
  const placement = hosted
    ? computeHostedInterventionPlacement(hostRect, hostedViewport, {
        width: surface.offsetWidth,
        height: surface.offsetHeight,
      })
    : computeInterventionPlacement(hostRect, viewport, config);
  layer.style.setProperty("--sprite-intervention-scale", String(placement.scale ?? 1));
  layer.style.setProperty("--sprite-intervention-anchor-x", `${placement.anchorX}px`);
  layer.style.setProperty("--sprite-intervention-anchor-bottom", `${placement.anchorBottom}px`);

  if (!hosted) {
    const surfaceRect = surface.getBoundingClientRect();
    let adjustedBottom = placement.anchorBottom;
    if (surfaceRect.top < 8) {
      adjustedBottom = Math.max(8, adjustedBottom - (8 - surfaceRect.top));
    } else if (surfaceRect.bottom > viewport.height - 8) {
      adjustedBottom += surfaceRect.bottom - (viewport.height - 8);
    }
    layer.style.setProperty("--sprite-intervention-anchor-bottom", `${adjustedBottom}px`);
  }

  const characterRect = character?.getBoundingClientRect?.();
  if (originRect && characterRect?.height) {
    const scale = placement.scale || 1;
    layer.style.setProperty("--sprite-intervention-origin-x", `${
      (originRect.left + originRect.width / 2 - characterRect.left - characterRect.width / 2) / scale
    }px`);
    layer.style.setProperty("--sprite-intervention-origin-y", `${
      (originRect.top + originRect.height / 2 - characterRect.top - characterRect.height / 2) / scale
    }px`);
    layer.style.setProperty("--sprite-intervention-origin-scale", String(
      Math.max(0.18, Math.min(0.85, originRect.height / characterRect.height)),
    ));
  }
}

export function observeInterventionPlacement({ host, surface, update, viewport = window }) {
  let frame = null;
  const schedule = () => {
    if (frame !== null) return;
    frame = viewport.requestAnimationFrame(() => {
      frame = null;
      update();
    });
  };
  const observer = typeof viewport.ResizeObserver === "function"
    ? new viewport.ResizeObserver(schedule)
    : null;
  if (host) observer?.observe(host);
  if (surface) observer?.observe(surface);
  viewport.addEventListener("resize", schedule, { passive: true });
  viewport.addEventListener("scroll", schedule, { passive: true, capture: true });
  viewport.visualViewport?.addEventListener("resize", schedule, { passive: true });
  viewport.visualViewport?.addEventListener("scroll", schedule, { passive: true });
  return () => {
    observer?.disconnect();
    if (frame !== null) viewport.cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule, true);
    viewport.visualViewport?.removeEventListener("resize", schedule);
    viewport.visualViewport?.removeEventListener("scroll", schedule);
  };
}
