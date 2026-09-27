import { normalizeWord } from "../../shared/gameLogic.js";
import {
  TRAINING_POOL_MODES,
  buildTrainingPoolRoundPlan,
  createTrainingRoomConfig,
} from "../training/trainingPoolConfig.js";

// These plans currently have the same generation parameters as the live 4×4
// room. Importing server/index.js would start the backend, so never do that here.
export const FREQUENCY_MODES = TRAINING_POOL_MODES;

export function buildFrequencyPayload(mode, sampleIndex) {
  const roomConfig = createTrainingRoomConfig();
  const roundPlan = buildTrainingPoolRoundPlan(mode, roomConfig);
  if (!roundPlan) throw new Error(`Type de manche inconnu : ${mode}`);
  return {
    roomConfig,
    roundPlan,
    roundNumber: sampleIndex + 1,
    // Same as the default live configuration: theme bonus disabled.
    cultureThemeOptions: { disabled: true },
  };
}

export function createSeededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFrequencyStats(mode) {
  return {
    mode,
    grids: 0,
    emptyPreparations: 0,
    qualityFallbacks: 0,
    totalWords: 0,
    minWords: null,
    maxWords: 0,
    counts: new Map(),
  };
}

export function addPreparedGrid(stats, prepared) {
  if (!prepared) {
    stats.emptyPreparations += 1;
    return false;
  }
  if (prepared.plan?.type !== stats.mode || !Array.isArray(prepared.grid) || prepared.grid.length !== 16) {
    throw new Error(`Grille invalide pour ${stats.mode}`);
  }
  if (!Array.isArray(prepared.solutions) || !prepared.solutions.length) {
    throw new Error("Grille sans solutions : vérifier le dictionnaire local");
  }
  const words = new Set();
  for (const entry of prepared.solutions) {
    const word = normalizeWord(String(entry?.word || ""));
    if (!word) throw new Error("Solution sans mot");
    words.add(word);
  }
  // Keep fallback grids returned by the production generator: discarding them
  // would silently sample a different distribution than the game.
  if (prepared.quality?.ok !== true) stats.qualityFallbacks += 1;
  stats.grids += 1;
  stats.totalWords += words.size;
  stats.minWords = Math.min(stats.minWords ?? Infinity, words.size);
  stats.maxWords = Math.max(stats.maxWords, words.size);
  for (const word of words) stats.counts.set(word, (stats.counts.get(word) || 0) + 1);
  return true;
}

