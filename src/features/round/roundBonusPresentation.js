import { TARGET_QUIZ_PREVIEW_LOGO_SRC } from "../targetQuiz/targetQuizAssets.js";

const BONUSES = Object.freeze({
  gotus: Object.freeze({ kind: "gotus", label: "Gotus", logo: "/gotus/gotus-logo.webp" }),
  quiz: Object.freeze({ kind: "quiz", label: "Qui veut gagner des Gobblars", logo: TARGET_QUIZ_PREVIEW_LOGO_SRC }),
});

export function getRoundBonusPresentation(specialRound) {
  if (specialRound?.type !== "target_long" && specialRound?.type !== "target_score") return null;
  // Display the server's draw, never infer or randomly choose a bonus in the UI.
  const kind = specialRound.targetMiniGame?.kind;
  return kind === "gotus" || kind === "quiz" ? BONUSES[kind] : null;
}
