import React from "react";
import { getTutorialResultsGuidance } from "./tutorialResultsGuidance.js";

const visible = (element) => !!element?.getClientRects().length;
const find = (selector) => [...document.querySelectorAll(selector)].find(visible);
const rect = (element) => visible(element) ? element.getBoundingClientRect() : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const box = (area, pad = 0) => area ? ({ left: area.left - pad, top: area.top - pad, width: area.width + pad * 2, height: area.height + pad * 2 }) : null;

function presenterBounds() {
  const buttons = ["romejko", "lepers", "capello"].map((key) => rect(find(`[data-presenter-key="${key}"]`))).filter(Boolean);
  if (!buttons.length) return null;
  const left = Math.min(...buttons.map((r) => r.left)), right = Math.max(...buttons.map((r) => r.right));
  const top = Math.min(...buttons.map((r) => r.top)), bottom = Math.max(...buttons.map((r) => r.bottom));
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export default function useTutorialGeometry(game, step, mode, target, cardRef, contextRef) {
  const [geometry, setGeometry] = React.useState(null);
  React.useLayoutEffect(() => {
    let frame;
    const refs = game.gameRefs();
    const guidance = getTutorialResultsGuidance(step, game.read());
    const resultsHeading = guidance ? find(`[data-results-heading="${guidance.page}"]`) : null;
    const wordSelector = ["finders", "definition"].includes(step.kind) ? `[data-result-word="${step.word}"]` : null;
    let wordScrolled = false;
    const measure = () => {
      const snapshot = game.read();
      const mobile = snapshot.mobile;
      const grid = rect(refs.grid.current);
      const results = rect(find("[data-tutorial-focus='results']"));
      const feed = rect(find("[data-tutorial-focus='feed']"));
      const ranking = rect(mobile ? refs.ranking.current : find(".desktop-ui-column"));
      const preview = rect(find("[data-game-word-preview]"));
      const wordRect = rect(wordSelector ? find(wordSelector) : null);
      const headingRect = rect(resultsHeading);
      const bonusIndex = step.kind === "placement" ? Object.values(step.placements)[0] : null;
      const bonusTile = Number.isInteger(bonusIndex) ? rect(refs.tiles.current[bonusIndex]) : null;
      const bonusChip = step.kind === "placement" ? rect(find(`[aria-label="Tuile ${Object.keys(step.placements)[0]}"]`)) : null;
      const focus = step.focus === "bonus" ? bonusTile : step.focus === "objective" ? rect(find('[data-tutorial-focus="objective"]')) || feed : step.focus === "presenters" ? presenterBounds() : wordRect || (
        step.focus === "ranking" ? ranking || results : step.focus === "feed" ? feed : step.focus === "words" ? results || rect(find(".desktop-side-column")) : grid
      );
      const width = Math.min(386, innerWidth - 28, grid ? Math.max(280, grid.width - 16) : 386);
      const cardHeight = cardRef.current?.offsetHeight || 280;
      const centerX = grid ? grid.left + grid.width / 2 : innerWidth / 2;
      const card = { width, left: clamp(centerX - width / 2, 14, innerWidth - width - 14), top: clamp(grid ? grid.top + (grid.height - cardHeight) / 2 : (innerHeight - cardHeight) / 2, 16, innerHeight - cardHeight - 16) };
      if (step.focus === "presenters" && focus) {
        card.maxHeight = Math.max(120, focus.top - 28);
        card.top = Math.max(16, Math.min(card.top, focus.top - cardHeight - 12));
      }

      const contextHeight = contextRef.current?.offsetHeight || 64;
      let contextWidth = Math.min(innerWidth - 32, grid?.width || 360);
      let contextLeft = grid?.left || (innerWidth - contextWidth) / 2;
      let contextTop = grid ? grid.top - contextHeight - 12 : innerHeight / 2;
      if (mobile && grid) {
        // The validation field sits above the grid on phones: never use that gap.
        const belowGrid = feed && feed.height >= contextHeight + 10 && feed.top >= grid.bottom - 4;
        if (belowGrid) {
          contextTop = feed.top + (feed.height - contextHeight) / 2;
        } else {
          const ceiling = rect(refs.header.current)?.bottom || 54;
          const floor = Math.min(preview?.top || grid.top, grid.top) - 5;
          contextTop = Math.max(ceiling, floor - contextHeight);
        }
      }
      if (step.phase === "results") {
        if (mobile && results) {
          contextWidth = Math.min(360, results.width - 20);
          contextLeft = results.left + (results.width - contextWidth) / 2;
          contextTop = results.bottom - contextHeight - 14;
          const headingBottom = (headingRect?.bottom || results.top) + 12;
          contextTop = Math.max(contextTop, headingBottom);
          if (wordRect && contextTop < wordRect.bottom + 12 && contextTop + contextHeight > wordRect.top) {
            const aboveWord = wordRect.top - contextHeight - 18;
            contextTop = aboveWord >= headingBottom ? aboveWord : results.bottom + 16;
          }
        } else if (grid) contextTop = grid.top - contextHeight - 12;
      }
      if (mobile && grid && (["slot", "placement"].includes(step.kind) || step.allowPlay)) {
        // This authored exercise leaves the bottom row out of every taught path.
        // Keep its short captions on that row, clear of the three native slots
        // and of the bonus tray beneath the grid.
        contextWidth = grid.width;
        contextLeft = grid.left;
        contextTop = grid.bottom - contextHeight - 2;
      }
      const context = { width: contextWidth, left: clamp(contextLeft, 12, innerWidth - contextWidth - 12), top: clamp(contextTop, 8, innerHeight - contextHeight - 8) };
      const points = (target?.path || []).map((index) => {
        const tile = rect(refs.tiles.current[index]);
        return tile ? { x: tile.left + tile.width / 2, y: tile.top + tile.height / 2 } : null;
      }).filter(Boolean);
      const last = points.at(-1), before = points.at(-2) || last;
      const pathPreview = points.length ? { width: innerWidth, height: innerHeight, points, endAngleDeg: Math.atan2(last.y - before.y, last.x - before.x) * 180 / Math.PI } : null;
      const tapTarget = snapshot.wordInfoWord ? rect(find('[aria-label="Voir la definition"]')) : wordRect;
      const tap = tapTarget ? { left: Math.min(innerWidth - 44, tapTarget.right - 15), top: tapTarget.top + tapTarget.height / 2 - 3 } : null;
      const bonusDrag = bonusChip && bonusTile ? {
        left: bonusChip.left + bonusChip.width / 2 - 12, top: bonusChip.top + bonusChip.height / 2 - 8,
        "--tutorial-drag-x": `${bonusTile.left + bonusTile.width / 2 - bonusChip.left - bonusChip.width / 2}px`,
        "--tutorial-drag-y": `${bonusTile.top + bonusTile.height / 2 - bonusChip.top - bonusChip.height / 2}px`,
      } : null;
      setGeometry({ card, context, pathPreview, tap, bonusDrag, resultsHeading: box(headingRect, 5), focus: box(focus, step.focus === "presenters" ? 2 : 5) });
    };
    const animations = new Set();
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // The native list can still be changing when the page snapshot arrives.
        // Locate the current word after that render before centering it.
        if (wordSelector && !wordScrolled) {
          const word = find(wordSelector);
          if (word) { wordScrolled = true; word.scrollIntoView({ block: "center", inline: "nearest" }); }
        }
        // The game starts native rotation animations in its own layout effect.
        // Wait until the next frame to subscribe, then remeasure when they end.
        for (const index of target?.path || []) for (const animation of refs.tiles.current[index]?.getAnimations?.() || []) {
          if (!animations.has(animation)) { animations.add(animation); animation.addEventListener("finish", schedule); }
        }
        measure();
      });
    };
    const observer = new ResizeObserver(schedule);
    for (const element of [refs.grid.current, cardRef.current, contextRef.current, resultsHeading, document.documentElement]) if (element) observer.observe(element);
    const nativeGrid = refs.grid.current;
    nativeGrid?.addEventListener("transitionend", schedule);
    const nativeResults = wordSelector ? find('[data-tutorial-focus="results"]') : null;
    const settleWordList = (event) => {
      if (!["max-height", "transform"].includes(event.propertyName) || !event.target.closest?.("[data-result-word]")) return;
      // Found/all animates row heights before the list reaches its final layout.
      wordScrolled = false;
      schedule();
    };
    nativeResults?.addEventListener("transitionend", settleWordList);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    schedule();
    return () => {
      observer.disconnect(); cancelAnimationFrame(frame);
      for (const animation of animations) animation.removeEventListener("finish", schedule);
      nativeGrid?.removeEventListener("transitionend", schedule);
      nativeResults?.removeEventListener("transitionend", settleWordList);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
    };
  }, [game, step, mode, target?.word, cardRef, contextRef]);
  return geometry;
}
