import React from "react";
import { useApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { chatAuditLast24Hours, useChatAudit } from "./useChatAudit.js";

function localInput(time) {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
const formatTime = time => new Date(time).toLocaleString("fr-FR");
const labels = { sent: "Envoyé", edited: "Modifié", deleted: "Supprimé du chat" };

export default function ChatAuditPanel({ buttonClass }) {
  const kernel = useApplicationKernel();
  const audit = useChatAudit(kernel.ports.realtime);
  const [range, setRange] = React.useState(() => {
    const value = chatAuditLast24Hours();
    return { from: localInput(value.from), to: localInput(value.to), query: "" };
  });
  const inputClass = `block w-full min-w-0 mt-1 rounded-lg border px-2 py-2 text-xs ${buttonClass}`;
  const button = `rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${buttonClass}`;
  const [page, setPage] = React.useState(1);
  return <section className="space-y-3" aria-label="Historique du chat">
    <p className="text-xs opacity-80">
      Messages des joueurs, modifications et suppressions. {audit.retentionDays ? `Conservation : ${audit.retentionDays} jours.` : "Conservation sans limite de durée."}
      {" "}L’historique commence à l’activation de l’archivage.
    </p>
    <form className="space-y-2" onSubmit={event => {
      event.preventDefault(); setPage(1);
      audit.load({ from: new Date(range.from).getTime(), to: new Date(range.to).getTime() + 59999, query: range.query });
    }}>
      <label className="block text-xs font-semibold">Du (heure locale)
        <input required type="datetime-local" value={range.from} max={range.to} onChange={event => setRange(previous => ({ ...previous, from: event.target.value }))} className={inputClass} />
      </label>
      <label className="block text-xs font-semibold">Au (heure locale)
        <input required type="datetime-local" value={range.to} min={range.from} onChange={event => setRange(previous => ({ ...previous, to: event.target.value }))} className={inputClass} />
      </label>
      <label className="block text-xs font-semibold">Pseudo ou texte
        <input type="search" maxLength={100} value={range.query} onChange={event => setRange(previous => ({ ...previous, query: event.target.value }))} className={inputClass} placeholder="Rechercher dans le journal" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={audit.busy} className={button}>Rechercher</button>
        <button type="button" disabled={audit.busy} className={button} onClick={() => {
          const value = chatAuditLast24Hours(); setPage(1);
          setRange({ from: localInput(value.from), to: localInput(value.to), query: "" }); audit.load(value);
        }}>Dernières 24 h · actualiser</button>
      </div>
    </form>
    <div aria-live="polite" className="text-xs">
      {audit.busy ? "Chargement…" : audit.error || (!audit.entries.length ? "Aucun événement pour cette recherche." : `Page ${page} · ${audit.entries.length} événements, du plus récent au plus ancien`)}
    </div>
    <ol className="space-y-2">
      {audit.entries.map(entry => <li key={entry.seq} className={`rounded-xl border p-3 text-xs ${buttonClass}`}>
        <div className="flex flex-wrap justify-between gap-1 font-bold">
          <span className="break-all">{entry.nick}</span><span>{labels[entry.action]}</span>
        </div>
        <div className="mt-1 opacity-75"><time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time> · {entry.userId ? `compte #${entry.userId}` : `invité ${entry.installId || ""}`}</div>
        {entry.action !== "sent" && <div className="opacity-75">Message envoyé le {formatTime(entry.sentAt)}</div>}
        {entry.previousText !== null && <div className="mt-2"><span className="font-semibold">Avant :</span><p className="whitespace-pre-wrap break-words">{entry.previousText}</p></div>}
        <div className="mt-2">
          {entry.action === "edited" && <span className="font-semibold">Après :</span>}
          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
        {entry.submittedText !== null && <div className="mt-2"><span className="font-semibold">Texte saisi avant le filtre anti-spoiler :</span><p className="whitespace-pre-wrap break-words">{entry.submittedText}</p></div>}
        <details className="mt-2 opacity-75"><summary>Référence du message</summary><span className="break-all">{entry.messageId}</span></details>
      </li>)}
    </ol>
    <div className="flex flex-wrap gap-2">
      {page > 1 && <button type="button" className={button} disabled={audit.busy} onClick={() => { setPage(1); audit.first(); }}>Première page</button>}
      {audit.nextBefore && <button type="button" className={button} disabled={audit.busy} onClick={() => { setPage(value => value + 1); audit.next(); }}>Événements plus anciens</button>}
    </div>
  </section>;
}
