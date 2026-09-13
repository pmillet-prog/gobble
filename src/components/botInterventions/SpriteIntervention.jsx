import React from "react";
import { createPortal } from "react-dom";

import AssetManager from "../../assets/assetManager.js";
import { SFX_KEYS } from "../../assets/assetKeys.js";
import {
  buildInterventionTextSegments,
  getInterventionFramePosition,
  getInterventionTypingDelay,
  getNextPresenterHitReaction,
  isInterventionForActiveRound,
  randomIntegerBetween,
  resolveInterventionAppearanceSfxKey,
  schedulePresenterHitExit,
  splitInterventionText,
} from "./spriteInterventionAnimation.js";
import { observeInterventionPlacement, updateInterventionPlacement } from "./spriteInterventionPlacement.js";
import "./SpriteIntervention.css";

const spritePreloadPromises = new Map();
const PRESENTER_PUNCH_KEYS = Object.freeze([
  SFX_KEYS.presenterPunch1,
  SFX_KEYS.presenterPunch2,
  SFX_KEYS.presenterPunch3,
  SFX_KEYS.presenterPunch4,
  SFX_KEYS.presenterPunch5,
]);
export { PRESENTER_HIT_IDLE_MS } from "./spriteInterventionAnimation.js";
export const PRESENTER_HANDOFF_EXIT_MS = 180;

function getReactionAssets(config) {
  if (config?.reactionUrls) return config.reactionUrls;
  const key = String(config?.key || "").trim();
  if (!key) return {};
  return {
    hit1: `/bots/${key}-hit-1.webp`,
    hit2: `/bots/${key}-hit-2.webp`,
    stars: `/bots/${key}-stars.webp`,
  };
}

function getCharacterAssets(config) {
  const frameUrls = Array.isArray(config?.frameUrls)
    ? config.frameUrls.filter(Boolean)
    : [];
  return frameUrls.length ? frameUrls : [config?.spriteUrl].filter(Boolean);
}

function getCharacterFrameUrl(config, frame) {
  const frameUrls = Array.isArray(config?.frameUrls) ? config.frameUrls : [];
  if (!frameUrls.length) return String(config?.spriteUrl || "");
  const safeFrame = Math.min(
    frameUrls.length - 1,
    Math.max(0, Math.trunc(Number(frame) || 0))
  );
  return String(frameUrls[safeFrame] || frameUrls[0] || "");
}

function mountTypedText(container, text, highlights) {
  if (!container || typeof document === "undefined") {
    return { units: [], revealAll() {} };
  }
  container.replaceChildren();
  const units = [];
  const writers = [];
  for (const segment of buildInterventionTextSegments(text, highlights)) {
    const element = document.createElement("span");
    if (segment.highlighted) element.className = "sprite-intervention-highlight";
    const textNode = document.createTextNode("");
    element.append(textNode);
    container.append(element);
    const writer = { fullText: segment.text, node: textNode };
    writers.push(writer);
    for (const unit of splitInterventionText(segment.text)) {
      units.push({ unit, writer });
    }
  }
  return {
    units,
    revealAll() {
      for (const writer of writers) writer.node.data = writer.fullText;
    },
  };
}

export function preloadInterventionSprite(spriteUrl) {
  const url = String(spriteUrl || "");
  if (!url || typeof Image === "undefined") return Promise.resolve();
  const existing = spritePreloadPromises.get(url);
  if (existing) return existing;
  const promise = new Promise((resolve) => {
    const image = new Image();
    const finish = () => resolve();
    image.onload = () => {
      if (typeof image.decode === "function") {
        image.decode().catch(() => {}).finally(finish);
        return;
      }
      finish();
    };
    image.onerror = finish;
    image.src = url;
    if (image.complete) finish();
  });
  spritePreloadPromises.set(url, promise);
  return promise;
}

