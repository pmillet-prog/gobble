import React from "react";
export default function WheelDiagnosticDialog({ title, children }) {
  const dialog = React.useRef(null);
  React.useEffect(() => {
    const node = dialog.current;
    if (node.showModal) node.showModal(); else node.setAttribute("open", "");
    return () => { if (node.open) { if (node.close) node.close(); else node.removeAttribute("open"); } };
  }, []);
  return <dialog ref={dialog} className="wheel-diagnostic__dialog" aria-labelledby="wheel-diagnostic-title" onCancel={event => event.preventDefault()}>
    <h2 id="wheel-diagnostic-title">{title}</h2>{children}
  </dialog>;
}
