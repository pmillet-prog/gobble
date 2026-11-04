import React from "react";
import { SKILL_GOOD_RADIUS, SKILL_PERFECT_RADIUS } from "../../src/features/infortune/wheelSkillShot.js";
import { skillBandPath, skillCurvePath, skillTransform, skillGuideArrows, skillTrailPath, skillPrecisionLabel, updateSkillShotOverlay } from "./skillShotOverlay.js";

export const SKILL_REPLAY_MS = 3500;

export function SkillShotOverlay({ wheel }) {
  const { launchGame: game, launchQuality: quality } = wheel.view;
  const result = game?.skillResult;
  const [expired, setExpired] = React.useState(null);
  React.useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setExpired(result), SKILL_REPLAY_MS);
    return () => clearTimeout(timer);
  }, [result]);
  const active = wheel.view.phase === "dragging";
  const skill = active ? game?.skill : result !== expired ? result : null;
  // Live DOM updates intentionally bypass React. On release, force the frozen
  // snapshot back into that same DOM even if React sees unchanged initial props.
  React.useLayoutEffect(() => {
    if (!active && skill) updateSkillShotOverlay(wheel.skillOverlay.current, { ...skill, hint: quality?.detail || skill.hint });
  }, [active, skill, quality, wheel.skillOverlay]);
  if (!skill) return null;
  const trace = skill.mode === "trace";
  const guideY = skill.guide.map(point => point.y);
  const readoutPosition = Math.min(...guideY) > skill.bounds.height - Math.max(...guideY) ? "top" : "bottom";
  return <div className="wheel-skill" ref={wheel.skillOverlay} data-quality={skill.kind} data-path-valid={skill.pathValid}
    data-ready={skill.canLaunch} data-complete={!active}
    style={{ "--skill-power": `${skill.power * 100}%`, "--skill-progress": `${skill.progress * 100}%` }}>
    <svg viewBox={`0 0 ${skill.bounds.width} ${skill.bounds.height}`} preserveAspectRatio="none" aria-hidden="true">
      {trace ? <>
        <path className="wheel-skill__corridor" d={skillCurvePath(skill.guide)} />
        <path className="wheel-skill__path" d={skillCurvePath(skill.guide)} />
        <path className="wheel-skill__progress" data-skill-progress d={skillCurvePath(skill.guide)} pathLength="100" strokeDasharray={`${skill.progress * 100} 100`} />
        <path className="wheel-skill__arrows" d={skillGuideArrows(skill.guide)} />
        <path className="wheel-skill__trail" data-skill-trail d={skillTrailPath(skill.trail)} />
      </> : <path className="wheel-skill__band" data-skill-band d={skillBandPath(skill)} />}
      <circle className="wheel-skill__anchor" cx={skill.anchor.x} cy={skill.anchor.y} r="0.013" />
      <g data-skill-goal transform={skillTransform(skill.goal)}>
        <circle className="wheel-skill__good" r={SKILL_GOOD_RADIUS} />
        <circle className="wheel-skill__perfect" r={SKILL_PERFECT_RADIUS} />
        <path className="wheel-skill__cross" d="M -0.012 0 H 0.012 M 0 -0.012 V 0.012" />
        {trace && <text className="wheel-skill__target-label" textAnchor="middle"
          x={Math.max(0.12, Math.min(skill.bounds.width - 0.12, skill.goal.x)) - skill.goal.x}
          y={skill.goal.y > 0.12 ? -0.075 : 0.095}>{active ? "LÂCHEZ ICI" : "CIBLE"}</text>}
      </g>
      <g data-skill-cursor transform={skillTransform(skill.cursor)}><circle className="wheel-skill__cursor-outline" r="0.019" /><circle className="wheel-skill__cursor" r="0.014" /></g>
    </svg>
    {trace ? <div className="wheel-skill__trace-readout" data-position={readoutPosition}>
      {!active && quality && <strong className="wheel-skill__verdict" role="status">
        {quality.bonus > 0 && <span aria-hidden="true">✦ </span>}{quality.label}{quality.bonus ? ` · +${quality.bonus}` : " · +0"}
      </strong>}
      <div className="wheel-skill__progress-label"><span>{active ? "Votre geste" : "Geste au lâcher"}</span><output data-skill-distance>{Math.round(skill.progress * 100)} %</output></div>
      <div className="wheel-skill__distance-track"><span /></div>
      <div className="wheel-skill__precision-label"><span>Précision du tracé</span><output data-skill-precision={skill.precision}>{skillPrecisionLabel(skill)}</output></div>
      <p data-skill-hint>{active ? skill.hint : quality?.detail || skill.hint}</p>
      <div className="wheel-skill__power-label"><span>Puissance · minimum {Math.round(skill.minimumPower * 100)} %</span><output data-skill-power>{Math.round(skill.power * 100)} %</output></div>
      <div className="wheel-skill__power-track"><span /><i style={{ left: `${skill.minimumPower * 100}%` }} /></div>
      <small>Trait bleu : votre geste · Point blanc : {active ? "votre doigt" : "votre lâcher"}</small>
    </div> : <p className="wheel-skill__hint" data-skill-hint>{skill.hint}</p>}
  </div>;
}
