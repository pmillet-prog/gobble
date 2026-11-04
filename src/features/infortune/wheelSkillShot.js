import { MAX_LAUNCH_SPEED, MIN_LAUNCH_SPEED } from "./wheelConfig.js";
import { createGesturePower } from "./wheelGesturePower.js";

export const GESTURE_MODES = Object.freeze({
  power: { label: "Puissance", instructions: "Glissez sur la roue : la vitesse du doigt dose la puissance. Lâchez dans la zone verte, au centre doré pour un lancer parfait." },
  sling: { label: "Fronde", instructions: "Attrapez la roue, tirez le lien élastique jusqu’à la cible mobile, puis lâchez. La distance étirée donne la puissance ; la précision au lâcher donne le bonus." },
  trace: { label: "Balayage de précision", instructions: "Appuyez sur la roue, puis dessinez le long des flèches jusqu’à la cible. Le trait bleu montre votre geste, la jauge indique votre progression. Relâchez dans le cercle vert pour un beau lancer, au centre doré pour un lancer parfait, en gardant un tracé précis et assez de puissance." },
});
export const SKILL_GOOD_RADIUS = 0.05;
export const SKILL_PERFECT_RADIUS = 0.016;
export const TRACE_REFERENCE_SPEED = 0.65; // A deliberate trace (~1.5 s) still supplies a usable impulse.
export const TRACE_RELEASE_GRACE_MS = 180; // Allow lifting a finger after reaching the small target.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const skillCurvePoint = (curve, t) => mix(mix(curve[0], curve[1], t), mix(curve[1], curve[2], t), t);

function closestOnPath(point, path) {
  let closest = { error: Infinity, progress: 0 };
  for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy));
    const error = distance(point, mix(a, b, t));
    if (error < closest.error) closest = { error, progress: (index - 1 + t) / (path.length - 1) };
  }
  return closest;
}

