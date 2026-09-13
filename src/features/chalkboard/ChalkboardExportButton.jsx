import React from "react";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import { fetchChalkboardExport, sendChalkboardCopy } from "./chalkboardApi.js";

export default function ChalkboardExportButton({ disabled, onNotice }) {
  const [jobId, setJobId] = React.useState("");
  const [sending, setSending] = React.useState(false);
  React.useEffect(() => {
    if (!jobId) return undefined;
    const controller = new AbortController();
    let timer;
    const poll = async () => {
      try {
        const job = await fetchChalkboardExport(jobId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (job.status === "sent") onNotice("Copie PNG envoyée par e-mail.");
        else if (job.status === "pending_retry") onNotice(job.mailConfigured ? "Copie conservée. L’envoi a échoué et sera réessayé automatiquement." : "Copie conservée. L’envoi attend la configuration e-mail du serveur.");
        else { timer = window.setTimeout(poll, 2000); return; }
        setJobId("");
        setSending(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        onNotice("La demande d’envoi est enregistrée, mais son suivi est momentanément indisponible.");
        setJobId("");
        setSending(false);
      }
    };
    void poll();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [jobId, onNotice]);
  const send = async () => {
    setSending(true);
    try {
      const result = await sendChalkboardCopy();
      onNotice("Préparation de la copie PNG…");
      setJobId(result.id);
    } catch (error) {
      onNotice(error.message === "export_rate_limited" ? "Un envoi vient d’être demandé. Patiente quelques instants." : "La copie n’a pas pu être demandée. Réessaie dans un instant.");
      setSending(false);
    }
  };
  return <button type="button" className="chalkboard-admin-button" disabled={disabled || sending} onClick={send} aria-label="Envoyer une copie PNG par e-mail" title="Envoyer une copie PNG par e-mail"><ChalkboardIcon name="mail" /><span>{sending ? "Envoi…" : "Envoyer le PNG"}</span></button>;
}
