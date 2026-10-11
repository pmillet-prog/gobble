import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { SCORING_DEFINITIONS, SCORING_PRESETS, clonePoints, scoreAcquisitions, projectScoring } from './model.mjs';

const source = await readFile(new URL('../all-players/data.js', import.meta.url), 'utf8');
const data = JSON.parse(source.replace(/^window\.GOBBLE_POPULATION = /, '').trim().replace(/;$/, ''));
const points = SCORING_PRESETS.recommended.points;

test('each proposal prices all 19 categories using nonnegative integer points', () => {
  assert.equal(SCORING_DEFINITIONS.length, 19);
  for (const preset of Object.values(SCORING_PRESETS)) {
    assert.equal(Object.keys(preset.points).length, 19);
    for (const definition of SCORING_DEFINITIONS) for (const tier of definition.tiers) {
      assert.ok(Number.isSafeInteger(preset.points[definition.id][tier]));
      assert.ok(preset.points[definition.id][tier] >= 0);
    }
  }
});
test('unique milestones contribute once, while every gold contributes', () => {
  assert.equal(scoreAcquisitions('marathon_10000', { bronze: 4, silver: 2, gold: 3 }, points), 1500);
  assert.equal(scoreAcquisitions('volume_100', { single: 16 }, points), 20);
  assert.equal(scoreAcquisitions('word_16', { single: 16 }, points), 4800);
  assert.equal(scoreAcquisitions('round_5000', { bronze: 5, silver: 3, gold: 2 }, points), 110);
});
test('a first gold includes earlier bronze and silver rewards from a zero baseline', () => {
  const one = { ...data, profiles: [{ ...data.profiles.find(p => p.recentRounds >= 100 && p.activeWeeks >= 2),
    metrics: { marathon_10000: { perRound: 1 } } }],
    categories: data.categories.filter(c => c.id === 'marathon_10000').map(c => ({ ...c, threshold: 1000 })) };
  const player = projectScoring(one, points, { horizon: 'rounds1000' }).players[0];
  assert.deepEqual(player.categoryScores[0].counts, { bronze: 1, silver: 1, gold: 1 });
  assert.equal(player.subtotal, 700);
});
test('66 regulars form three fixed groups and preserve the audited 90-day projection', () => {
  const result = projectScoring(data, points);
  assert.equal(result.players.length, 66);
  assert.deepEqual(result.groups.map(g => g.count), [22, 22, 22]);
  assert.equal(result.categoryCount, 8);
  assert.deepEqual(result.groups.map(g => g.medianSubtotal), [1320, 1532.5, 2105]);
  assert.ok(result.players.every(p => p.complete));
  assert.ok(result.excludedCategoryIds.includes('word_17'));
  assert.ok(result.players.every(p => !p.categoryScores.some(c => c.id === 'word_17')));
});
test('an unknown presenter stays unknown and does not enter complete group averages', () => {
  const result = projectScoring(data, points, { includePresenters: true });
  const player = result.players.find(p => p.userId === 296);
  assert.equal(result.categoryCount, 10);
  assert.equal(player.complete, false);
  assert.equal(player.knownCategories, 9);
  assert.equal(player.categoryScores.find(c => c.id === 'foukro_500000').subtotal, null);
  const group = result.groups.find(g => g.id === player.group);
  assert.equal(group.completeCount, group.count - 1);
});
test('round comparisons never invent a presenter rate', () => {
  const result = projectScoring(data, points, { horizon: 'rounds5000', includePresenters: true });
  assert.equal(result.categoryCount, 8);
  assert.deepEqual(result.groups.map(g => g.medianSubtotal), [2070, 2837.5, 3635]);
});
test('editing an event value does not invent event frequencies or change cumulative projections', () => {
  const edited = clonePoints(points);
  edited.word_17.single = 5000;
  assert.equal(points.word_17.single, 1000);
  assert.deepEqual(projectScoring(data, edited), projectScoring(data, points));
  edited.marathon_10000.gold = 800;
  assert.notDeepEqual(projectScoring(data, edited).players, projectScoring(data, points).players);
});