// All coordinates are CSS distances / the shorter viewport side, independent
// of the camera, DPR and input event frequency. This satellite never picks a
// sector: it supplies an impulse and a separate, purely monetary skill award.
export function createWheelSkillShot(mode, origin, startTime, attempt = 0) {
  if (!origin || !["sling", "trace"].includes(mode)) return null;
  const bounds = { width: origin.width, height: origin.height };
  const anchor = { x: origin.x, y: origin.y };
  const sx = anchor.x < bounds.width / 2 ? 1 : -1, sy = anchor.y < bounds.height / 2 ? 1 : -1;
  const variation = ((attempt + 1) * 0.61803398875) % 1;
  const curve = [anchor, { x: anchor.x + sx * 0.30, y: anchor.y },
    { x: anchor.x + sx * 0.48, y: anchor.y + sy * (0.20 + variation * 0.08) }];
  const path = Array.from({ length: 33 }, (_, index) => skillCurvePoint(curve, index / 32));
  const pathLength = path.slice(1).reduce((sum, point, index) => sum + distance(point, path[index]), 0);
  const targetProgress = 0.76 + variation * 0.12;
  // The visible quadratic ends exactly at the release target, instead of
  // inviting the player to continue beyond it along the rest of the curve.
  const guide = [anchor, mix(curve[0], curve[1], targetProgress), skillCurvePoint(curve, targetProgress)];
  const speed = createGesturePower({ referenceSpeed: TRACE_REFERENCE_SPEED, idleGraceMs: TRACE_RELEASE_GRACE_MS }); speed.reset(startTime);
  let trail = [anchor];
  let cursor = anchor, progress = 0, length = 0, errorIntegral = 0, backwards = 0, direction = 1;
  function target(time) {
    if (mode === "trace") return skillCurvePoint(curve, targetProgress);
    const stretch = 0.27 + variation * 0.06 + Math.sin((time - startTime) / 900 * Math.PI * 2) * 0.035;
    return { x: anchor.x + sx * stretch, y: anchor.y + sy * stretch * 0.35 };
  }
  function velocity(time) {
    return mode === "sling" ? -direction * MAX_LAUNCH_SPEED * clamp(distance(anchor, cursor) / 0.44)
      : direction * Math.abs(speed.velocity(time));
  }
  function snapshot(time) {
    const goal = target(time), power = Math.abs(velocity(time)) / MAX_LAUNCH_SPEED;
    const error = distance(cursor, goal), pathError = length ? errorIntegral / length : Infinity;
    const sufficient = power * MAX_LAUNCH_SPEED >= MIN_LAUNCH_SPEED;
    const clean = mode === "sling" || pathError <= 0.035 && backwards <= 0.07;
    const precise = mode === "sling" || pathError <= 0.012 && backwards <= 0.018;
    const kind = sufficient && clean && error <= SKILL_GOOD_RADIUS
      ? precise && error <= SKILL_PERFECT_RADIUS ? "perfect" : "good" : "miss";
    let hint;
    if (mode === "sling") hint = !sufficient ? "Tirez le lien vers la cible"
      : kind === "perfect" ? "Lâchez ! · Parfait" : kind === "good" ? "Lâchez ! · Beau lancer" : "Visez le centre de la cible mobile";
    else hint = length < 0.01 ? "Suivez les flèches, puis lâchez dans la cible."
      : backwards > 0.07 ? "Évitez les retours en arrière."
      : !clean ? "Rapprochez-vous du guide."
      : kind === "perfect" ? "Lâchez maintenant · Parfait !" : kind === "good" ? "Lâchez maintenant · Beau lancer !"
      : error <= SKILL_GOOD_RADIUS && !sufficient ? "Cible atteinte, mais geste trop lent."
      : progress > targetProgress + 0.1 ? "Cible dépassée : il faut lâcher plus tôt."
      : sufficient ? "Continuez jusqu’à la cible." : "Suivez la courbe d’un geste continu.";
    return { mode, bounds, anchor, cursor, curve, guide, goal, power, kind, pathError, backwards, hint,
      canLaunch: sufficient, minimumPower: MIN_LAUNCH_SPEED / MAX_LAUNCH_SPEED,
      pathValid: length < 0.01 || clean, precision: length < 0.01 ? "pending" : precise ? "perfect" : clean ? "good" : "miss",
      progress: clamp(progress / targetProgress), trail: [...trail, cursor] };
  }
  return {
    snapshot, velocity,
    record(point, time, travel) {
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      const next = { x: point.x, y: point.y }, segment = distance(cursor, next);
      if (Number.isFinite(travel) && Math.abs(travel) > 0.005) direction = Math.sign(travel);
      if (mode === "trace" && segment > 0) {
        // Integrate along each segment, not once per pointer event. Coalesced
        // events and sparse touch hardware must judge the same drawn path alike.
        const steps = Math.max(1, Math.ceil(segment / 0.008));
        for (let index = 1; index <= steps; index++) {
          const sample = closestOnPath(mix(cursor, next, index / steps), path);
          errorIntegral += sample.error * segment / steps;
          backwards += Math.max(0, progress - sample.progress);
          progress = sample.progress;
        }
        length += segment; speed.record(progress * pathLength, time);
        if (distance(trail.at(-1), next) >= 0.008) {
          trail.push(next);
          if (trail.length > 160) trail = trail.filter((_, index) => index % 2 === 0);
        }
      }
      cursor = next;
    },
    quality(time, rewards) {
      const state = snapshot(time), { kind, power } = state;
      const reason = kind !== "miss" ? kind : !state.canLaunch ? "power"
        : mode === "trace" && backwards > 0.07 ? "backtrack" : !state.pathValid ? "path" : "target";
      const detail = mode === "trace" ? ({ perfect: "Tracé précis et lâcher au centre de la cible.", good: "Tracé suivi et cible atteinte.",
        power: "Geste trop lent au lâcher : relâchez en traversant la cible, sans vous y arrêter.",
        backtrack: "Trop de retours en arrière pendant le tracé.", path: "Le geste s’est trop éloigné du guide.",
        target: "Vous avez relâché hors de la cible." })[reason] : undefined;
      return Object.freeze({ kind, power, skillMode: mode, reason, detail, bonus: kind === "miss" ? 0 : rewards[kind],
        label: kind === "perfect" ? "Lancer parfait" : kind === "good" ? "Beau lancer"
          : power * MAX_LAUNCH_SPEED < MIN_LAUNCH_SPEED ? "Puissance insuffisante" : "Pas de bonus" });
    },
  };
}
