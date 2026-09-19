import React from "react";
import { fetchChalkboardArchives } from "./chalkboardApi.js";
import ChalkboardArchiveImage from "./ChalkboardArchiveImage.jsx";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import "./chalkboardArchives.css";

const weekLabel = weekId => `Semaine du ${new Date(`${weekId}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}`;

export default function ChalkboardArchives({ onClose }) {
  const [archives, setArchives] = React.useState([]);
  const [selected, setSelected] = React.useState("");
  const [next, setNext] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const requestRef = React.useRef(null);
  const load = React.useCallback(async (before) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await fetchChalkboardArchives({ before, signal: controller.signal });
      if (controller.signal.aborted) return;
      setArchives(current => before ? [...current, ...result.archives] : result.archives);
      setSelected(current => current || result.archives[0]?.weekId || "");
      setNext(result.next);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message === "maintenance_mode" ? "Les archives sont indisponibles pendant la mise à jour." : "Impossible de charger les archives pour le moment.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  React.useEffect(() => { void load(); return () => requestRef.current?.abort(); }, [load]);
  React.useEffect(() => {
    const close = event => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  const archive = archives.find(item => item.weekId === selected);
  const index = archives.indexOf(archive);
  return <main className="chalkboard-app chalkboard-archives">
    <header className="chalkboard-header">
      <button type="button" className="chalkboard-back" onClick={onClose}><ChalkboardIcon name="back" /><span>Tableau actuel</span></button>
      <div className="chalkboard-heading"><h1>Les tableaux précédents</h1><span>Les contributions de chaque semaine, en images</span></div>
    </header>
    <nav className="chalkboard-archive-picker" aria-label="Choisir une semaine">
      <button disabled={index < 0 || index >= archives.length - 1} onClick={() => setSelected(archives[index + 1].weekId)} aria-label="Semaine précédente">‹</button>
      <select aria-label="Semaine du tableau" value={selected} disabled={!archives.length} onChange={event => setSelected(event.target.value)}>
        {!archives.length && <option value="">{loading ? "Chargement…" : "Aucun tableau archivé"}</option>}
        {archives.map(item => <option key={item.weekId} value={item.weekId}>{weekLabel(item.weekId)}</option>)}
      </select>
      <button disabled={index <= 0} onClick={() => setSelected(archives[index - 1].weekId)} aria-label="Semaine suivante">›</button>
      {next && <button disabled={loading} onClick={() => load(next)}>{loading ? "Chargement…" : "Plus anciennes"}</button>}
    </nav>
    {error && <div className="chalkboard-archive-error" role="alert">{error} <button disabled={loading} onClick={() => load(next)}>Réessayer</button></div>}
    {archive ? <ChalkboardArchiveImage key={archive.weekId} archive={archive} /> : <div className="chalkboard-archive-empty" role="status">{loading ? "Chargement des archives…" : !error ? "Les tableaux apparaîtront ici après leur archivage du lundi." : ""}</div>}
  </main>;
}
