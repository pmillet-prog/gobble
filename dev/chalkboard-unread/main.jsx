import React from "react";
import { createRoot } from "react-dom/client";
import ChalkboardScrollHints from "../../src/features/chalkboard/ChalkboardScrollHints.jsx";
import useChalkboardViewport from "../../src/features/chalkboard/useChalkboardViewport.js";
import useChalkboardUnseenRegions from "../../src/features/chalkboard/useChalkboardUnseenRegions.js";
import { chalkboardSeenKey, readChalkboardSeen } from "../../src/features/chalkboard/chalkboardSeen.js";
import "../../src/features/chalkboard/chalkboard.css";
import "./style.css";

const weekId = "2026-10-05";
let scenarioSequence = 0;
const entry = (z, center, canErase = false) => ({
  id: `entry-${z}`, z, canErase, elements: [],
  bounds: { minX: center - 140, maxX: center + 140, minY: 360, maxY: 540 },
});
function scenario(name = "two-regions") {
  const accountId = `fixture-chalkboard-${Date.now()}-${++scenarioSequence}`;
  localStorage.setItem(chalkboardSeenKey(accountId), JSON.stringify({ weekId, latestEntry: 1 }));
  const additions = name === "own-only" ? [entry(2, 8000, true)]
    : name === "mixed" ? [entry(2, 8000), entry(3, 16000, true)]
      : name === "new-left" ? [entry(2, 16000, true)]
        : [entry(2, 8000), entry(3, 16000)];
  return { accountId, name, snapshot: { board: "public", weekId, revision: 3, interventions: [entry(1, 200), ...additions] } };
}
function Board({ value, enabled, boardState }) {
  const scrollRef = React.useRef(null);
  const { viewport, scale, worldWidth, worldHeight, onScroll } = useChalkboardViewport(scrollRef);
  const unread = useChalkboardUnseenRegions({ accountId: value.accountId, snapshot: value.snapshot, viewport, enabled });
  React.useLayoutEffect(() => { boardState.current = { viewport, unread, scroll: scrollRef.current, scale }; });
  return <div className="fixture-board">
    <div className="chalkboard-scroll fixture-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={0}>
      <div className="chalkboard-world" style={{ width: worldWidth, height: worldHeight }}>
        {value.snapshot.interventions.map(item => <div key={item.id} className={`fixture-entry${item.canErase ? " is-own" : ""}`}
          style={{ left: item.bounds.minX * scale, top: item.bounds.minY * scale, width: (item.bounds.maxX - item.bounds.minX) * scale }}>
          <b>{item.canErase ? "Mon message" : `Message ${item.z}`}</b>
          <span>{item.canErase ? "Déjà connu" : "Un mot sur le tableau"}</span>
        </div>)}
      </div>
    </div>
    <ChalkboardScrollHints scrollRef={scrollRef} enabled={enabled} viewport={viewport} worldWidth={worldWidth}
      unreadLeft={unread.left} unreadRight={unread.right} />
  </div>;
}
function Fixture() {
  const [value, setValue] = React.useState(() => scenario());
  const [open, setOpen] = React.useState(true);
  const [enabled, setEnabled] = React.useState(true);
  const boardState = React.useRef(null);
  React.useLayoutEffect(() => {
    window.chalkboardUnreadFixture = {
      reset(name) { setOpen(true); setEnabled(true); setValue(scenario(name)); },
      open(value) { setOpen(value); },
      enabled(value) { setEnabled(value); },
      add(z, center, own = false) { setValue(current => ({ ...current, snapshot: { ...current.snapshot,
        revision: current.snapshot.revision + 1, interventions: [...current.snapshot.interventions, entry(z, center, own)],
      } })); },
      scrollToWorld(center) {
        const state = boardState.current;
        state.scroll.dispatchEvent(new WheelEvent("wheel", { deltaX: 100, bubbles: true }));
        state.scroll.scrollLeft = center * state.scale - state.viewport.width / 2;
      },
      snapshot() {
        const rect = node => { if (!node) return null; const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height }; };
        const left = document.querySelector(".chalkboard-scroll-hint.is-left");
        const right = document.querySelector(".chalkboard-scroll-hint.is-right");
        return { open, enabled, scenario: value.name, accountId: value.accountId,
          unread: boardState.current?.unread, viewport: boardState.current?.viewport,
          leftHint: !!left, rightHint: !!right,
          leftBadge: !!left?.textContent.includes("!"), rightBadge: !!right?.textContent.includes("!"),
          leftRect: rect(left), rightRect: rect(right),
          seen: readChalkboardSeen(value.accountId),
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
        };
      },
    };
  });
  return <div className="fixture-app">
    <header><b>Le grand tableau</b><span>Repères des nouvelles entrées</span></header>
    <nav>
      <button onClick={() => { setOpen(true); setValue(scenario()); }}>Deux zones</button>
      <button onClick={() => { setOpen(true); setValue(scenario("own-only")); }}>Mon entrée</button>
      <button onClick={() => setOpen(current => !current)}>{open ? "Fermer" : "Rouvrir"}</button>
    </nav>
    {open ? <Board key={value.accountId} value={value} enabled={enabled} boardState={boardState} /> : <p>Tableau fermé</p>}
    <footer>Faites défiler le tableau horizontalement pour consulter les messages.</footer>
  </div>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
