import React from "react";
import OcidVoteOptionsGrid from "./OcidVoteOptionsGrid.jsx";
import "./desktopOcid.css";

export default function DesktopOcidPanel({
  darkMode = false,
  definition = "",
  onClearProposal,
  onProposalChange,
  onSubmitProposal,
  onVote,
  proposal = "",
  selectedOptionId = "",
  statusMessage = "",
  submittedProposal = "",
  vote = null,
}) {
  const inputId = React.useId();
  return <section className={`desktop-ocid-panel${vote ? " is-voting" : ""}`} aria-label="Manche OCID">
    <h2 className="desktop-ocid-title">MANCHE OCID</h2>
    <div className="desktop-ocid-definition" tabIndex={0} role="region" aria-label="Définition du mot à trouver">
      <p className={definition ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>
        {definition || "Définition indisponible"}
      </p>
    </div>
    {vote ? <OcidVoteOptionsGrid
      adaptive
      darkMode={darkMode}
      onSelect={onVote}
      options={vote.options || []}
      selectedOptionId={selectedOptionId}
    /> : null}
    <div className="desktop-ocid-footer">
      {!vote ? <form onSubmit={(event) => { event.preventDefault(); onSubmitProposal?.(); }}>
        <label className="desktop-ocid-proposal-label text-slate-600 dark:text-slate-300" htmlFor={inputId}>Ta proposition</label>
        <div className="desktop-ocid-proposal-controls">
          <div className="desktop-ocid-input-wrap">
            <input
              id={inputId}
              value={proposal}
              onChange={(event) => onProposalChange?.(event.target.value)}
              maxLength={32}
              className="border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              placeholder="Trace ou tape ton mot"
            />
            {proposal ? <button type="button" className="desktop-ocid-clear text-slate-500 dark:text-slate-300" onClick={onClearProposal} aria-label="Changer de proposition">
              <span className="material-icons-outlined" aria-hidden="true">close</span>
            </button> : null}
          </div>
          <button type="submit" className="desktop-ocid-submit bg-blue-600 text-white">Envoyer</button>
        </div>
      </form> : null}
      <p className="desktop-ocid-status text-slate-600 dark:text-slate-300" role="status">
        {statusMessage || (vote ? "Vote pour le vrai mot cible." : submittedProposal ? `Retenu : ${submittedProposal}` : "Trace ou tape un mot plausible. Il sera retenu automatiquement.")}
      </p>
    </div>
  </section>;
}
