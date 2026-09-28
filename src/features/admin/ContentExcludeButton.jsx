import React from "react";
import { useFeatureRuntime, useFeatureSelector } from "../../app/react/useFeatureRuntime.js";
import "./accountAdmin.css";

export default function ContentExcludeButton({ content }) {
  const feature = useFeatureRuntime("accountAdmin");
  const allowed = useFeatureSelector(feature, state => state.allowed);
  const key = content?.reference || `${content?.scope}:${content?.word}`;
  const excluded = useFeatureSelector(feature, state => Boolean(state.excluded[key]));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  if (!allowed || (!content?.word && !content?.reference)) return null;
  const label = excluded ? "Mot retiré de cette liste" : "Retirer ce mot des prochaines apparitions";
  return <span className="admin-content-control" onPointerDown={event => event.stopPropagation()}>
    <button type="button" className="admin-content-exclude" aria-label={label} title={label} disabled={busy || excluded}
      onClick={async event => {
        event.stopPropagation();
        setBusy(true); setError("");
        try { await feature.exclude(content); } catch (failure) { setError(failure.message); }
        finally { setBusy(false); }
      }}>{excluded ? "✓" : busy ? "…" : "×"}</button>
    {error ? <span className="admin-content-error" role="alert">{error}</span> : null}
  </span>;
}
