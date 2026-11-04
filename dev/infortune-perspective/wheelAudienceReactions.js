export const AUDIENCE_REACTIONS = [
  ["low1", "Pas ouf 1"], ["low2", "Pas ouf 2"], ["honorable", "Honorable"],
  ["fiveHundred", "400 / 500"], ["top", "1 000 / Bonus"],
];

export function audienceReactionFor(result, random = Math.random) {
  if (!result) return null;
  if (result.kind === "bonus") return "top";
  if (result.kind !== "amount") return null;
  if (result.amount === 100 || result.amount === 150) return random() < 0.5 ? "low1" : "low2";
  if (result.amount >= 200 && result.amount <= 300) return "honorable";
  if (result.amount === 400 || result.amount === 500) return "fiveHundred";
  if (result.amount === 1000) return "top";
  return null;
}

// A physical stop chooses a reaction once. Camera scrubbing never replays it
// or draws another random sample; explicit auditioning is a separate action.
export function createWheelAudience({ urls = {}, track, random = Math.random }) {
  const players = Object.fromEntries(Object.entries(urls).map(([id, url]) => [id,
    track({ url, volume: 0.65, fadeIn: 0.015, fadeOut: 0.22, syncClock: false, resumeFromPlayback: true }),
  ]));
  let lastSpinId = null, audition = 0;
  function reset() { for (const player of Object.values(players)) player?.sync({ active: false }); }
  return {
    reset,
    stopped(result, spinId) {
      if (lastSpinId === spinId) return;
      lastSpinId = spinId; reset();
      const id = audienceReactionFor(result, random);
      players[id]?.sync({ active: true, time: 0, key: `audience:${spinId}` });
    },
    preview(id) { reset(); players[id]?.sync({ active: true, time: 0, key: `audience-preview:${++audition}` }); },
  };
}
