import assert from "node:assert/strict";
import test from "node:test";

import {
  getOcidVoteGridLayout,
  selectVisibleOcidVoteOptions,
} from "../../src/components/ocid/ocidVoteLayout.js";

function option(id, botOnly = false) {
  return { id, botOnly, display: id.toUpperCase() };
}

test("toutes les propositions restent visibles tant que la liste tient confortablement", () => {
  const options = Array.from({ length: 12 }, (_, index) => option(`o${index}`, index > 8));
  const selected = selectVisibleOcidVoteOptions(options, { compact: true });
  assert.equal(selected.options.length, 12);
  assert.equal(selected.hiddenBotCount, 0);
});

test("une longue liste masque seulement les propositions provenant uniquement de bots", () => {
  const humans = Array.from({ length: 13 }, (_, index) => option(`human-${index}`));
  const bots = Array.from({ length: 6 }, (_, index) => option(`bot-${index}`, true));
  const selected = selectVisibleOcidVoteOptions([...humans, ...bots], { compact: true });
  assert.deepEqual(selected.options, humans);
  assert.equal(selected.hiddenBotCount, bots.length);
});

test("la grille ajoute des colonnes au lieu de devenir scrollable", () => {
  assert.deepEqual(getOcidVoteGridLayout(6, { compact: true }).columns, 1);
  assert.deepEqual(getOcidVoteGridLayout(14, { compact: true }).columns, 2);
  assert.ok(getOcidVoteGridLayout(25, { compact: true }).columns >= 3);
});
