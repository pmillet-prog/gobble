import React from "react";
import { createPortal } from "react-dom";
import "../../styles/desktopResponsive.css";
import "./gotusSurface.css";

const GotusChatColumn = React.lazy(() => import("./GotusChatColumn.jsx"));

// Both modes own their available viewport; the original Boggle grid is too
// short to host the Gotus board, presenter and controls together.
export default function GotusSurface({ children, compact, training, darkMode, chat }) {
  const withChat = !compact && !!chat;
  const surface = <div className={`gotus-surface gotus-surface--${compact ? "compact" : "desktop"}${withChat ? " gotus-surface--with-chat" : ""}`}
    role={training ? undefined : "dialog"} aria-modal={training ? undefined : true} aria-label={training ? undefined : "Gotus"}>
    <div className="gotus-surface__game"><div className="gotus__standalone">{children}</div></div>
    {withChat ? <aside className="gotus-surface__chat desktop-responsive-grid" aria-label="Chat du salon">
      <React.Suspense fallback={<p>Ouverture du chat…</p>}>
        <GotusChatColumn chat={chat} training={training} darkMode={darkMode} />
      </React.Suspense>
    </aside> : null}
  </div>;
  return training ? surface : createPortal(surface, document.body);
}