function SpriteIntervention({
  config,
  enabled = false,
  animated = enabled,
  hostRef,
  manualController = null,
  placementController = manualController,
  manualKey = "",
  onManualActivation = null,
  onPresentationComplete = null,
  queueWhileDisabled = false,
  phaseKey = "",
  roundId = null,
  subscribeInterventions,
}) {
  const [intervention, setIntervention] = React.useState(null);
  const [phase, setPhase] = React.useState("hidden");
  const [reaction, setReaction] = React.useState(null);
  const layerRef = React.useRef(null);
  const surfaceRef = React.useRef(null);
  const spriteRef = React.useRef(null);
  const textRef = React.useRef(null);
  const timerIdsRef = React.useRef(new Set());
  const pendingSequenceRef = React.useRef(0);
  const queuedInterventionRef = React.useRef(null);
  const latestInterventionRef = React.useRef(null);
  const activePresentationRef = React.useRef(null);
  const completedPresentationKeysRef = React.useRef(new Set());
  const completedRoundIdRef = React.useRef(roundId);
  const onPresentationCompleteRef = React.useRef(onPresentationComplete);
  const nextHitRef = React.useRef(0);
  const stunnedRef = React.useRef(false);
  const enabledRef = React.useRef(enabled);
  const roundIdRef = React.useRef(roundId);
  enabledRef.current = enabled;
  roundIdRef.current = roundId;
  onPresentationCompleteRef.current = onPresentationComplete;
  const manualMode = !!manualController && !!manualKey;

  const completePresentation = React.useCallback((event = null) => {
    const completedEvent = event || activePresentationRef.current;
    if (!completedEvent?.text) return;
    const completionKey = String(
      completedEvent.id ||
        `${completedEvent.roundId || ""}:${completedEvent.text}`
    );
    if (completedPresentationKeysRef.current.has(completionKey)) {
      if (
        activePresentationRef.current === completedEvent ||
        activePresentationRef.current?.id === completedEvent.id
      ) {
        activePresentationRef.current = null;
      }
      return;
    }
    completedPresentationKeysRef.current.add(completionKey);
    if (
      activePresentationRef.current === completedEvent ||
      activePresentationRef.current?.id === completedEvent.id
    ) {
      activePresentationRef.current = null;
    }
    onPresentationCompleteRef.current?.(completedEvent);
  }, []);

  React.useLayoutEffect(() => {
    if (manualMode) manualController.setScope(roundId, phaseKey);
  }, [manualController, manualMode, phaseKey, roundId]);

  const clearTimers = React.useCallback(() => {
    for (const timerId of timerIdsRef.current) clearTimeout(timerId);
    timerIdsRef.current.clear();
  }, []);

  const schedule = React.useCallback((callback, delayMs) => {
    const timerId = setTimeout(() => {
      timerIdsRef.current.delete(timerId);
      callback();
    }, Math.max(0, Number(delayMs) || 0));
    timerIdsRef.current.add(timerId);
    return timerId;
  }, []);

  const setSpriteFrame = React.useCallback(
    (frame) => {
      const node = spriteRef.current;
      if (!node) return;
      const maximumFrame = Math.max(0, config.frameCount - 1);
      const safeFrame = Math.min(
        maximumFrame,
        Math.max(0, Math.trunc(Number(frame) || 0))
      );
      node.dataset.frame = String(safeFrame);
      if (Array.isArray(config.frameUrls) && config.frameUrls.length) {
        node.style.backgroundImage = `url("${getCharacterFrameUrl(config, safeFrame)}")`;
        node.style.backgroundPosition = "center bottom";
        node.style.backgroundSize = "contain";
      } else {
        node.style.backgroundPosition = getInterventionFramePosition(
          safeFrame,
          config.frameCount
        );
      }
    },
    [config]
  );

  const updatePlacement = React.useCallback(() => {
    updateInterventionPlacement({
      layer: layerRef.current,
      surface: surfaceRef.current,
      character: spriteRef.current?.parentElement,
      host: placementController?.getInterventionHost?.() || { element: hostRef?.current },
      config,
      originRect: intervention?.originRect,
    });
  }, [config, hostRef, intervention, placementController]);

  React.useLayoutEffect(() => {
    if (!intervention || !enabled) return;
    return observeInterventionPlacement({
      host: placementController?.getInterventionHost?.()?.element || hostRef?.current,
      surface: surfaceRef.current,
      update: updatePlacement,
    });
  }, [enabled, hostRef, intervention, placementController, updatePlacement]);

  const presentIntervention = React.useCallback(
    (event, { manualActivation = false } = {}) => {
      const text = typeof event?.text === "string" ? event.text : "";
      if (
        !text ||
        stunnedRef.current ||
        !enabledRef.current ||
        !isInterventionForActiveRound(event?.roundId, roundIdRef.current)
      ) {
        return;
      }
      completePresentation();
      const sequence = pendingSequenceRef.current + 1;
      pendingSequenceRef.current = sequence;
      clearTimers();
      nextHitRef.current = 0;
      setReaction(null);
      if (textRef.current) textRef.current.replaceChildren();
      setSpriteFrame(config.neutralFrame);
      const reactionAssets = getReactionAssets(config);
      const assetUrls = [
        ...getCharacterAssets(config),
        config.buttonUrl,
        ...Object.values(reactionAssets),
      ].filter(Boolean);
      void Promise.all(assetUrls.map(preloadInterventionSprite)).then(() => {
        if (
          pendingSequenceRef.current !== sequence ||
          !enabledRef.current ||
          !isInterventionForActiveRound(event?.roundId, roundIdRef.current)
        ) {
          return;
        }
        const appearanceSfxKey = resolveInterventionAppearanceSfxKey(config, {
          manualActivation,
          fallbackKey: SFX_KEYS.presenterAppearance,
        });
        AssetManager.playSfx(appearanceSfxKey, {
          cooldownKey: "presenterAppearance",
          cooldownMs: 120,
          eqKey: "presenter",
        });
        activePresentationRef.current = event;
        setIntervention({
          highlights: Array.isArray(event?.highlights) ? event.highlights : [],
          id: String(event?.id || `${config.key}-${sequence}`),
          originRect:
            config.buttonUrl &&
            event?.originRect &&
            Number.isFinite(event.originRect.left)
              ? {
                  height: Number(event.originRect.height) || 0,
                  left: Number(event.originRect.left) || 0,
                  top: Number(event.originRect.top) || 0,
                  width: Number(event.originRect.width) || 0,
                }
              : null,
          sequence,
          sourceEvent: event,
          text,
        });
      });
    },
    [clearTimers, completePresentation, config, setSpriteFrame]
  );

  React.useEffect(() => {
    const reactionAssets = getReactionAssets(config);
    const assetUrls = [
      ...getCharacterAssets(config),
      config.buttonUrl,
      ...Object.values(reactionAssets),
    ].filter(Boolean);
    void Promise.all(assetUrls.map(preloadInterventionSprite));
  }, [config]);

  React.useEffect(() => {
    if (typeof subscribeInterventions !== "function") return undefined;
    return subscribeInterventions((event) => {
      const eventRoundId = event?.roundId == null ? "" : String(event.roundId);
      const activeRoundId =
        roundIdRef.current == null ? "" : String(roundIdRef.current);
      if (!isInterventionForActiveRound(eventRoundId, activeRoundId)) return;
      if (event?.text) {
        latestInterventionRef.current = event;
        if (manualMode) manualController.markAvailable(manualKey, eventRoundId);
      }
      if (!enabledRef.current) {
        if (queueWhileDisabled && event?.text) queuedInterventionRef.current = event;
        return;
      }
      if (manualMode) return;
      queuedInterventionRef.current = null;
      presentIntervention(event);
    });
  }, [
    manualController,
    manualKey,
    manualMode,
    presentIntervention,
    queueWhileDisabled,
    roundId,
    subscribeInterventions,
  ]);

  React.useEffect(() => {
    if (!manualMode) return undefined;
    return manualController.subscribeRequests(manualKey, (request) => {
      if (!enabledRef.current) return;
      const latest =
        latestInterventionRef.current ||
        manualController.getLatestIntervention?.(manualKey);
      const latestRoundId = latest?.roundId == null ? "" : String(latest.roundId);
      const activeRoundId =
        roundIdRef.current == null ? "" : String(roundIdRef.current);
      if (!isInterventionForActiveRound(latestRoundId, activeRoundId)) return;
      if (latest?.text) {
        onManualActivation?.(latest);
        presentIntervention(
          { ...latest, originRect: request?.originRect || null },
          { manualActivation: request?.automatic !== true }
        );
      }
    });
  }, [manualController, manualKey, manualMode, onManualActivation, presentIntervention]);

  React.useEffect(() => {
    if (!manualMode) return undefined;
    return manualController.subscribeInterruptions(manualKey, () => {
      pendingSequenceRef.current += 1;
      clearTimers();
      setPhase("exiting");
      schedule(() => {
        completePresentation();
        setIntervention(null);
        setReaction(null);
      }, PRESENTER_HANDOFF_EXIT_MS);
    });
  }, [
    clearTimers,
    completePresentation,
    manualController,
    manualKey,
    manualMode,
    schedule,
  ]);

  React.useLayoutEffect(() => {
    completePresentation();
    if (String(completedRoundIdRef.current || "") !== String(roundId || "")) {
      completedPresentationKeysRef.current.clear();
      completedRoundIdRef.current = roundId;
    }
    pendingSequenceRef.current += 1;
    const latest = latestInterventionRef.current;
    const latestRoundId = latest?.roundId;
    const keepLatest =
      latest?.text &&
      latestRoundId != null &&
      roundId != null &&
      String(latestRoundId) === String(roundId);
    if (!keepLatest) latestInterventionRef.current = null;
    const queuedRoundId = queuedInterventionRef.current?.roundId;
    if (
      queuedRoundId == null ||
      roundId == null ||
      String(queuedRoundId) !== String(roundId)
    ) {
      queuedInterventionRef.current = null;
    }
    clearTimers();
    nextHitRef.current = 0;
    stunnedRef.current = false;
    setReaction(null);
    setSpriteFrame(config.neutralFrame);
    if (textRef.current) textRef.current.replaceChildren();
    setIntervention(null);
    setPhase("hidden");
    if (keepLatest && manualMode) {
      manualController.markAvailable(manualKey, latestRoundId);
    }
  }, [
    clearTimers,
    completePresentation,
    config,
    manualController,
    manualKey,
    manualMode,
    phaseKey,
    roundId,
    setSpriteFrame,
  ]);

  React.useEffect(() => {
    if (enabled) {
      const queued = queuedInterventionRef.current;
      queuedInterventionRef.current = null;
      if (
        queued?.text &&
        isInterventionForActiveRound(queued.roundId, roundIdRef.current)
      ) {
        latestInterventionRef.current = queued;
        if (manualMode) {
          manualController.markAvailable(manualKey, queued.roundId);
        } else {
          presentIntervention(queued);
        }
      }
      return;
    }
    completePresentation();
    pendingSequenceRef.current += 1;
    clearTimers();
    nextHitRef.current = 0;
    setReaction(null);
    setSpriteFrame(config.neutralFrame);
    if (textRef.current) textRef.current.replaceChildren();
    setIntervention(null);
    setPhase("hidden");
  }, [
    clearTimers,
    completePresentation,
    config,
    enabled,
    manualController,
    manualKey,
    manualMode,
    presentIntervention,
    roundId,
    setSpriteFrame,
  ]);

  React.useLayoutEffect(() => {
    if (!intervention || !enabled) return undefined;
    clearTimers();
    updatePlacement();
    setSpriteFrame(config.neutralFrame);
    const typedText = mountTypedText(
      textRef.current,
      intervention.text,
      intervention.highlights
    );
    setPhase("entering");

    const reducedMotion =
      !animated ||
      (typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const units = typedText.units;
    let mouthTimerId = null;
    let typingTimerId = null;
    let finished = false;

    const cancelTimer = (timerId) => {
      if (timerId == null) return;
      clearTimeout(timerId);
      timerIdsRef.current.delete(timerId);
    };

    const finishTyping = () => {
      if (finished) return;
      finished = true;
      cancelTimer(mouthTimerId);
      cancelTimer(typingTimerId);
      setSpriteFrame(config.neutralFrame);
      setPhase("holding");
      schedule(() => {
        setPhase("exiting");
        schedule(() => {
          completePresentation(intervention.sourceEvent);
          setIntervention((current) =>
            current?.sequence === intervention.sequence ? null : current
          );
        }, reducedMotion ? 0 : config.exitMs);
      }, config.textHoldMs);
    };

    const startMouthAnimation = () => {
      if (reducedMotion) return;
      let step = 0;
      const blinkStep =
        Math.random() < config.blinkChance
          ? randomIntegerBetween(5, 12)
          : -1;
      const tick = () => {
        if (finished) return;
        const frame =
          step === blinkStep
            ? config.blinkFrame
            : config.mouthSequence[step % config.mouthSequence.length];
        setSpriteFrame(frame);
        step += 1;
        mouthTimerId = schedule(
          tick,
          randomIntegerBetween(config.mouthDelayMinMs, config.mouthDelayMaxMs)
        );
      };
      tick();
    };

    const startTyping = () => {
      setPhase("speaking");
      if (reducedMotion) {
        typedText.revealAll();
        finishTyping();
        return;
      }
      startMouthAnimation();
      let index = 0;
      const typeNext = () => {
        if (finished) return;
        const current = units[index] || null;
        const unit = current?.unit || "";
        if (current?.writer?.node) current.writer.node.data += unit;
        index += 1;
        if (index >= units.length) {
          finishTyping();
          return;
        }
        typingTimerId = schedule(
          typeNext,
          getInterventionTypingDelay(unit, config)
        );
      };
      if (!units.length) {
        finishTyping();
        return;
      }
      typingTimerId = schedule(
        typeNext,
        getInterventionTypingDelay(units[0]?.unit || "", config)
      );
    };

    const entryTimerId = schedule(
      startTyping,
      reducedMotion ? 0 : config.entryMs
    );

    return () => {
      finished = true;
      cancelTimer(entryTimerId);
      clearTimers();
      setSpriteFrame(config.neutralFrame);
    };
  }, [
    clearTimers,
    completePresentation,
    config,
    animated,
    enabled,
    intervention,
    schedule,
    setSpriteFrame,
    updatePlacement,
  ]);

  const handleCharacterHit = React.useCallback(
    (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (
        !intervention ||
        phase === "exiting" ||
        phase === "stars" ||
        phase === "zapped"
      ) {
        return;
      }
      clearTimers();
      stunnedRef.current = true;
      if (manualMode) manualController.markStunned(manualKey);
      setSpriteFrame(config.neutralFrame);
      const hit = getNextPresenterHitReaction(nextHitRef.current);
      nextHitRef.current += 1;
      setReaction(hit);
      setPhase("hit");
      const punchKey =
        PRESENTER_PUNCH_KEYS[
          randomIntegerBetween(0, PRESENTER_PUNCH_KEYS.length - 1)
        ];
      AssetManager.playSfx(punchKey, {
        cooldownKey: "presenterPunch",
        cooldownMs: 55,
        eqKey: "presenterPunch",
      });
      schedulePresenterHitExit({
        schedule,
        showStars: () => {
          setReaction("stars");
          setPhase("stars");
        },
        startExit: () => setPhase("exiting"),
        complete: () => {
          completePresentation(intervention.sourceEvent);
          setIntervention((current) =>
            current?.sequence === intervention.sequence ? null : current
          );
          setReaction(null);
        },
        exitMs: config.exitMs,
      });
    }, [
      clearTimers,
      completePresentation,
      config,
      intervention,
      manualController,
      manualKey,
      manualMode,
      phase,
      schedule,
      setSpriteFrame,
    ]
  );

  React.useEffect(
    () => () => {
      pendingSequenceRef.current += 1;
      clearTimers();
      completePresentation();
    },
    [clearTimers, completePresentation]
  );

  if (!intervention || typeof document === "undefined") return null;
  const reactionAssets = getReactionAssets(config);
  const reactionUrl = reaction ? reactionAssets[reaction] : "";
  const measuredSegments = buildInterventionTextSegments(
    intervention.text,
    intervention.highlights
  );

  return createPortal(
    <div
      ref={layerRef}
      className="sprite-intervention-layer"
      data-character={config.key}
      style={{
        "--sprite-intervention-bubble-max-width": `${config.bubbleMaxWidthPx}px`,
        "--sprite-intervention-bubble-max-width-mobile": `${config.bubbleMaxWidthMobilePx}px`,
        "--sprite-intervention-character-height": `${config.characterHeightPx}px`,
        "--sprite-intervention-character-height-mobile": `${config.characterHeightMobilePx}px`,
        "--sprite-intervention-character-width": `${
          config.characterHeightPx * config.frameAspectRatio
        }px`,
        "--sprite-intervention-character-width-mobile": `${
          config.characterHeightMobilePx * config.frameAspectRatio
        }px`,
        "--sprite-intervention-entry-ms": `${config.entryMs}ms`,
        "--sprite-intervention-exit-ms": `${config.exitMs}ms`,
        "--sprite-intervention-frame-aspect": config.frameAspectRatio,
        "--sprite-intervention-sheet-width": `${config.frameCount * 100}%`,
      }}
    >
      <div className="sprite-intervention-positioner">
      <div
        ref={surfaceRef}
        className="sprite-intervention-surface"
        data-animated={animated ? "true" : "false"}
        data-mirrored={config.mirrored ? "true" : undefined}
        data-origin-transition={intervention.originRect ? "true" : undefined}
        data-phase={phase}
        data-intervention-id={intervention.id}
      >
        <div className="sprite-intervention-bubble-slot" aria-hidden="true">
          <div className="sprite-intervention-bubble">
            <span ref={textRef} className="sprite-intervention-text" />
          </div>
          <div className="sprite-intervention-bubble-measure">
            <span className="sprite-intervention-text">
              {measuredSegments.map((segment, index) => (
                <span
                  key={`${index}-${segment.highlighted ? "highlight" : "plain"}`}
                  className={
                    segment.highlighted ? "sprite-intervention-highlight" : undefined
                  }
                >
                  {segment.text}
                </span>
              ))}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="sprite-intervention-character-slot"
          onClick={handleCharacterHit}
          tabIndex={-1}
          aria-label={`Faire zapper ${config.accessibleName}`}
        >
          <span
            ref={spriteRef}
            className="sprite-intervention-character"
            data-frame={config.neutralFrame}
            data-discrete-frames={config.frameUrls?.length ? "true" : undefined}
            data-obscured={reaction ? "true" : undefined}
            style={{
              backgroundImage: `url("${getCharacterFrameUrl(
                config,
                config.neutralFrame
              )}")`,
            }}
            aria-hidden="true"
          />
          {intervention.originRect && config.buttonUrl ? (
            <span
              className="sprite-intervention-launch-head"
              style={{ backgroundImage: `url("${config.buttonUrl}")` }}
              aria-hidden="true"
            />
          ) : null}
          {reactionUrl ? (
            <span
              key={`${reaction}-${nextHitRef.current}`}
              className="sprite-intervention-reaction"
              data-reaction={reaction}
              style={{ backgroundImage: `url("${reactionUrl}")` }}
              aria-hidden="true"
            />
          ) : null}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {config.accessibleName} : {intervention.text}
        </span>
      </div>
      </div>
    </div>,
    document.body
  );
}

export default React.memo(SpriteIntervention);
