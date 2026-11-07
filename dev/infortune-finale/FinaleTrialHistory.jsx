import React from "react";

export default function FinaleTrialHistory({ history }) {
  const [page, setPage] = React.useState(0);
  const pages = history.flatMap(round => [
    { label: `Lancer ${round.round}`, rows: Object.values(round.members).map(member => ({
      name: member.nick, before: member.startBank, after: member.bank, detail: member.result?.label,
    })) },
    ...round.exchanges.map((exchange, index) => ({ label: `Lancer ${round.round} · échange ${index + 1}`, rows: [
      { name: round.members[exchange.from].nick, before: exchange.sourceBank, after: exchange.targetBank },
      { name: round.members[exchange.to].nick, before: exchange.targetBank, after: exchange.sourceBank },
    ] })),
  ]);
  const current = pages[page] || pages[0];
  if (!current) return null;
  return <div className="finale-trial-history">
    <label>Étape du tournoi<select value={page} onChange={event => setPage(Number(event.target.value))}>
      {pages.map((item,index) => <option key={index} value={index}>{item.label}</option>)}
    </select></label>
    <table><thead><tr><th>Candidat</th><th>Avant</th><th>Après</th></tr></thead><tbody>
      {current.rows.map((row,index) => <tr key={index}><th>{row.name}{row.detail && <small>{row.detail}</small>}</th>
        <td>{row.before.toLocaleString("fr-FR")} €</td><td>{row.after.toLocaleString("fr-FR")} €</td></tr>)}
    </tbody></table>
  </div>;
}