export function wilsonInterval(hits, total) {
  if (!Number.isInteger(total) || total < 1 || !Number.isInteger(hits) || hits < 0 || hits > total) {
    throw new Error("Effectifs invalides pour l'intervalle de confiance");
  }
  const z = 1.959963984540054;
  const proportion = hits / total;
  const denominator = 1 + z * z / total;
  const center = (proportion + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt(proportion * (1 - proportion) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

export function buildFrequencyRows(stats, { minLength = 2, maxLength = 32 } = {}) {
  return [...stats.counts]
    .filter(([word]) => word.length >= minLength && word.length <= maxLength)
    .sort(([wordA, countA], [wordB, countB]) => countB - countA || (wordA < wordB ? -1 : wordA > wordB ? 1 : 0))
    .map(([word, hits], index) => {
      const [lower, upper] = wilsonInterval(hits, stats.grids);
      return {
        mode: stats.mode,
        rank: index + 1,
        word,
        length: word.length,
        hits,
        grids: stats.grids,
        frequencyPercent: 100 * hits / stats.grids,
        lower95Percent: 100 * lower,
        upper95Percent: 100 * upper,
        gridsPerAppearance: stats.grids / hits,
      };
    });
}

export function summarizeFrequencyStats(stats) {
  const { counts, ...summary } = stats;
  return {
    ...summary,
    distinctWords: counts.size,
    averageWords: stats.grids ? stats.totalWords / stats.grids : null,
  };
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function renderFrequencyCsv(rows) {
  const decimal = (value) => value.toFixed(4).replace(".", ",");
  const headers = ["type_manche", "rang", "mot", "lettres", "grilles_avec_mot", "grilles_analysees", "frequence_pct", "ic95_bas_pct", "ic95_haut_pct", "grilles_par_apparition"];
  const lines = rows.map((row) => [
    row.mode, row.rank, row.word, row.length, row.hits, row.grids,
    decimal(row.frequencyPercent), decimal(row.lower95Percent),
    decimal(row.upper95Percent), decimal(row.gridsPerAppearance),
  ].map(csvCell).join(";"));
  return `\uFEFF${[headers.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}

export function renderFrequencyHtml(report) {
  const serialized = JSON.stringify(report).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fréquence des mots dans les grilles Gobble</title>
<style>
body{font:16px system-ui,sans-serif;margin:32px auto;padding:0 20px;max-width:1250px;color:#172d3c;background:#f7fafc}
h1{font-size:26px}p{max-width:1000px;line-height:1.5}.controls{display:flex;flex-wrap:wrap;gap:16px;margin:24px 0}
label{display:flex;flex-direction:column;gap:5px;font-size:14px}input,select,button{font:inherit;padding:8px;border:1px solid #aec4d0;border-radius:5px;background:white}input[type=number]{width:90px}
.scroll{overflow:auto;max-height:65vh;border:1px solid #cbd8df}table{width:100%;border-collapse:collapse;background:white}th,td{padding:9px 12px;text-align:right;white-space:nowrap;border-bottom:1px solid #e2e9ed}th{position:sticky;top:0;background:#183c50;color:white}th:nth-child(2),td:nth-child(2){text-align:left}tbody tr:nth-child(even){background:#f1f6f9}.pages{display:flex;gap:16px;align-items:center;margin:16px 0}.note{color:#405b6a;font-size:14px}
</style>
<h1>Fréquence d’apparition des mots</h1>
<p>Simulation hors ligne de grilles 4×4 sélectionnées par le générateur Gobble. Un mot compte une fois par grille, quels que soient ses chemins. Aucune réponse de joueur n’entre dans le calcul.</p>
<p id="status"></p><p id="summary"></p>
<div class="controls">
<label>Type de manche<select id="mode"></select></label>
<label>Rechercher un mot<input id="search" type="search" placeholder="Tout ou partie du mot"></label>
<label>Longueur minimale<input id="min" type="number" min="2" max="32" value="2"></label>
<label>Longueur maximale<input id="max" type="number" min="2" max="32" value="32"></label>
<label>Trier par<select id="sort"><option value="frequency">Fréquence décroissante</option><option value="word">Mot A → Z</option><option value="length">Longueur croissante</option></select></label>
</div>
<div class="scroll"><table><thead><tr><th>Rang</th><th>Mot</th><th>Lettres</th><th>Grilles avec ce mot</th><th>Présence</th><th>Intervalle à 95 %</th><th>En moyenne, 1 sur…</th></tr></thead><tbody id="rows"></tbody></table></div>
<div class="pages"><button id="prev">Précédent</button><span id="page"></span><button id="next">Suivant</button></div>
<p class="note">L’intervalle de Wilson décrit l’incertitude d’échantillonnage pour chaque mot. Il ne corrige pas les différences entre cette configuration et la partie en ligne. Les mots absents de l’échantillon ne sont pas listés : cela ne signifie pas qu’ils sont impossibles. Les variantes et conjugaisons restent séparées. Les fréquences des types de manches ne sont pas mélangées.</p>
<p class="note">Les solutions des manches « 3 mots » décrivent les mots traçables, pas les combinaisons de trois choix et placements personnels. OCID n’est pas inclus dans cette analyse des manches de recherche de mots. Défi thème désactivé, comme dans la configuration par défaut.</p>
<p><a href="frequencies.csv">Tableau CSV complet</a> · <a href="report.json">Données et paramètres de l’analyse</a></p>
<script id="data" type="application/json">${serialized}</script>
<script>
const report=JSON.parse(document.getElementById('data').textContent);
const $=id=>document.getElementById(id);
const number=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2});
for(const mode of report.modes){const option=document.createElement('option');option.value=mode.mode;option.textContent=mode.label;$('mode').append(option);}
$('min').value=report.options.minLength;$('max').value=report.options.maxLength;
$('status').textContent=(report.status==='complete'?'Analyse terminée':'Analyse partielle — '+(report.error||'en cours'))+' · '+new Date(report.startedAt).toLocaleString('fr-FR')+' · graine : '+report.options.seed;
let page=0,filtered=[];
function render(){
 const mode=$('mode').value;const summary=report.modes.find(item=>item.mode===mode);
 const search=$('search').value.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replaceAll('œ','oe').trim();
 filtered=report.rows.filter(row=>row.mode===mode&&row.word.includes(search)&&row.length>=Number($('min').value)&&row.length<=Number($('max').value));
 const sort=$('sort').value;
 if(sort==='word')filtered.sort((a,b)=>a.word.localeCompare(b.word,'fr'));
 if(sort==='length')filtered.sort((a,b)=>a.length-b.length||b.hits-a.hits);
 const pages=Math.max(1,Math.ceil(filtered.length/100));page=Math.min(page,pages-1);
 $('summary').textContent=summary?number.format(summary.grids)+' grilles analysées sur '+number.format(report.options.count)+' demandées pour ce type · '+number.format(summary.distinctWords)+' mots distincts · '+summary.qualityFallbacks+' grilles de repli conservées · '+summary.emptyPreparations+' préparations sans résultat.':'';
 const fragment=document.createDocumentFragment();
 for(const row of filtered.slice(page*100,(page+1)*100)){
  const tr=document.createElement('tr');
  for(const value of [row.rank,row.word.toUpperCase(),row.length,number.format(row.hits)+' / '+number.format(row.grids),number.format(row.frequencyPercent)+' %',number.format(row.lower95Percent)+' – '+number.format(row.upper95Percent)+' %',number.format(row.gridsPerAppearance)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}
  fragment.append(tr);
 }
 $('rows').replaceChildren(fragment);$('page').textContent='Page '+(page+1)+' / '+pages+' · '+number.format(filtered.length)+' mots';$('prev').disabled=page===0;$('next').disabled=page>=pages-1;
}
for(const id of ['mode','search','min','max','sort'])$(id).addEventListener('input',()=>{page=0;render();});
$('prev').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};render();
</script></html>`;
}
