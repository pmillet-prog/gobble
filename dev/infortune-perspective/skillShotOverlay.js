import { skillCurvePoint } from "../../src/features/infortune/wheelSkillShot.js";

const pair = point => `${point.x} ${point.y}`;
export const skillCurvePath = curve => `M ${pair(curve[0])} Q ${pair(curve[1])} ${pair(curve[2])}`;
export const skillTrailPath = points => points.map((point, index) => `${index ? "L" : "M"} ${pair(point)}`).join(" ");
export const skillBandPath = skill => `M ${pair(skill.anchor)} L ${pair(skill.cursor)}`;
export const skillTransform = point => `translate(${pair(point)})`;
export const skillPrecisionLabel = skill => ({ pending: "À tracer", perfect: "Précis", good: "Correct", miss: "Hors tracé" })[skill.precision];

export function skillGuideArrows(curve) {
  return [0.3, 0.6].map(t => {
    const point = skillCurvePoint(curve, t), next = skillCurvePoint(curve, t + 0.01);
    const length = Math.hypot(next.x - point.x, next.y - point.y), dx = (next.x - point.x) / length, dy = (next.y - point.y) / length;
    const end = { x: point.x + dx * 0.014, y: point.y + dy * 0.014 };
    const left = { x: point.x - dx * 0.014 - dy * 0.012, y: point.y - dy * 0.014 + dx * 0.012 };
    const right = { x: point.x - dx * 0.014 + dy * 0.012, y: point.y - dy * 0.014 - dx * 0.012 };
    return `M ${pair(left)} L ${pair(end)} L ${pair(right)}`;
  }).join(" ");
}

export function updateSkillShotOverlay(node, skill) {
  if (!node || !skill) return;
  node.dataset.quality = skill.kind;
  node.dataset.pathValid = String(skill.pathValid);
  node.dataset.ready = String(skill.canLaunch);
  node.style.setProperty("--skill-power", `${skill.power * 100}%`);
  node.style.setProperty("--skill-progress", `${skill.progress * 100}%`);
  node.querySelector("[data-skill-goal]")?.setAttribute("transform", skillTransform(skill.goal));
  node.querySelector("[data-skill-cursor]")?.setAttribute("transform", skillTransform(skill.cursor));
  node.querySelector("[data-skill-band]")?.setAttribute("d", skillBandPath(skill));
  node.querySelector("[data-skill-trail]")?.setAttribute("d", skillTrailPath(skill.trail));
  node.querySelector("[data-skill-progress]")?.setAttribute("stroke-dasharray", `${skill.progress * 100} 100`);
  const power = node.querySelector("[data-skill-power]"), powerText = `${Math.round(skill.power * 100)} %`;
  if (power && power.textContent !== powerText) power.textContent = powerText;
  const progress = node.querySelector("[data-skill-distance]"), progressText = `${Math.round(skill.progress * 100)} %`;
  if (progress && progress.textContent !== progressText) progress.textContent = progressText;
  const precision = node.querySelector("[data-skill-precision]");
  if (precision) {
    precision.dataset.skillPrecision = skill.precision;
    if (precision.textContent !== skillPrecisionLabel(skill)) precision.textContent = skillPrecisionLabel(skill);
  }
  const hint = node.querySelector("[data-skill-hint]");
  if (hint && hint.textContent !== skill.hint) hint.textContent = skill.hint;
}
