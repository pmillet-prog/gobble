import React from "react";
import { layoutFinaleBoard } from "../../../features/infortune/finale/finaleBoardLayout.js";

const KIND_LABELS = { riddle: "Énigme", quiz: "Culture générale", definition: "Définition" };

export default function FinaleLetterBoard({ tiles, category, kind, flippingIndex, reducedMotion }) {
  const container = React.useRef(null);
  const [columns, setColumns] = React.useState(18);
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setColumns(Math.max(8, Math.min(22, Math.floor(entry.contentRect.width / 36))));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const rows = React.useMemo(() => layoutFinaleBoard(tiles, columns), [tiles, columns]);
  const accessibleText = tiles.map(tile => tile.character ?? "□").join("");
  return <section className="infortune-finale-board" aria-label="Le tableau de l’énigme">
    <header className="infortune-finale-board__heading">
      <span>{KIND_LABELS[kind]}</span><h2>{category}</h2><span aria-hidden="true">✦</span>
    </header>
    <div ref={container} className="infortune-finale-board__screen" style={{ "--finale-columns": columns }}>
      <p className="infortune-finale-sr-only" aria-live="polite" aria-atomic="true">{accessibleText}</p>
      <div className="infortune-finale-board__rows" aria-hidden="true">
        {rows.map((row, rowIndex) => <div className="infortune-finale-board__row" key={rowIndex}>
          {row.map(tile => <span key={tile.index}
            className={`infortune-finale-tile infortune-finale-tile--${tile.kind}${tile.character !== null ? " is-revealed" : ""}${tile.index === flippingIndex && !reducedMotion ? " is-flipping" : ""}`}>
            <span className="infortune-finale-tile__rotor">
              <span className="infortune-finale-tile__back" />
              <span className="infortune-finale-tile__face">{tile.character || ""}</span>
            </span>
          </span>)}
        </div>)}
      </div>
    </div>
    <footer className="infortune-finale-board__signature"><span />gobble<span /></footer>
  </section>;
}
