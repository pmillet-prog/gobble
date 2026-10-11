import { SCORING_DEFINITIONS, SCORING_PRESETS, clonePoints, projectScoring } from './model.mjs';

const data = window.GOBBLE_POPULATION;
const el = (id) => document.getElementById(id);
const format = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : 'Non estimable';
const plotNumber = (value) => Math.abs(value) >= 10000 ? value.toLocaleString('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }) : format(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const presetIds = ['equal', 'recommended', 'attendance'];
const tierLabels = { bronze: 'Bronze', silver: 'Argent', gold: 'Or', single: 'Par obtention' };
const groupLabels = { low: 'Rendement inférieur', mid: 'Rendement intermédiaire', high: 'Rendement supérieur' };
const validPoint = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1000000;
const defaultPoints = () => clonePoints(SCORING_PRESETS.recommended.points);
let state = { preset: 'recommended', points: defaultPoints(), horizon: 'days90', includePresenters: false, player: null, sort: 'name' };
let projections = {};
let current;

try {
  const saved = JSON.parse(localStorage.getItem('gobble-scoring-workshop-v1') || 'null');
  if (saved && ['scoring-v1', 'scoring-v2'].includes(saved.modelVersion)) {
    if (presetIds.includes(saved.preset)) state.preset = saved.preset;
    state.points = clonePoints(SCORING_PRESETS[state.preset].points);
    for (const definition of SCORING_DEFINITIONS) for (const tier of definition.tiers) {
      // Apply Paul's revised unique reward while retaining other workshop edits.
      if (saved.modelVersion === 'scoring-v1' && definition.id === 'volume_100') continue;
      if (validPoint(saved.points?.[definition.id]?.[tier])) state.points[definition.id][tier] = saved.points[definition.id][tier];
    }
    if (['days90', 'rounds1000', 'rounds5000'].includes(saved.horizon)) state.horizon = saved.horizon;
    state.includePresenters = state.horizon === 'days90' && saved.includePresenters === true;
    state.player = saved.player;
    if (['name', 'points', 'activity', 'performance'].includes(saved.sort)) state.sort = saved.sort;
  }
} catch { /* Saving preferences is optional. */ }

const isCustom = () => SCORING_DEFINITIONS.some((definition) => definition.tiers.some((tier) => state.points[definition.id][tier] !== SCORING_PRESETS[state.preset].points[definition.id][tier]));
const presetName = (id) => id === state.preset && isCustom() ? `Personnalisé · ${SCORING_PRESETS[id].label}` : SCORING_PRESETS[id].label;
function persist() {
  try { localStorage.setItem('gobble-scoring-workshop-v1', JSON.stringify({ ...state, modelVersion: 'scoring-v2' })); } catch { /* Optional storage. */ }
}
function renderEditor() {
  el('weight-rows').innerHTML = SCORING_DEFINITIONS.map((definition) => {
    const isPresenter = definition.id === 'julien_1000' || definition.id === 'foukro_500000';
    const note = definition.scope !== 'cumulative' ? '<small class="unknown-frequency">Fréquence inconnue · hors projection</small>' : isPresenter ? '<small>Projection optionnelle et provisoire</small>' : '';
    const cells = ['bronze', 'silver', 'gold', 'single'].map((tier) => definition.tiers.includes(tier)
      ? `<td data-label="${tierLabels[tier]}"><input type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${state.points[definition.id][tier]}" data-weight-category="${escape(definition.id)}" data-weight-tier="${tier}" aria-label="${escape(definition.name)} : ${tierLabels[tier]}, points par obtention"></td>`
      : '<td class="not-applicable" aria-label="Sans objet">—</td>').join('');
    return `<tr data-weight-row="${escape(definition.id)}"><th scope="row">${escape(definition.name)}<small>${escape(definition.condition)}</small>${note}</th>${cells}</tr>`;
  }).join('');
}
function update() {
  const options = { horizon: state.horizon, includePresenters: state.includePresenters && state.horizon === 'days90' };
  projections = Object.fromEntries(presetIds.map((id) => [id, projectScoring(data, id === state.preset ? state.points : SCORING_PRESETS[id].points, options)]));
  current = projections[state.preset];
  el('horizon').value = state.horizon;
  el('presenters').disabled = state.horizon !== 'days90';
  el('presenters').checked = options.includePresenters;
  el('presenters-note').textContent = state.horizon === 'days90' ? 'Provisoire : environ 20 jours de suivi pour Julien, 2 jours pour FouKro.' : 'Indisponible dans ce mode : leurs fréquences par manche ne sont pas connues.';
  document.querySelectorAll('[data-preset]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.preset === state.preset)));
  el('active-name').textContent = isCustom() ? 'Personnalisé' : SCORING_PRESETS[state.preset].label;
  el('active-description').textContent = isCustom() ? `Tu ajustes la piste « ${SCORING_PRESETS[state.preset].label} ». La série correspondante du graphique utilise ces nouvelles valeurs ; les deux autres restent inchangées.` : SCORING_PRESETS[state.preset].description;
  const complete = current.players.filter((p) => p.complete).length;
  el('model-summary').innerHTML = `<strong>${current.categoryCount} cumuls projetés</strong> sur ${current.players.length} joueurs · ${state.horizon === 'days90' ? '90 jours au rythme propre à chacun' : `${state.horizon === 'rounds1000' ? '1 000' : '5 000'} manches par joueur`}. Les ${SCORING_DEFINITIONS.filter((d) => d.scope !== 'cumulative').length} exploits et podiums restent sans contribution chiffrée.`;
  const customLabel = isCustom() ? `Valeurs personnalisées à partir de « ${SCORING_PRESETS[state.preset].label} ».` : `Valeurs de la piste « ${SCORING_PRESETS[state.preset].label} ».`;
  el('editor-state').textContent = `${customLabel} Points par obtention, enregistrés uniquement dans ce navigateur.`;
  el('comparison-legend').innerHTML = presetIds.map((id) => `<span><i class="${id}" aria-hidden="true"></i>${escape(presetName(id))}${id === state.preset ? ' · exploré' : ''}</span>`).join('');
  const ratio = current.ratioHighLow;
  el('comparison-conclusion').textContent = finite(ratio) ? `${presetName(state.preset)} : le sous-total moyen du groupe au rendement supérieur représente ${format(ratio, 2)} fois celui du groupe au rendement inférieur.` : 'Le rapport entre les deux groupes extrêmes n’est pas estimable avec ces valeurs.';
  el('comparison-coverage').textContent = `Moyennes calculées sur les joueurs dont les ${current.categoryCount} cumuls inclus sont tous estimables : ${complete} sur ${current.players.length}. ${current.players.length - complete} sous-total(s) incomplet(s), signalé(s) séparément. Le total de points change avec l’échelle du barème : compare aussi les écarts entre groupes.`;
  if (!current.players.some((p) => String(p.userId) === String(state.player))) state.player = current.players.find((p) => p.nick.toLocaleLowerCase('fr') === 'nicole')?.userId ?? current.players[0]?.userId;
  const players = [...current.players].sort((a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' }));
  el('player').innerHTML = players.map((p) => `<option value="${p.userId}">${escape(p.nick)}</option>`).join('');
  el('player').value = state.player;
  el('sort').value = state.sort;
  renderChart(); renderPlayer(); renderRareValues(); renderRoster();
}
function renderPlayer() {
  const player = current.players.find((p) => String(p.userId) === String(state.player));
  if (!player) { el('player-summary').textContent = 'Aucun joueur disponible.'; return; }
  el('player-summary').innerHTML = `<p class="player-total">${format(player.subtotal)} points · sous-total partiel${player.complete ? '' : ' incomplet'}</p><p><strong>${escape(player.nick)}</strong> · ${format(player.roundsPerWeek, 1)} manches / semaine · ${format(player.scorePerRound)} points / manche</p>`;
  const max = Math.max(1, ...player.categoryScores.filter((row) => row.known).map((row) => row.subtotal));
  el('player-chart').innerHTML = player.categoryScores.map((row) => {
    const counts = row.counts;
    const countLabel = row.known && counts ? `${counts.bronze} bronze · ${counts.silver} argent · ${format(counts.gold)} or${counts.gold > 1 ? 's' : ''}` : 'Obtention non estimable';
    return `<div class="contribution" data-contribution="${escape(row.id)}"><span>${escape(row.name)}<small>${countLabel}</small></span><div class="track" aria-hidden="true"><div class="fill" style="width:${row.known ? Math.min(100, row.subtotal / max * 100) : 0}%"></div></div><span class="amount">${row.known ? `${format(row.subtotal)} pts` : 'Non estimable'}</span></div>`;
  }).join('');
  el('player-coverage').textContent = `${player.knownCategories} / ${player.totalCategories} cumuls inclus estimables. Les exploits, les podiums${state.includePresenters ? '' : ', Julien et FouKro'} ne sont pas comptés dans ce sous-total ; leur contribution n’est pas supposée nulle.`;
}
function renderRareValues() {
  el('rare-values').innerHTML = SCORING_DEFINITIONS.filter((definition) => definition.scope !== 'cumulative').map((definition) => {
    const points = state.points[definition.id];
    const value = definition.tiers.includes('single') ? `${format(points.single)} points` : `${format(points.bronze)} / ${format(points.silver)} / ${format(points.gold)} points`;
    const detail = definition.tiers.includes('single') ? 'Pour une obtention.' : 'Bronze / argent / or : points par couleur obtenue.';
    return `<article class="rare-value" data-rare-category="${escape(definition.id)}"><h3>${escape(definition.name)}</h3><strong>${value}</strong><p>${detail} ${escape(definition.condition)}</p></article>`;
  }).join('');
}
function renderRoster() {
  const byName = (a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' });
  const players = [...current.players].sort((a, b) => state.sort === 'points' ? b.subtotal - a.subtotal || byName(a, b) : state.sort === 'activity' ? b.roundsPerWeek - a.roundsPerWeek || byName(a, b) : state.sort === 'performance' ? b.scorePerRound - a.scorePerRound || byName(a, b) : byName(a, b));
  el('player-rows').innerHTML = players.map((p) => `<tr data-player-row="${p.userId}"${String(p.userId) === String(state.player) ? ' class="selected"' : ''}><td>${escape(p.nick)}</td><td>${format(p.roundsPerWeek, 1)}</td><td>${format(p.scorePerRound)}</td><td>${format(p.subtotal)}${p.complete ? '' : ' · incomplet'}</td><td>${p.knownCategories} / ${p.totalCategories} cumuls</td></tr>`).join('');
}
function renderChart() {
  if (!current) return;
  const host = el('comparison-chart');
  const width = host.clientWidth;
  const height = host.clientHeight;
  const compact = width < 600;
  const left = compact ? 7 : 190, right = compact ? 54 : 75, top = 33, bottom = 33;
  const plotW = Math.max(30, width - left - right);
  const plotH = height - top - bottom;
  const allMeans = presetIds.flatMap((id) => projections[id].groups.map((group) => group.meanSubtotal)).filter(finite);
  const maxValue = Math.max(1, ...allMeans) * 1.03;
  const step = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const axisMax = Math.ceil(maxValue / step * 2) / 2 * step;
  const groupIds = ['low', 'mid', 'high'];
  let body = `<text x="${left}" y="14" class="axis-label">Points moyens du sous-total / joueur</text>`;
  const ticks = compact ? 3 : 5;
  for (let index = 0; index <= ticks; index++) {
    const value = axisMax * index / ticks;
    const x = left + value / axisMax * plotW;
    body += `<line class="grid-line" x1="${x}" y1="${top}" x2="${x}" y2="${height - bottom}"/><text class="axis-label" x="${x}" y="${height - 10}" text-anchor="${index === 0 ? 'start' : index === ticks ? 'end' : 'middle'}">${plotNumber(value)}</text>`;
  }
  const groupH = plotH / 3;
  const barH = compact ? 13 : 18;
  const gap = compact ? 5 : 6;
  const chartDescription = [];
  groupIds.forEach((groupId, groupIndex) => {
    const group = current.groups.find((item) => item.id === groupId);
    const firstY = top + groupIndex * groupH + (compact ? 23 : (groupH - 3 * barH - 2 * gap) / 2);
    if (compact) body += `<text x="${left}" y="${firstY - 8}">${groupLabels[groupId]} · ${group?.completeCount ?? 0}/${group?.count ?? 22}</text>`;
    else body += `<text x="${left - 13}" y="${firstY + barH + gap}" text-anchor="end">${groupLabels[groupId]}</text><text class="axis-label" x="${left - 13}" y="${firstY + barH + gap + 18}" text-anchor="end">${group?.completeCount ?? 0} / ${group?.count ?? 22} joueurs estimables</text>`;
    presetIds.forEach((id, presetIndex) => {
      const source = projections[id].groups.find((item) => item.id === groupId);
      const value = source?.meanSubtotal;
      const y = firstY + presetIndex * (barH + gap);
      const w = finite(value) ? value / axisMax * plotW : 0;
      body += `<rect class="${id}" data-series="${id}" data-group="${groupId}" data-value="${finite(value) ? value : ''}" x="${left}" y="${y}" width="${w}" height="${barH}" rx="3" opacity="${id === state.preset ? 1 : .7}"/><text x="${left + w + 6}" y="${y + barH / 2 + 4}">${finite(value) ? plotNumber(value) : 'ND'}</text>`;
      chartDescription.push(`${groupLabels[groupId]}, ${presetName(id)} : ${finite(value) ? `${format(value)} points moyens` : 'non estimable'}`);
    });
  });
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Sous-totaux moyens projetés par groupe et barème"><title>Sous-totaux moyens projetés par groupe et barème</title><desc>${escape(chartDescription.join('. '))}</desc>${body}</svg>`;
}
function setup() {
  if (!data?.profiles?.length) { el('load-error').hidden = false; return; }
  const date = (value) => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  el('method-observation').textContent = `Activité récente observée du ${date(data.observation.startUtc)} au ${date(data.observation.endUtc)}. Les fréquences de mots, gobbles et cibles combinent des compteurs historiques avec l’activité récente. Ces extrapolations supposent une cadence constante ; elles ne garantissent ni les gains futurs ni les délais.`;
  renderEditor();
  document.querySelectorAll('[data-preset]').forEach((button) => button.addEventListener('click', () => {
    state.preset = button.dataset.preset;
    state.points = clonePoints(SCORING_PRESETS[state.preset].points);
    renderEditor(); update(); persist();
  }));
  el('horizon').addEventListener('change', () => { state.horizon = el('horizon').value; if (state.horizon !== 'days90') state.includePresenters = false; update(); persist(); });
  el('presenters').addEventListener('change', () => { state.includePresenters = el('presenters').checked && state.horizon === 'days90'; update(); persist(); });
  el('player').addEventListener('change', () => { state.player = el('player').value; renderPlayer(); renderRoster(); persist(); });
  el('sort').addEventListener('change', () => { state.sort = el('sort').value; renderRoster(); persist(); });
  el('restore-preset').addEventListener('click', () => { state.points = clonePoints(SCORING_PRESETS[state.preset].points); renderEditor(); update(); persist(); });
  el('weight-rows').addEventListener('input', (event) => {
    const input = event.target.closest('[data-weight-category]');
    if (!input) return;
    const value = input.value.trim() === '' ? NaN : Number(input.value);
    const valid = validPoint(value);
    input.setAttribute('aria-invalid', String(!valid));
    if (!valid) { el('editor-state').textContent = 'Saisis un nombre entier de points entre 0 et 1 000 000. La dernière valeur valide reste utilisée.'; return; }
    state.points[input.dataset.weightCategory][input.dataset.weightTier] = value;
    update(); persist();
  });
  let resizeFrame;
  new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(renderChart); }).observe(el('comparison-chart'));
  update();
}
try { setup(); } catch (error) { el('load-error').hidden = false; console.error('Atelier du barème indisponible', error); }
