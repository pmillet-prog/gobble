import React from "react";
import { GOBBLARS_COUNT_START, GOBBLARS_COUNT_DURATION, GOBBLARS_REWARD_DURATION, getGobblarsRewardBalance } from "./gobblarsRewardAnimation.js";
import "./gobblarsRewardCelebration.css";
import useGobblarsRewardSound from "./useGobblarsRewardSound.js";

const formatter = new Intl.NumberFormat("fr-FR");
const SPARKS = [[-78, -32], [-53, 37], [-12, -47], [40, -44], [77, 23], [14, 46]];

export default function GobblarsRewardCelebration({ reward, sound = true }) {
  useGobblarsRewardSound(reward, sound);
  const spent = reward.amount < 0;
  const signedAmount = `${spent ? "-" : "+"}${formatter.format(Math.abs(reward.amount))}`;
  const counter = React.useRef(null);
  const [elapsedAtMount] = React.useState(() => Math.max(0, Date.now() - reward.startedAt));

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame;
    let timer;
    let previous;
    const paint = () => {
      const elapsed = Math.max(0, Date.now() - reward.startedAt);
      const value = getGobblarsRewardBalance(reward, elapsed, media.matches);
      if (value !== previous && counter.current) counter.current.textContent = formatter.format(value);
      previous = value;
      if (!media.matches && elapsed < GOBBLARS_COUNT_START + GOBBLARS_COUNT_DURATION) frame = requestAnimationFrame(paint);
    };
    const resume = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      const wait = GOBBLARS_COUNT_START - (Date.now() - reward.startedAt);
      if (!media.matches && wait > 0) {
        if (counter.current) counter.current.textContent = formatter.format(reward.before);
        timer = setTimeout(paint, wait);
      } else paint();
    };
    resume();
    media.addEventListener("change", resume);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); media.removeEventListener("change", resume); };
  }, [reward]);

  return <div className={`gobblars-reward${spent ? " gobblars-reward-spent" : ""}`} role="status" aria-live="polite" aria-atomic="true"
    style={{ "--reward-duration": `${GOBBLARS_REWARD_DURATION}ms`, "--reward-delay": `-${elapsedAtMount}ms` }}>
    <span className="gobblars-reward-announcement">{reward.label} {signedAmount} gobblars. Ton solde est de {formatter.format(reward.balance)} gobblars.</span>
    <div className="gobblars-reward-scene" aria-hidden="true">
      <div className="gobblars-reward-wallet">
        <div className="gobblars-reward-emblem"><img src="/Gobblars.png" alt="" width="48" height="48" /></div>
        <div className="gobblars-reward-total"><span>Ton trésor</span><strong ref={counter}>{formatter.format(getGobblarsRewardBalance(reward, elapsedAtMount))}</strong><small>GOBBLARS</small></div>
        <span className="gobblars-reward-glint" />
      </div>
      <div className="gobblars-reward-sparks">{SPARKS.map(([x, y], index) => <i key={index} style={{ "--spark-x": `${x}px`, "--spark-y": `${y}px`, "--spark-angle": `${index * 45}deg` }} />)}</div>
      <div className="gobblars-reward-gain"><strong>{signedAmount}</strong><img src="/Gobblars.png" alt="" width="26" height="26" /></div>
      <p className="gobblars-reward-reason">{reward.label}</p>
    </div>
  </div>;
}
