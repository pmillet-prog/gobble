import React from "react";
import { createPortal } from "react-dom";
import ChalkboardIcon from "./ChalkboardIcon.jsx";
import { chalkboardFontFamily, uppercaseChalkboardText } from "./chalkboardFonts.js";

export default function ChalkboardTextComposer({ canPublish, font, fontsReady, onPlace, onCancel }) {
  const dialogRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [text, setText] = React.useState("");
  React.useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    inputRef.current?.focus();
    // Mobile keyboards resize the visual viewport without always resizing dvh.
    const viewport = window.visualViewport;
    const fit = () => {
      const height = viewport?.height || window.innerHeight;
      const inset = window.innerWidth <= 620 ? 16 : Math.min(100, height * .12);
      dialog.style.top = `${(viewport?.offsetTop || 0) + inset}px`;
      dialog.style.maxHeight = `${Math.max(120, height - inset - 16)}px`;
    };
    fit();
    viewport?.addEventListener("resize", fit);
    viewport?.addEventListener("scroll", fit);
    window.addEventListener("resize", fit);
    return () => {
      viewport?.removeEventListener("resize", fit);
      viewport?.removeEventListener("scroll", fit);
      window.removeEventListener("resize", fit);
      dialog.close();
    };
  }, []);
  return createPortal(
    <dialog ref={dialogRef} className="chalkboard-composer" aria-labelledby="chalkboard-composer-title" onCancel={event => { event.preventDefault(); onCancel(); }}>
      <form onSubmit={event => { event.preventDefault(); if (text.trim() && fontsReady) onPlace(uppercaseChalkboardText(text)); }}>
        <div className="chalkboard-composer-heading"><h2 id="chalkboard-composer-title">Un mot sur le tableau</h2><button type="button" aria-label="Fermer la saisie" onClick={onCancel}><ChalkboardIcon name="close" /></button></div>
        <p>Écris ton message, puis place-le sur le tableau avant de publier.</p>
        <label className="chalkboard-message-label" htmlFor="chalkboard-message">Ton message</label>
        <input ref={inputRef} id="chalkboard-message" className="chalkboard-text-entry" style={{ fontFamily: chalkboardFontFamily(font) }} type="text" maxLength={280} autoCapitalize="characters" placeholder="A TOI LA CRAIE…" value={text} onChange={event => {
          const input = event.currentTarget;
          const start = uppercaseChalkboardText(input.value.slice(0, input.selectionStart)).length;
          const end = uppercaseChalkboardText(input.value.slice(0, input.selectionEnd)).length;
          const value = uppercaseChalkboardText(input.value);
          input.value = value;
          input.setSelectionRange(start, end);
          setText(value);
        }} />
        <div className="chalkboard-composer-actions">
          <button type="submit" className="chalkboard-place" disabled={!text.trim() || !fontsReady}><ChalkboardIcon name="write" />{fontsReady ? "Placer sur le tableau" : "Chargement des polices…"}</button>
        </div>
        <small>{canPublish ? "Ton texte reste un brouillon jusqu’au clic sur « Publier »." : "Connecte-toi à ton compte pour publier."}</small>
      </form>
    </dialog>, document.body
  );
}
