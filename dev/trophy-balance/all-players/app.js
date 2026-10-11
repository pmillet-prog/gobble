(() => {
  'use strict';
  const data = window.GOBBLE_POPULATION;
  const el = (id) => document.getElementById(id);
  if (!data?.profiles?.length || !data?.categories?.length) {
    el('load-error').hidden = false;
    return;
  }
  const number = (value, digits = 0) => Number.isFinite(value) ? value.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—';
  const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const date = (value) => new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
  const presets = { regular: [data.cohortDefaults?.minRounds || 100, data.cohortDefaults?.minActiveWeeks || 2], frequent: [200, 3], all: [1, 1] };
  const factors = data.scenario?.fractions || { bronze: .3, argent: .6, or: 1 };
  const calibration = data.scenario?.calibration;
  const modelVersion = calibration?.modelVersion || 'gold-90d-v1';
  let state = { cohort: 'regular', category: data.categories.find((c) => c.id === 'total_score_10000000')?.id || data.categories[0].id, tier: 'or', horizon: '90', player: null, sort: 'name' };
  try {
    const saved = JSON.parse(localStorage.getItem('gobble-population-scenario') || 'null');
    if (saved && typeof saved === 'object') {
      if (data.categories.some((c) => c.id === saved.category)) state.category = saved.category;
      if (saved.modelVersion === modelVersion) {
        if (presets[saved.cohort]) state.cohort = saved.cohort;
        if (factors[saved.tier]) state.tier = saved.tier;
        if (['30', '90', '365', 'rounds'].includes(saved.horizon)) state.horizon = saved.horizon;
      }
      if (['name', 'activity', 'performance', 'trophies'].includes(saved.sort)) state.sort = saved.sort;
      state.player = saved.player;
    }
  } catch { /* Storage can be disabled without affecting the simulation. */ }
  let current = null;
  const byName = (a, b) => a.nick.localeCompare(b.nick, 'fr', { sensitivity: 'base' });
  el('category').innerHTML = data.categories.map((c) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
  for (const key of ['cohort', 'category', 'tier', 'horizon', 'sort']) el(key).value = state[key];
  el('observation').textContent = `Activité observée du ${date(data.observation.startUtc)} au ${date(data.observation.endUtc)} · ${data.profiles.length} comptes actifs disponibles · dernière semaine partielle.`;
  el('coverage-note').textContent = 'Seuls les comptes joueurs identifiés disposant d’activité récente sont retenus ; les lignes historiques dupliquées ne sont pas additionnées. La définition de « régulier » est un filtre d’étude modifiable, pas un statut du jeu.';
  const unexplained = data.unprojectedCategories || [];
  el('unprojected-note').textContent = `Les ${unexplained.length || 9} catégories de podium ou d’exploit ponctuel suivent les règles distinctes du récapitulatif ci-dessus. Elles restent hors de la cible de 50 % à 90 jours : aucune fréquence fiable n’est calculée et aucune absence de données n’est assimilée à zéro.`;
  el('event-rules-list').innerHTML = [...unexplained].sort((a, b) => Number(a.rule?.scope === 'weekly') - Number(b.rule?.scope === 'weekly')).map((category) => {
    const rule = category.rule;
    if (!rule) return `<article class="event-rule" data-event-category="${escape(category.id)}"><h3>${escape(category.name)}</h3><p>Règle non disponible dans ce relevé.</p><p>Fréquence non mesurée.</p></article>`;
    const rarity = rule.rarityLabel ? `<small>Intention : ${escape(rule.rarityLabel)}.</small>` : '';
    const priority = rule.scoringPriorityLabel ? `<small>${escape(rule.scoringPriorityLabel)}</small>` : '';
    return `<article class="event-rule" data-event-category="${escape(category.id)}" data-repeatable="${rule.tiers?.length ? 'by-tier' : String(rule.repeatable)}" data-rarity="${escape(rule.rarity || '')}"><h3>${escape(category.name)}</h3><p>${escape(rule.conditionLabel)}</p><p><strong>${escape(rule.repeatabilityLabel)}</strong>${rarity}${priority}</p></article>`;
  }).join('');
  const requiredPlayers = calibration?.requiredPlayers || 33;
  const meetingTarget = data.categories.filter((category) => category.calibration?.targetRequired !== false && category.calibration?.newReachedPlayers >= requiredPlayers).length;
  const medalException = data.categories.find((category) => category.id === 'mini_gold_5000');
  const medalCoverage = medalException?.calibration;
  const medalExceptionText = `Exception : ${number(medalException?.threshold)} médailles d’or de mini-tournoi, soit ${number(medalCoverage?.newReachedPlayers)} / ${number(medalCoverage?.totalPlayers)} joueurs (environ ${number(medalCoverage?.newReachedPlayers / medalCoverage?.totalPlayers * 100)} %).`;
  el('calibration-goal').textContent = `${meetingTarget} cumuls sur ${data.categories.length} visent au moins ${requiredPlayers} joueurs sur ${calibration?.cohortSize || 66} obtenant l’or en ${calibration?.horizonDays || 90} jours, à rythme constant. ${medalExceptionText}`;
  el('calibration-summary').textContent = 'Les seuils d’or suivent désormais des nombres ronds. Bronze et argent restent à 30 % et 60 %. La cible est vérifiée catégorie par catégorie, avec une exception pour les médailles d’or de mini-tournoi ; les joueurs qui l’atteignent peuvent différer. Clique sur une catégorie pour l’explorer avec les 66 réguliers, en or et sur 90 jours.';
  el('calibration-rows').innerHTML = data.categories.map((category) => {
    const c = category.calibration || {};
    const warning = category.id.includes('foukro') ? ' · très provisoire' : '';
    const exception = c.exception ? `<small>${escape(c.exception.label)} Objectif de 50 % non atteint.</small>` : '';
    return `<tr data-calibration-category="${escape(category.id)}"><td><button type="button" data-explore-category="${escape(category.id)}">${escape(category.name)}</button><small>${escape(category.unit)}${warning}</small>${exception}</td><td>${number(category.catalogueThreshold)}</td><td>${number(category.threshold * factors.bronze)}</td><td>${number(category.threshold * factors.argent)}</td><td><strong>${number(category.threshold)}</strong></td><td>${number(c.oldReachedPlayers)} → <strong>${number(c.newReachedPlayers)} / ${number(c.totalPlayers)}</strong>${category.id === 'mini_gold_5000' ? `<small>Environ ${number(c.newReachedPlayers / c.totalPlayers * 100)} % · exception</small>` : ''}${finite(c.knownPlayers) && c.knownPlayers < c.totalPlayers ? `<small>${c.totalPlayers - c.knownPlayers} non estimable</small>` : ''}</td></tr>`;
  }).join('');

  function projection(player, category, threshold) {
    const metric = player.metrics?.[category.id];
    const rate = state.horizon === 'rounds' ? metric?.perRound : metric?.perDay;
    const valid = finite(rate) && rate >= 0;
    const amount = valid ? rate * (state.horizon === 'rounds' ? 1000 : Number(state.horizon)) : null;
    const repeatable = state.tier === 'or';
    const uncappedProgress = valid ? amount / threshold : null;
    const trophies = valid ? Math.floor(uncappedProgress + 1e-10) : null;
    return { player, metric, rate, valid, amount, repeatable, progress: valid ? (repeatable ? uncappedProgress : Math.min(1, uncappedProgress)) : null, trophies: valid ? (repeatable ? trophies : Math.min(1, trophies)) : null, delay: finite(rate) && rate > 0 ? threshold / rate : null };
  }
  function delayText(value) {
    if (!finite(value)) return 'Non estimable';
    if (state.horizon === 'rounds') return `${number(Math.ceil(value))} manches`;
    if (value < 1) return '< 1 jour';
    return `${number(value, value < 100 ? 1 : 0)} jours`;
  }
  function reason(row) {
    if (state.horizon === 'rounds' && !finite(row.metric?.perRound)) return 'Fréquence par manche indisponible';
    if (row.metric?.status === 'non_positive_observed') return 'Gains nets non positifs sur la période observée';
    if (row.rate === 0) return 'Aucun gain observé sur la période disponible';
    return 'Données insuffisantes';
  }
  function persist() {
    try { localStorage.setItem('gobble-population-scenario', JSON.stringify({ ...state, modelVersion })); } catch { /* Optional storage. */ }
  }
  function update() {
    const [minRounds, minWeeks] = presets[state.cohort];
    const profiles = data.profiles.filter((p) => p.recentRounds >= minRounds && p.activeWeeks >= minWeeks).sort(byName);
    const category = data.categories.find((c) => c.id === state.category);
    const threshold = category.threshold * factors[state.tier];
    const rows = profiles.map((p) => projection(p, category, threshold));
    const known = rows.filter((r) => r.valid);
    const earned = known.filter((r) => r.trophies >= 1);
    const delays = rows.map((r) => r.delay).filter(finite).sort((a, b) => a - b);
    const median = delays.length ? (delays[Math.floor((delays.length - 1) / 2)] + delays[Math.floor(delays.length / 2)]) / 2 : null;
    if (!profiles.some((p) => String(p.userId) === String(state.player))) state.player = profiles.find((p) => p.nick.toLowerCase() === 'nicole')?.userId ?? profiles[0]?.userId;
    current = { profiles, category, threshold, rows, known, earned, median };
    el('cohort-definition').textContent = `${profiles.length} joueurs retenus : au moins ${number(minRounds)} ${minRounds === 1 ? 'manche au total' : 'manches au total'} et de l’activité sur au moins ${minWeeks} ${minWeeks === 1 ? 'semaine' : 'semaines'} dans la période observée.`;
    el('reach-number').textContent = known.length && profiles.length ? `${earned.length} / ${profiles.length} · ${number(earned.length / profiles.length * 100)} %` : 'Non estimable';
    el('reach-label').textContent = `joueurs atteindraient ${state.tier === 'or' ? 'au moins un or' : `le palier ${state.tier}, unique`}${known.length !== profiles.length ? ` · ${profiles.length - known.length} sans projection` : ''}`;
    el('threshold-note').textContent = `${category.name} ${state.tier} : ${number(threshold)} ${category.unit} (${state.tier === 'or' ? 'répétable' : 'une seule fois'}). ${state.horizon === 'rounds' ? 'Même volume : 1 000 manches par joueur.' : `${state.horizon} jours en conservant le rythme propre à chacun.`}`;
    el('distribution-intro').textContent = `Seuil ${state.tier} : ${number(threshold)} ${category.unit}. ${state.tier === 'or' ? 'L’or se répète à chaque nouvelle tranche de ce seuil.' : 'Ce jalon est obtenu une seule fois, même si le cumul dépasse son seuil.'}`;
    el('distribution-note').textContent = `${known.length} projections exploitables sur ${profiles.length} joueurs, dont ${known.filter((r) => r.rate === 0).length} au taux observé nul. ${profiles.length - known.length} projection(s) indisponible(s) : elles restent dans le dénominateur et ne comptent pas parmi les réussites.`;
    el('delay-summary').textContent = median === null ? 'Aucun délai médian estimable avec ces données.' : `Premier trophée : médiane de ${delayText(median)}, parmi les ${delays.length} joueurs au taux strictement positif. ${rows.length - delays.length} délai(s) non estimable(s).`;
    el('player').innerHTML = profiles.map((p) => `<option value="${p.userId}">${escape(p.nick)}</option>`).join('');
    el('player').value = state.player;
    el('roster-summary').textContent = `Voir les données des ${profiles.length} joueurs`;
    el('reward-column').textContent = state.tier === 'or' ? 'Ors projetés' : `Palier ${state.tier}`;
    const isCalibrationView = state.cohort === 'regular' && state.tier === 'or' && state.horizon === '90';
    const exceptionContext = category.calibration?.exception ? ` Médailles d’or : exception à ${number(category.threshold)}, avec ${number(category.calibration.newReachedPlayers)} / ${number(category.calibration.totalPlayers)} joueurs projetés à 90 jours.` : '';
    el('calibration-context').textContent = `${isCalibrationView ? 'Vue de référence : 9 cumuls visent la moitié des 66 réguliers, avec une exception.' : 'Exploration libre ; référence fixe de 66 réguliers sur 90 jours, avec une exception.'}${exceptionContext}`;
    document.querySelectorAll('[data-calibration-category]').forEach((row) => row.classList.toggle('selected', row.dataset.calibrationCategory === state.category));
    const source = category.source;
    const isFoukro = category.id.includes('foukro');
    const isJulien = category.id.includes('julien');
    el('source-note').textContent = isFoukro ? 'FouKro : points confirmés nets, sur environ deux jours de suivi seulement. Projection très fragile ; les gains nets non positifs n’ont pas de délai estimable.' : isJulien ? 'Julien : réponses correctes suivies depuis le 20 septembre 2026. La durée d’observation est ajustée pour les comptes plus récents.' : source === 'lifetime' ? 'Fréquence historique par manche × activité récente du joueur. Ce mélange de périodes donne un ordre de grandeur, pas une prévision.' : 'Projection fondée sur les agrégats observés ; elle suppose que le rythme du joueur se maintient.';
    drawCharts();
    updatePlayer();
    updateTable();
  }
  function updatePlayer() {
    const row = current.rows.find((r) => String(r.player.userId) === String(state.player));
    if (!row) { el('player-detail').textContent = 'Aucun joueur pour cette sélection.'; return; }
    const p = row.player;
    const reward = row.repeatable ? `${number(row.trophies)} ${row.trophies === 1 ? 'or projeté' : 'ors projetés'}` : row.trophies ? 'Palier obtenu' : 'Palier non atteint';
    const result = row.valid ? `<strong>${reward}</strong> · ${number(row.progress * 100, 1)} % du seuil ${row.repeatable ? 'd’un or' : `du palier ${state.tier}`}` : `<strong>Projection non estimable</strong> · ${escape(reason(row))}`;
    const metricObservation = finite(row.metric?.observationDays) ? ` Compteur observé sur ${number(row.metric.observationDays, 1)} jours${row.metric.source === 'lifetime' ? ' (historique)' : ''}.` : '';
    el('player-detail').innerHTML = `<p><strong>${escape(p.nick)}</strong> · ${number(p.roundsPerDay * 7, 1)} manches / semaine · ${number(p.scorePerRound)} points / manche</p><p class="result">${result}</p><p class="detail-note">Premier trophée : ${escape(delayText(row.delay))}${row.rate === 0 ? ` · ${escape(reason(row))}` : ''}. Activité récente : ${number(p.recentRounds)} manches sur ${number(p.exposureDays, 1)} jours, ${p.activeWeeks} semaines actives.${metricObservation}</p>`;
  }
  function updateTable() {
    const rows = [...current.rows].sort((a, b) => state.sort === 'activity' ? b.player.roundsPerDay - a.player.roundsPerDay || byName(a.player, b.player) : state.sort === 'performance' ? b.player.scorePerRound - a.player.scorePerRound || byName(a.player, b.player) : state.sort === 'trophies' ? (b.trophies ?? -1) - (a.trophies ?? -1) || byName(a.player, b.player) : byName(a.player, b.player));
    el('rows').innerHTML = rows.map((r) => `<tr${String(r.player.userId) === String(state.player) ? ' class="selected"' : ''}><td>${escape(r.player.nick)}</td><td>${number(r.player.roundsPerDay * 7, 1)}</td><td>${number(r.player.scorePerRound)}</td><td>${r.valid ? (r.repeatable ? number(r.trophies) : r.trophies ? 'Obtenu' : 'Non atteint') : 'Non estimable'}</td><td>${escape(delayText(r.delay))}</td></tr>`).join('');
  }
  const markClass = (row) => !row.valid ? 'unknown' : row.trophies > 0 ? 'earned' : 'pending';
  function svg(width, height, title, desc, body) {
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title><desc>${escape(desc)}</desc>${body}</svg>`;
  }
  function drawScatter() {
    const host = el('scatter');
    const width = host.clientWidth;
    const height = host.clientHeight;
    const margin = { left: 53, right: 14, top: 26, bottom: 53 };
    const plotW = Math.max(20, width - margin.left - margin.right);
    const plotH = height - margin.top - margin.bottom;
    const rows = current.rows.filter((r) => finite(r.player.scorePerRound) && finite(r.player.roundsPerDay));
    const xMax = Math.max(1, ...rows.map((r) => r.player.roundsPerDay * 7)) * 1.08;
    const yMax = Math.max(1, ...rows.map((r) => r.player.scorePerRound)) * 1.08;
    const x = (value) => margin.left + value / xMax * plotW;
    const y = (value) => margin.top + plotH - value / yMax * plotH;
    let body = `<text x="${margin.left}" y="13" class="axis-label">Points par manche</text>`;
    const ticks = width < 350 ? 3 : 4;
    for (let i = 0; i <= ticks; i++) {
      const value = i / ticks;
      body += `<line class="grid-line" x1="${margin.left}" y1="${y(yMax * value)}" x2="${width - margin.right}" y2="${y(yMax * value)}"/><text x="${margin.left - 8}" y="${y(yMax * value) + 4}" text-anchor="end">${number(yMax * value)}</text><text x="${x(xMax * value)}" y="${height - margin.bottom + 22}" text-anchor="${i === ticks ? 'end' : i === 0 ? 'start' : 'middle'}">${number(xMax * value)}</text>`;
    }
    body += `<text x="${margin.left + plotW / 2}" y="${height - 6}" text-anchor="middle" class="axis-label">Manches jouées par semaine</text>`;
    const points = rows.map((row) => ({ row, x: x(row.player.roundsPerDay * 7), y: y(row.player.scorePerRound) }));
    body += points.map((p) => `<circle class="point ${markClass(p.row)}" data-player-id="${p.row.player.userId}" cx="${p.x}" cy="${p.y}" r="4.5"/>`).join('');
    const selected = points.find((p) => String(p.row.player.userId) === String(state.player));
    if (selected) body += `<circle class="selected-point" cx="${selected.x}" cy="${selected.y}" r="8"/>`;
    body += `<rect class="hit" data-scatter-hit x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}"/>`;
    host.innerHTML = svg(width, height, 'Activité et rendement des joueurs', `${rows.length} joueurs. Axe horizontal : manches par semaine. Axe vertical : points par manche. Une liste accessible sous les graphiques permet de sélectionner un joueur.`, body);
    host.querySelector('[data-scatter-hit]').addEventListener('click', (event) => {
      const rect = host.querySelector('svg').getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const nearest = points.reduce((best, point) => !best || Math.hypot(point.x - px, point.y - py) < Math.hypot(best.x - px, best.y - py) ? point : best, null);
      if (nearest) {
        state.player = nearest.row.player.userId;
        el('player').value = state.player;
        drawScatter(); updatePlayer(); updateTable(); persist();
      }
    });
  }
  function drawDistribution() {
    const host = el('distribution');
    const width = host.clientWidth;
    const height = host.clientHeight;
    const bins = [
      { label: ['0–<25 %', 'du seuil'], count: 0, color: 'pending' },
      { label: ['25–<50 %', 'du seuil'], count: 0, color: 'pending' },
      { label: ['50–<100 %', 'du seuil'], count: 0, color: 'pending' },
      ...(state.tier === 'or' ? [
        { label: ['1', 'or'], count: 0, color: 'earned' },
        { label: ['2–4', 'ors'], count: 0, color: 'earned' },
        { label: ['5 et +', 'ors'], count: 0, color: 'earned' }
      ] : [{ label: ['Obtenu', 'une fois'], count: 0, color: 'earned' }])
    ];
    for (const row of current.known) bins[row.progress < .25 ? 0 : row.progress < .5 ? 1 : row.trophies < 1 ? 2 : state.tier !== 'or' || row.trophies < 2 ? 3 : row.trophies < 5 ? 4 : 5].count++;
    if (!current.known.length) {
      host.innerHTML = '<div class="unavailable">Aucune projection exploitable pour ce mode. Pour Julien et FouKro, choisis une durée en jours : les fréquences par manche sont inconnues.</div>';
      return;
    }
    if (width < 350) {
      const left = 70, right = 27, top = 30, bottom = 30;
      const plotW = width - left - right, plotH = height - top - bottom;
      const max = Math.max(1, ...bins.map((b) => b.count));
      const tickMax = Math.ceil(max / 3) * 3;
      const step = plotH / bins.length;
      let body = `<text x="${left}" y="13" class="axis-label">Nombre de joueurs</text>`;
      for (let i = 0; i <= 3; i++) {
        const xx = left + plotW * i / 3;
        body += `<line class="grid-line" x1="${xx}" y1="${top}" x2="${xx}" y2="${height - bottom}"/><text x="${xx}" y="${height - 8}" text-anchor="middle">${tickMax * i / 3}</text>`;
      }
      bins.forEach((bin, index) => {
        const cy = top + step * (index + .5);
        const w = bin.count / tickMax * plotW;
        body += `<text x="${left - 8}" y="${cy - 4}" text-anchor="end" class="axis-label">${bin.label[0]}</text><text x="${left - 8}" y="${cy + 14}" text-anchor="end" class="axis-label">${bin.label[1]}</text><rect class="${bin.color}" data-bin="${index}" data-count="${bin.count}" x="${left}" y="${cy - 10}" width="${w}" height="22" rx="3"/><text x="${left + w + 6}" y="${cy + 5}">${bin.count}</text>`;
      });
      host.innerHTML = svg(width, height, 'Répartition des progressions et trophées projetés', bins.map((b) => `${b.label.join(' ')} : ${b.count} joueurs`).join('. '), body);
      return;
    }
    const left = 34, right = 9, top = 26, bottom = 62;
    const plotH = height - top - bottom, plotW = width - left - right;
    const max = Math.max(1, ...bins.map((b) => b.count));
    const step = plotW / bins.length;
    let body = `<text x="${left}" y="13" class="axis-label">Nombre de joueurs</text>`;
    const tickMax = Math.ceil(max / 4) * 4;
    for (let i = 0; i <= 4; i++) {
      const yy = top + plotH - plotH * i / 4;
      body += `<line class="grid-line" x1="${left}" y1="${yy}" x2="${width - right}" y2="${yy}"/><text x="${left - 7}" y="${yy + 4}" text-anchor="end">${tickMax * i / 4}</text>`;
    }
    bins.forEach((bin, index) => {
      const cx = left + step * (index + .5);
      const h = bin.count / tickMax * plotH;
      body += `<rect class="${bin.color}" data-bin="${index}" data-count="${bin.count}" x="${cx - step * .31}" y="${top + plotH - h}" width="${step * .62}" height="${h}" rx="3"/><text x="${cx}" y="${top + plotH - h - 7}" text-anchor="middle">${bin.count}</text><text x="${cx}" y="${height - bottom + 22}" text-anchor="middle" class="axis-label">${bin.label[0]}</text><text x="${cx}" y="${height - bottom + 37}" text-anchor="middle" class="axis-label">${bin.label[1]}</text>`;
    });
    host.innerHTML = svg(width, height, 'Répartition des progressions et trophées projetés', bins.map((b) => `${b.label.join(' ')} : ${b.count} joueurs`).join('. '), body);
  }
  function drawCharts() { if (current) { drawScatter(); drawDistribution(); } }
  function returnToCalibration(categoryId = state.category) {
    state.category = categoryId;
    state.cohort = 'regular'; state.tier = 'or'; state.horizon = '90';
    for (const key of ['category', 'cohort', 'tier', 'horizon']) el(key).value = state[key];
    update(); persist();
  }
  el('reset-calibration').addEventListener('click', () => returnToCalibration());
  document.querySelectorAll('[data-explore-category]').forEach((button) => button.addEventListener('click', () => {
    returnToCalibration(button.dataset.exploreCategory);
    document.querySelector('.controls').scrollIntoView({ block: 'start' });
  }));
  for (const key of ['cohort', 'category', 'tier', 'horizon']) el(key).addEventListener('change', () => { state[key] = el(key).value; update(); persist(); });
  el('player').addEventListener('change', () => { state.player = el('player').value; drawScatter(); updatePlayer(); updateTable(); persist(); });
  el('sort').addEventListener('change', () => { state.sort = el('sort').value; updateTable(); persist(); });
  let resizeFrame;
  const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(drawCharts); });
  observer.observe(el('scatter')); observer.observe(el('distribution'));
  update();
})();
