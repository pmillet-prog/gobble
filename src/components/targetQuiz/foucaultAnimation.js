export const FOUCAULT_ANIMATION_MS = 2000;
export const FOUCAULT_NORMAL_FRAME = 0;
export const FOUCAULT_SERIOUS_FRAME = 6;
// Numbered 1 → 3 → 2 → 6 → 5 → 4 → 7 on the source sheet.
export const FOUCAULT_QUESTION_SEQUENCE = Object.freeze([0, 2, 1, 5, 4, 3, 6]);

export const FOUCAULT_QUESTION_SPRITE = Object.freeze({
  url: "/bots/foucault/questions.png",
  width: 2172,
  height: 724,
  frameCount: 7,
  frameWidth: 332,
  cropTop: 108,
  cropHeight: 512,
});

// The drawings are not uniform cells: shoulders overlap neighbouring bounding
// boxes. These separators follow the transparent gaps between the silhouettes.
const QUESTION_FRAMES = Object.freeze([
  { left: -3.5, clip: "0,0 0,724 318,724 318,0" },
  { left: 310, clip: "318,0 318,724 634,724 634,425 617,350 617,0" },
  { left: 616, clip: "617,0 617,350 634,425 634,724 935,724 935,0" },
  { left: 920.5, clip: "935,0 935,724 1235.5,724 1235.5,0" },
  { left: 1227, clip: "1235.5,0 1235.5,724 1538,724 1538,430 1565,350 1565,0" },
  { left: 1536, clip: "1565,0 1565,350 1538,430 1538,724 1853,724 1853,430 1875,350 1875,0" },
  { left: 1845, clip: "1875,0 1875,350 1853,430 1853,724 2172,724 2172,0" },
]);

export const FOUCAULT_REACTION_SPRITE = Object.freeze({
  url: "/bots/foucault/reactions.png",
  width: 1774,
  height: 887,
  frameWidth: 887,
  cropTop: 35,
  cropHeight: 830,
});

function getQuestionFrame(frame) {
  return QUESTION_FRAMES[Math.min(QUESTION_FRAMES.length - 1, Math.max(0, Math.trunc(Number(frame) || 0)))];
}

export function getFoucaultQuestionViewBox(frame) {
  const sprite = FOUCAULT_QUESTION_SPRITE;
  return `${getQuestionFrame(frame).left} ${sprite.cropTop} ${sprite.frameWidth} ${sprite.cropHeight}`;
}

export function getFoucaultQuestionClipPoints(frame) {
  return getQuestionFrame(frame).clip;
}

export function getFoucaultReactionViewBox(correct) {
  const sprite = FOUCAULT_REACTION_SPRITE;
  return `${correct ? sprite.frameWidth : 0} ${sprite.cropTop} ${sprite.frameWidth} ${sprite.cropHeight}`;
}

export function createFoucaultTimeline() {
  const stepMs = FOUCAULT_ANIMATION_MS / (FOUCAULT_QUESTION_SEQUENCE.length - 1);
  return FOUCAULT_QUESTION_SEQUENCE.map((frame, index) => ({ at: index * stepMs, frame }));
}

// A single pending timer updates this sprite only, independently of question text.
export function scheduleFoucaultAnimation({
  onFrame,
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const timeline = createFoucaultTimeline();
  const startedAt = now();
  let next = 1;
  let timer = null;
  let cancelled = false;
  onFrame(timeline[0].frame);

  const tick = () => {
    timer = null;
    if (cancelled) return;
    const elapsed = now() - startedAt;
    let frame = null;
    while (next < timeline.length && timeline[next].at <= elapsed) {
      frame = timeline[next].frame;
      next += 1;
    }
    if (frame !== null) onFrame(frame);
    if (next < timeline.length) {
      timer = setTimer(tick, Math.max(0, timeline[next].at - (now() - startedAt)));
    }
  };

  timer = setTimer(tick, timeline[next].at);
  return () => {
    cancelled = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
}
