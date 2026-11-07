import React from "react";
import { fitFinaleBoard } from "../../../features/infortune/finale/finaleBoardLayout.js";
import "./finaleLetterBoard.css";
import FinaleThemeReveal from './FinaleThemeReveal.jsx';

const KIND_LABELS = { riddle: "Énigme", quiz: "Culture générale", definition: "Définition" };

export default function FinaleLetterBoard({ tiles, category, kind, reveal, reducedMotion }) {
  const container = React.useRef(null);
  const [size, setSize] = React.useState({ width: 720, height: 350 });
  React.useLayoutEffect(() => {
    const update = ({ width, height }) => setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    update(container.current.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => {
      update(entry.contentRect);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const dense = size.width < 500 || size.height < 320;
  const { columns, rows, width } = React.useMemo(() => fitFinaleBoard(tiles, { width: Math.max(1, size.width - (dense ? 28 : 40)),
    height: Math.max(1, size.height - (dense ? 62 : 92)), aspect: dense ? 1 : .79 }), [tiles, size, dense]);
  const delays = React.useMemo(() => new Map(reveal?.indices.map((index, order) => [index, order * reveal.stepMs]) || []), [reveal]);
  const accessibleText = tiles.map(tile => tile.character ?? "□").join("");
  return <section ref={container} className="infortune-finale-board" data-dense={dense} aria-label="Le tableau de l’énigme"
    style={{ "--finale-columns": columns, "--finale-rows": rows.length, "--finale-board-width": `${width + (dense ? 10 : 18)}px`, "--finale-flip-duration": `${reveal?.flipMs || 0}ms` }}>
    <div className="infortune-finale-board__stage">
      <p className="infortune-finale-board__kind">{KIND_LABELS[kind]}</p>
      <div className="infortune-finale-board__frame">
        <p className="infortune-finale-sr-only" aria-live="polite" aria-atomic="true">{accessibleText}</p>
        <div className="infortune-finale-board__screen"><div className="infortune-finale-board__rows" aria-hidden="true">
          {rows.map((row, rowIndex) => <div className="infortune-finale-board__row" key={rowIndex}>
            {row.map(tile => <span key={tile.index} style={delays.has(tile.index) ? { "--finale-flip-delay": `${delays.get(tile.index)}ms` } : undefined}
              className={`infortune-finale-tile infortune-finale-tile--${tile.kind}${tile.character !== null ? " is-revealed" : ""}${delays.has(tile.index) && !reducedMotion ? " is-flipping" : ""}`}>
              <span className="infortune-finale-tile__rotor">
                <span className="infortune-finale-tile__back" />
                <span className="infortune-finale-tile__face">{tile.character || ""}</span>
              </span>
            </span>)}
          </div>)}
        </div></div>
      </div>
    </div>
    <FinaleThemeReveal category={category} />
  </section>;
}
