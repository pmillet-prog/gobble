import React from "react";
import GobblarsBalance from "../../components/GobblarsBalance.jsx";

const GobblarsHistoryDialog = React.lazy(() => import("./GobblarsHistoryDialog.jsx"));

export default function HomeGobblarsBalance({ balance, accountId }) {
  const [open, setOpen] = React.useState(false);
  return <>
    <GobblarsBalance balance={balance} onClick={() => setOpen(true)} />
    {open ? <React.Suspense fallback={<span role="status">Chargement…</span>}>
      <GobblarsHistoryDialog accountId={accountId} onClose={() => setOpen(false)} />
    </React.Suspense> : null}
  </>;
}
