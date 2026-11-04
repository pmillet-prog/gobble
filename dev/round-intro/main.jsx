import React from "react";
import { createRoot } from "react-dom/client";
import { createApplicationKernel } from "../../src/app/core/createApplicationKernel.js";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createLiveUiFeature } from "../../src/features/live/createLiveUiFeature.js";
import MobileRoundIntroOverlay from "../../src/components/mobile/MobileRoundIntroOverlay.jsx";
import "../../src/index.css";

const kernel = createApplicationKernel();
kernel.features.define("liveUi", createLiveUiFeature);

function Fixture() {
  const gridRef = React.useRef(null);
  const [options, setOptions] = React.useState({ kind: "gotus", type: "target_long", stage: "title", mobile: innerWidth < 700 });
  React.useEffect(() => {
    window.roundIntroFixture = { show: next => setOptions(previous => ({ ...previous, ...next })) };
    return () => { delete window.roundIntroFixture; };
  }, []);
  const label = options.type === "target_score" ? "MEILLEUR MOT" : options.type === "ocid" ? "OCID" : "MOT LE PLUS LONG";
  return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#111827" }}>
    <div ref={gridRef} data-grid style={{ position: "relative", width: "min(calc(100vw - 32px), calc(100dvh - 64px), 520px)",
      aspectRatio: "1 / 1", background: "#11161f", borderRadius: 16 }} />
    <MobileRoundIntroOverlay gridRef={gridRef} isMobileLayout={options.mobile} renderBackdrop={false}
      roundLabel="MANCHE 4/6" roundTypeLabel={`MANCHE SPECIALE : ${label}`}
      roundDescription={options.type === "target_score" ? "Trouve le mot qui rapporte le plus de points sur cette grille." : "Trouve le mot le plus long de la grille. Un seul mot à trouver !"}
      specialRound={options.training ? null : { isSpecial: true, type: options.type, targetMiniGame: { kind: options.kind } }}
      stage={options.stage} countdown={3} previewBonuses />
  </main>;
}

createRoot(document.getElementById("root")).render(<ApplicationRuntimeProvider kernel={kernel}><Fixture /></ApplicationRuntimeProvider>);
