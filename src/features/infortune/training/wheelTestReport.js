import { WHEEL_PROFILES } from "../../../../dev/infortune-perspective/wheelPerformance.js";
import { GESTURE_MODES } from "../wheelSkillShot.js";

export function wheelTestReport({ report, size, spins, gestureMode, status, userAgent, pixelRatio }) {
  const { metrics, timings } = report;
  const seconds = value => Number.isFinite(value) ? `${(value / 1000).toFixed(2)} s` : "non mesuré";
  return ["Gobble · Test du lancer de roue",
    `Affichage : ${WHEEL_PROFILES[report.profile]?.label || report.profile} (choix : ${report.preference})`,
    `État : ${status}`, `Diagnostic : ${report.reason || "en attente de mesure"}`,
    `Fluidité 3D : ${report.profile !== "flat" && metrics ? `${Math.round(metrics.fps)} images/s ; 95 % des images sous ${Math.round(metrics.p95)} ms` : "non mesurée"}`,
    `Préparation des images : ${seconds(timings?.assets)}`,
    `Préparation graphique : ${seconds(timings?.graphics)}`,
    `Geste : ${GESTURE_MODES[gestureMode]?.label || gestureMode} ; lancers terminés : ${spins}`,
    `Plateau : ${Math.round(size.width)} × ${Math.round(size.height)} ; densité : ${pixelRatio}`,
    `Navigateur : ${userAgent}`,
  ].join("\n");
}
