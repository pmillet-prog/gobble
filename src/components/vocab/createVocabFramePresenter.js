const number = new Intl.NumberFormat("fr-FR");
const clamp = value => Math.max(0, Math.min(1, value));
const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const style = (node, key, value) => { if (node && node.style[key] !== value) node.style[key] = value; };

// The small changing part of the overlay is painted in its animation frame.
// It must not wait for a concurrent results render before displaying a word
// and acknowledging it to the sequence/audio clock. React owns structure,
// phase changes and level portraits, and reconnects these targets on commit.
export function createVocabFramePresenter() {
  let root = null, nodes = {}, marks = [], options = {};
  return {
    connect(element, context) {
      root = element; options = context;
      nodes = Object.fromEntries([...(root?.querySelectorAll("[data-vocab-frame]") || [])]
        .map(node => [node.dataset.vocabFrame, node]));
      marks = [...(root?.querySelectorAll("[data-vocab-race-count]") || [])].map(node => ({
        count: Number(node.dataset.vocabRaceCount), line: node.querySelector("[data-vocab-race-line]"),
        label: node.querySelector("[data-vocab-race-label]"),
      }));
    },
    disconnect() { root = null; nodes = {}; marks = []; },
    present(frame) {
      if (!root) return false;
      text(nodes.word, frame.word);
      if (nodes.word) {
        nodes.word.classList.toggle("vocab-word-season-new", frame.isSeasonNew);
        const title = frame.word ? frame.isSeasonNew ? "Nouveau cette semaine et cette saison" : "Nouveau cette semaine" : "";
        if (nodes.word.title !== title) nodes.word.title = title;
      }
      text(nodes.weeklyDelta, `+${number.format(frame.weeklyDelta)}`);
      text(nodes.weeklyTotal, `${number.format(frame.weeklyTotal)} cette semaine`);
      text(nodes.total, number.format(frame.total));
      text(nodes.delta, `+${number.format(frame.delta)}`);
      text(nodes.deltaLabel, options.levelUp ? "Niveau gagné !" : frame.delta === 1 ? "nouveau mot" : "nouveaux mots");
      const min = Number(options.level?.min) || 0;
      const max = Math.max(min + 1, Number(options.level?.max) || frame.total);
      const progress = clamp((frame.total - min) / (max - min));
      style(nodes.levelFill, "transform", `scaleX(${progress})`);
      if (options.settling) style(nodes.levelBase, "transform", `scaleX(${progress})`);
      const remaining = Math.max(0, max - frame.total);
      text(nodes.remaining, remaining > 0 ? `${number.format(remaining)} mots avant ${number.format(max)}` : "Palier atteint");
      nodes.levelTrack?.setAttribute("aria-valuenow", String(Math.min(max, Math.max(min, frame.total))));
      nodes.levelTrack?.setAttribute("aria-valuetext", `${number.format(frame.total)} mots uniques`);
      const race = clamp((frame.weeklyTotal - options.raceMin) / options.raceRange);
      style(nodes.raceFill, "transform", `scaleX(${race})`);
      style(nodes.racePointer, "left", `${race * 100}%`);
      for (const mark of marks) {
        const passed = frame.weeklyTotal >= mark.count;
        mark.line?.classList.toggle("bg-emerald-400", passed);
        mark.line?.classList.toggle("vocab-race-passed", passed);
        mark.line?.classList.toggle("bg-slate-400/80", !passed);
        mark.label?.classList.toggle("text-emerald-500", passed);
        mark.label?.classList.toggle("opacity-70", !passed);
      }
      return true;
    },
  };
}
