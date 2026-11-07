import React from "react";
import { WHEEL_SURVEY, WHEEL_DIAGNOSTIC_STEPS, WHEEL_FLUIDITY } from "../../../../shared/wheelDiagnostic.js";
import WheelDiagnosticSummary from "./WheelDiagnosticSummary.jsx";
import { recommendWheelGraphics, wheelGraphicsReason } from "../../../../shared/wheelGraphicsRecommendation.js";
import { diagnosticProfileLabel } from "../../../../shared/wheelDiagnostic.js";

function Recommendation({ report }) {
  const recommendation = recommendWheelGraphics(report);
  return <p><strong>Réglage conseillé par les mesures : {recommendation.profile ? diagnosticProfileLabel(recommendation.profile) : "à mesurer"}.</strong>{" "}
    {wheelGraphicsReason(recommendation)} {!report.environment.deviceId && "Ancien rapport : appareil non identifié de façon persistante."}</p>;
}

export default function WheelDiagnosticsAdmin() {
  const [data, setData] = React.useState({ entries: [], total: 0 }), [busy, setBusy] = React.useState(true), [error, setError] = React.useState("");
  const [before, setBefore] = React.useState(null), [refresh, setRefresh] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    const abort = new AbortController(); setBusy(true); setError("");
    const timer = setTimeout(() => abort.abort(), 15000);
    fetch(`/api/dev/infortune/diagnostics${before ? `?before=${before}` : ""}`, { credentials: "same-origin", cache: "no-store", signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error([401, 403].includes(response.status) ? "Connecte-toi avec un compte autorisé au menu dev pour consulter les diagnostics." : "Les diagnostics ne sont pas disponibles pour le moment.");
        const body = await response.json(); if (!body.ok || !Array.isArray(body.entries)) throw new Error("Réponse du serveur invalide.");
        if (active) setData(body);
      }).catch(failure => { if (active) setError(abort.signal.aborted ? "Le serveur n’a pas répondu à temps." : failure.message); })
      .finally(() => { clearTimeout(timer); if (active) setBusy(false); });
    return () => { active = false; clearTimeout(timer); abort.abort(); };
  }, [before, refresh]);
  return <main className="wheel-test wheel-diagnostic__admin">
    <nav className="wheel-test__nav"><a href="/">← Accueil de Gobble</a><a href="/entrainement/roue/index.html">Ouvrir le test joueur</a></nav>
    <header className="wheel-test__heading"><p>MENU DEV</p><h1>Diagnostics de la roue</h1>
      <p>{data.total} retour{data.total > 1 ? "s" : ""} enregistré{data.total > 1 ? "s" : ""} · mesures et ressenti des volontaires</p></header>
    <button disabled={busy} onClick={() => { setBefore(null); setRefresh(value => value + 1); }}>Actualiser les derniers retours</button>
    {busy && <p role="status">Chargement des diagnostics…</p>}{error && <p role="alert">{error}</p>}
    {!busy && !error && !data.entries.length && <p>Aucun retour enregistré pour le moment.</p>}
    {!error && data.entries.map(entry => <details className="wheel-test__card wheel-diagnostic__entry" key={entry.seq}>
      <summary><strong>{entry.nick}</strong> · {new Date(entry.createdAt).toLocaleString("fr-FR")} ·
        {WHEEL_SURVEY.find(q => q.id === "preferred").options[entry.report.survey.preferred]} · {entry.report.runs.length} passage(s)</summary>
      <p>{entry.report.environment.userAgent}</p>
      <Recommendation report={entry.report} />
      <p>Écran : {entry.report.environment.width} × {entry.report.environment.height}, densité {entry.report.environment.pixelRatio} ·
        cœurs annoncés : {entry.report.environment.cores ?? "—"} · mémoire annoncée : {entry.report.environment.memory ?? "—"} Go · compte : {entry.userId ?? "invité"}</p>
      <h2>Ressenti</h2><dl className="wheel-diagnostic__answers">
        {WHEEL_DIAGNOSTIC_STEPS.map(step => <div key={step.profile}><dt>{step.label}</dt><dd>{WHEEL_FLUIDITY[entry.report.survey.fluidity[step.profile]]}</dd></div>)}
        {WHEEL_SURVEY.map(question => <div key={question.id}><dt>{question.label}</dt><dd>{question.options[entry.report.survey[question.id]]}</dd></div>)}
      </dl>{entry.report.survey.comment && <blockquote>{entry.report.survey.comment}</blockquote>}
      <h2>Mesures</h2><WheelDiagnosticSummary runs={entry.report.runs} detailed />
    </details>)}
    {data.nextBefore && !error && <button disabled={busy} onClick={() => setBefore(data.nextBefore)}>Retours plus anciens</button>}
    <p className="wheel-diagnostic__hint">Les qualités sont imposées pendant le test. Chaque passage recrée le plateau et son contexte graphique ; seul le cache propre au navigateur peut intervenir. La 3D légère vise 30 images/s. Les informations matérielles annoncées par le navigateur peuvent être absentes ou approximatives.</p>
  </main>;
}
