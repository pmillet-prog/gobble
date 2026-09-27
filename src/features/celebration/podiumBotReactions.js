import { getNextPresenterHitReaction, PRESENTER_HIT_IDLE_MS } from "../../components/botInterventions/spriteInterventionAnimation.js";

// One local reaction per podium actor. No presenter hint, round or ceremony state.
export function createPodiumBotReactions({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  let active = true, timer = null, snapshot = Object.freeze({ reaction: null, hits: 0 });
  const listeners = new Set();
  const publish = value => { snapshot = Object.freeze(value); for (const listener of listeners) listener(); };
  const clear = () => { if (timer !== null) cancel(timer); timer = null; };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() { active = true; },
    stop() { active = false; clear(); },
    hit() {
      if (!active || snapshot.reaction === "stars") return false;
      clear();
      publish({ reaction: getNextPresenterHitReaction(snapshot.hits), hits: snapshot.hits + 1 });
      timer = schedule(() => {
        timer = null;
        if (active) publish({ ...snapshot, reaction: "stars" });
      }, PRESENTER_HIT_IDLE_MS);
      return true;
    },
  };
}
