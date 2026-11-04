import React from "react";
import { normalizeFinaleText } from "../../shared/infortuneFinaleRules.js";
import "./poolReview.css";

const PAGE_SIZE = 25;
const KINDS = { riddle: "Énigme", quiz: "Culture générale", definition: "Définition" };
export const INITIAL_REVIEW_FILTERS = { query: "", kind: "", category: "", difficulty: "", page: 0 };

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return <nav className="finale-pool-review__pagination" aria-label="Pages du pool">
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}>← Précédente</button>
    <span>Page {page + 1} sur {pages}</span>
    <button type="button" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Suivante →</button>
  </nav>;
}

export default function FinalePoolReview({ bank, filters, onFiltersChange, onTry }) {
  const listHeading = React.useRef(null);
  const categories = React.useMemo(() => [...new Set(bank.puzzles.map(puzzle => puzzle.category))]
    .sort((a, b) => a.localeCompare(b, "fr")), [bank]);
  const entries = React.useMemo(() => bank.puzzles.map(puzzle => ({ puzzle,
    search: normalizeFinaleText([puzzle.id, puzzle.clue, puzzle.answer, puzzle.category,
      ...(puzzle.acceptedAnswers || []), ...(puzzle.excludedAnswers || [])].join(" ")),
  })), [bank]);
  const matches = React.useMemo(() => {
    const terms = normalizeFinaleText(filters.query).split(/\s+/).filter(Boolean);
    return entries.filter(({ puzzle, search }) => (!filters.kind || puzzle.kind === filters.kind)
      && (!filters.category || puzzle.category === filters.category)
      && (!filters.difficulty || puzzle.difficulty === Number(filters.difficulty))
      && terms.every(term => search.includes(term))).map(entry => entry.puzzle);
  }, [entries, filters.query, filters.kind, filters.category, filters.difficulty]);
  const pages = Math.ceil(matches.length / PAGE_SIZE);
  const page = Math.min(filters.page, Math.max(0, pages - 1));
  const visible = matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const change = (field, value) => onFiltersChange({ ...filters, [field]: value, page: 0 });
  const changePage = value => {
    onFiltersChange({ ...filters, page: value });
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({ block: "start" });
  };

  return <section className="finale-pool-review" aria-labelledby="finale-pool-title">
    <header className="finale-pool-review__heading"><h1 id="finale-pool-title">Relire le pool en clair</h1>
      <p>Les énoncés, réponses et variantes sont visibles directement. Chaque texte garde son identifiant pour faciliter les corrections.</p></header>
    <div className="finale-pool-review__filters" role="search" aria-label="Rechercher dans le pool">
      <label className="finale-pool-review__search">Rechercher
        <input type="search" value={filters.query} placeholder="Un mot, une réponse, un identifiant…"
          onChange={event => change("query", event.target.value)} /></label>
      <label>Type<select value={filters.kind} onChange={event => change("kind", event.target.value)}>
        <option value="">Tous les types</option>{Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Thème<select value={filters.category} onChange={event => change("category", event.target.value)}>
        <option value="">Tous les thèmes</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}
      </select></label>
      <label>Difficulté<select value={filters.difficulty} onChange={event => change("difficulty", event.target.value)}>
        <option value="">Tous les niveaux</option><option value="1">1 · Accessible</option>
        <option value="2">2 · Intermédiaire</option><option value="3">3 · Plus exigeant</option>
      </select></label>
      <button type="button" onClick={() => onFiltersChange({ ...INITIAL_REVIEW_FILTERS })}>Tout afficher</button>
    </div>
    <div className="finale-pool-review__results">
      <h2 ref={listHeading} tabIndex={-1} role="status">{matches.length} texte{matches.length !== 1 ? "s" : ""} sur {bank.puzzles.length}
        {matches.length > PAGE_SIZE && <small> · {page * PAGE_SIZE + 1} à {Math.min((page + 1) * PAGE_SIZE, matches.length)}</small>}</h2>
      <Pagination page={page} pages={pages} onPage={changePage} />
    </div>
    {visible.length ? <ol className="finale-pool-review__list" start={page * PAGE_SIZE + 1}>
      {visible.map(puzzle => <li key={puzzle.id}><article className="finale-pool-card" aria-labelledby={`review-${puzzle.id}`}>
        <header><h3 id={`review-${puzzle.id}`}>{puzzle.id}</h3><span>{KINDS[puzzle.kind]}</span>
          <span>{puzzle.category}</span><span>Niveau {puzzle.difficulty}/3</span>
          <span className="finale-pool-card__status">{puzzle.status === "reviewed" ? "Relu" : "Brouillon"}</span></header>
        <p className="finale-pool-card__clue">{puzzle.clue}</p>
        <dl className="finale-pool-card__answers"><div><dt>Réponse</dt><dd>{puzzle.answer}</dd></div>
          {puzzle.acceptedAnswers?.length > 0 && <div><dt>Également accepté</dt><dd>{puzzle.acceptedAnswers.join(" · ")}</dd></div>}
          {puzzle.excludedAnswers?.length > 0 && <div><dt>Explicitement refusé</dt><dd>{puzzle.excludedAnswers.join(" · ")}</dd></div>}
        </dl>
        {puzzle.editorial?.note && <p className="finale-pool-card__note">Note de relecture : {puzzle.editorial.note}</p>}
        <footer>{puzzle.source?.url
          ? <a href={puzzle.source.url} target="_blank" rel="noreferrer">Référence du fait ↗</a>
          : <span>{puzzle.kind === "quiz" ? "Référence à compléter" : "Énigme rédigée pour le jeu"}</span>}
          <button type="button" onClick={() => onTry(puzzle)}>Essayer sur le tableau →</button></footer>
      </article></li>)}
    </ol> : <p className="finale-pool-review__empty">Aucun texte ne correspond à ces critères.</p>}
    <Pagination page={page} pages={pages} onPage={changePage} />
  </section>;
}
