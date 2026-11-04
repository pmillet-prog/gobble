import React from "react";
import { WHEEL_SURVEY, WHEEL_DIAGNOSTIC_STEPS, WHEEL_FLUIDITY, wheelSurveyComplete } from "../../../../shared/wheelDiagnostic.js";
import WheelDiagnosticSummary from "./WheelDiagnosticSummary.jsx";
import { WHEEL_DIAGNOSTIC_DRAFT_KEY, saveWheelDiagnosticDraft } from "./wheelDiagnosticDraft.js";

export default function WheelDiagnosticSurvey({ session, runs, initialSurvey, onReplay }) {
  const [survey, setSurvey] = React.useState(() => initialSurvey || ({ fluidity: Object.fromEntries(WHEEL_DIAGNOSTIC_STEPS.filter(step => !runs.some(run => run.profile === step.profile && run.loadingMs !== null)).map(step => [step.profile, "unseen"])), comment: "" }));
  const [status, setStatus] = React.useState("idle"), [message, setMessage] = React.useState("");
  const update = (id, value) => setSurvey(current => ({ ...current, [id]: value }));
  React.useEffect(() => {
    if (status === "sent") return;
    saveWheelDiagnosticDraft({ ...session, runs, survey });
  }, [session, runs, survey, status]);
  async function submit(event) {
    event.preventDefault();
    if (status === "sending" || !wheelSurveyComplete(survey)) return;
    setStatus("sending"); setMessage("");
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/infortune/diagnostics", { method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...session, runs, survey }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(response.status === 429 ? "rate" : "send");
      setStatus("sent"); setMessage("Merci ! Ton diagnostic et tes réponses ont bien été enregistrés dans Gobble.");
      try { sessionStorage.removeItem(WHEEL_DIAGNOSTIC_DRAFT_KEY); } catch {}
    } catch (error) {
      setStatus("error"); setMessage(error.message === "rate" ? "Plusieurs bilans ont déjà été envoyés récemment. Réessaie un peu plus tard."
        : "Le bilan n’a pas pu être envoyé. Tes réponses sont conservées ici : tu peux réessayer sans refaire les lancers.");
    } finally { clearTimeout(timer); }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...session, runs, survey }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `gobble-roue-${session.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="wheel-diagnostic__survey">
    <button type="button" className="wheel-test__primary" onClick={onReplay} disabled={status === "sending"}>Revoir l’aperçu</button>
    <p className="wheel-diagnostic__hint">Relance les quatre versions depuis la 2D pour faire un nouveau bilan. Les mesures et les réponses de ce questionnaire seront remplacées.</p>
    <h2>{status === "sent" ? "Merci pour le coup de main !" : "Dernière étape : ton avis"}</h2>
    {status !== "sent" && <form onSubmit={submit}>
      <p>Ton ressenti complète les chiffres. Si tu n’as pas pu observer une version, indique-le simplement.</p>
      <fieldset disabled={status === "sending"}><legend>Comment était chaque version ?</legend>
        {WHEEL_DIAGNOSTIC_STEPS.map(step => <label className="wheel-diagnostic__select" key={step.profile}>{step.label}
          <select required value={survey.fluidity[step.profile] || ""} onChange={event => update("fluidity", { ...survey.fluidity, [step.profile]: event.target.value })}>
            <option value="" disabled>Choisir une réponse</option>{Object.entries(WHEEL_FLUIDITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>)}
      </fieldset>
      {WHEEL_SURVEY.map(question => <fieldset key={question.id} disabled={status === "sending"}><legend>{question.label}</legend>
        <div className="wheel-diagnostic__choices">{Object.entries(question.options).map(([value, label]) => <label key={value}>
          <input required type="radio" name={question.id} checked={survey[question.id] === value} onChange={() => update(question.id, value)} />{label}</label>)}</div>
      </fieldset>)}
      <label className="wheel-diagnostic__comment">Un détail à ajouter ? (facultatif)
        <textarea maxLength={1200} rows={4} value={survey.comment} disabled={status === "sending"} onChange={event => update("comment", event.target.value)} placeholder="Une version en particulier, un problème visuel, le modèle de ton appareil si tu le connais…" /></label>
      <p>Les réponses et les mesures ci-dessous seront envoyées à Gobble en cliquant sur le bouton.</p>
      <button className="wheel-test__primary" disabled={status === "sending" || !wheelSurveyComplete(survey)}>{status === "sending" ? "Envoi…" : "Envoyer mon diagnostic"}</button>
      {!wheelSurveyComplete(survey) && <p className="wheel-diagnostic__hint">Choisis une réponse à chaque question pour envoyer ton retour.</p>}
    </form>}
    <p role={status === "error" ? "alert" : "status"}>{message}</p>
    {status === "sent" && <a href="/">Revenir à Gobble</a>}
    <details><summary>Consulter les mesures jointes</summary><WheelDiagnosticSummary runs={runs} detailed />
      <p>Chaque passage recrée le plateau et son contexte graphique. Le navigateur peut conserver son propre cache de fichiers et de shaders : ce ne sont pas des essais à cache vide. Le détail précise les temps de chaque étape.</p>
      <button type="button" onClick={download}>Garder une copie du bilan</button>
    </details>
  </section>;
}
