export const AUDIENCE_REACTIONS = [
  ["low1", "Pas ouf 1"], ["low2", "Pas ouf 2"], ["honorable", "Honorable"],
  ["fiveHundred", "400 / 500"], ["top", "1 000 / Bonus"],
  ['fiveHundred2', '400 / 500 · variante'], ['disappointedBankrupt', 'Déception · banqueroute'],
  ['disappointedPass', 'Déception · passe'], ['gasp', 'Suspense · gasp'], ['surprised', 'Suspense · surprise'], ['laughter', 'Échange · rires'],
];

export function audienceReactionFor(result, random = Math.random) {
  if (!result) return null;
  if (result.kind === "bonus") return "top";
  if (result.kind === 'bankrupt') return 'disappointedBankrupt';
  if (result.kind === 'pass') return 'disappointedPass';
  if (result.kind !== "amount") return null;
  if (result.amount === 100 || result.amount === 150) return random() < 0.5 ? "low1" : "low2";
  if (result.amount >= 200 && result.amount <= 300) return "honorable";
  if (result.amount === 400 || result.amount === 500) return random() < .5 ? 'fiveHundred' : 'fiveHundred2';
  if (result.amount === 1000) return "top";
  return null;
}

export function exchangeAudienceReaction({ before, after }) {
  const delta = after - before;
  // Require both a substantial amount and a large relative change.
  if (delta >= 300 && after >= Math.max(1, before) * 2) return 'top';
  if (delta <= -300 && after <= before * .75) return 'laughter';
  // Keep "honorable" for almost equal pots, but never applaud a clear loss.
  if (delta < 0 && after < before * .85) return 'disappointedPass';
  return 'honorable';
}

export function nearSpecialSector({ phase, elapsed, velocity, sectorIndex, sectors }) {
  const speed = Math.abs(velocity) / (Math.PI * 2);
  if (phase !== 'spinning' || elapsed < 1.5 || speed < .04 || speed > .10 || !Number.isInteger(sectorIndex) || !sectors?.length) return false;
  // Only the last slow approach: the current wedge or its immediate neighbour.
  // Looking two wedges ahead (or while still fast) reacts to specials the
  // pointer can never reach, or will pass long before it actually stops.
  const direction = velocity > 0 ? -1 : 1;
  return [0, 1].some(offset => {
    const sector = sectors[(sectorIndex + direction * offset + sectors.length) % sectors.length];
    return ['bonus', 'bankrupt', 'pass'].includes(sector.kind) || sector.kind === 'amount' && sector.amount === 1000;
  });
}

// A physical stop chooses a reaction once. Camera scrubbing never replays it
// or draws another random sample; explicit auditioning is a separate action.
export function createWheelAudience({ urls = {}, track, random = Math.random }) {
  const players = Object.fromEntries(Object.entries(urls).map(([id, url]) => [id,
    track({ url, volume: 0.65, fadeIn: 0.015, fadeOut: 0.22, syncClock: false, resumeFromPlayback: true }),
  ]));
  let lastSpinId = null, lastSuspenseId = null, lastExchangeId = null, audition = 0;
  function reset() { for (const player of Object.values(players)) player?.sync({ active: false }); }
  return {
    reset,
    spinning(progress) {
      if (lastSuspenseId === progress.id || !nearSpecialSector(progress)) return;
      lastSuspenseId = progress.id;
      const reaction = random() < .5 ? 'gasp' : 'surprised';
      players[reaction]?.sync({ active: true, time: 0, key: `suspense:${progress.id}` });
    },
    stopped(result, spinId) {
      if (lastSpinId === spinId) return;
      lastSpinId = spinId; reset();
      const id = audienceReactionFor(result, random);
      players[id]?.sync({ active: true, time: 0, key: `audience:${spinId}` });
    },
    exchange(impact, id) {
      if (lastExchangeId === id) return;
      lastExchangeId = id; reset();
      const reaction = exchangeAudienceReaction(impact);
      players[reaction]?.sync({ active: true, time: 0, key: `exchange:${id}` });
    },
    preview(id) { reset(); players[id]?.sync({ active: true, time: 0, key: `audience-preview:${++audition}` }); },
  };
}
