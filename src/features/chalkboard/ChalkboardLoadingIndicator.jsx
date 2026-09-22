import React from "react";

export default function ChalkboardLoadingIndicator({ pending }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!pending) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [pending]);
  return pending && visible ? <div className="chalkboard-loader" role="status"><span className="chalkboard-spinner" aria-hidden="true" />Chargement du tableau…</div> : null;
}
