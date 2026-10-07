import React from "react";
import useDesktopResultsPresentation from "../../src/components/results/useDesktopResultsPresentation.jsx";
import DefinitionOverlays from "../../src/components/definition/DefinitionOverlays.jsx";

const noop = () => {};
const definitions = [
  "Siège allongé, avec ou sans dossier, sur lequel plusieurs personnes peuvent s’asseoir.",
  "Groupe de poissons d’une même espèce qui se déplacent ensemble.",
  "Amas de sable, de vase ou de roches qui s’élève au-dessus du fond de la mer ou d’un cours d’eau.",
];
const answer = { word: "banc", definition: definitions[1] };

export default function DefinitionReview() {
  const darkMode = new URLSearchParams(location.search).has("dark");
  const [definitionModal, setDefinitionModal] = React.useState({ open: false });
  const [saved, setSaved] = React.useState(false);
  const closeDefinition = () => setDefinitionModal(previous => ({ ...previous, open: false }));
  const openDefinition = (word, options = {}) => {
    const context = { word, ...options };
    setDefinitionModal({ ...context, open: true, loading: true });
    setTimeout(() => setDefinitionModal({
      ...context,
      open: true,
      loading: false,
      ok: true,
      definition: definitions[0],
      definitions,
      etymology: "Du francique bank, « banc ».",
      source: "wiktionary",
      url: "https://fr.wiktionary.org/wiki/banc",
    }), 120);
  };
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    window.definitionReview = { openDefinition, closeDefinition, ready: true };
    return () => { delete window.definitionReview; };
  });
  const { renderDesktopResultsDockPanel } = useDesktopResultsPresentation({
    darkMode,
    isMobileLayout: innerWidth < 640,
    phase: "results",
    serverStatus: "break",
    lepersResult: answer,
    endStats: {
      bestWord: { word: "BANC", pts: 4, nick: "Tigre", finders: [{ nick: "Tigre" }, { nick: "Alice" }] },
      longestWord: { word: "BANCS", len: 5, nick: "Alice", finders: [{ nick: "Alice" }] },
      mostWords: { nick: "Tigre", count: 12 },
    },
    finalResults: [{ nick: "Tigre" }, { nick: "Alice" }],
    duelRedScore: 432,
    duelBlueScore: 418,
    resultsTeamDelta: { red: 29, blue: 35 },
    nicknameRef: { current: "Tigre" },
    normalizeNickKey: value => String(value || "").toLowerCase(),
    targetDefinition: {},
    analyzeWord: noop,
    clearResultsWordAnalysis: noop,
    openDefinition,
  });

  return <main style={{ minHeight: "100dvh", padding: "24px 12px", background: darkMode ? "#172033" : "#eef2f7", color: darkMode ? "#e2e8f0" : "#0f172a" }}>
    <p style={{ maxWidth: 420, margin: "0 auto 16px", fontSize: 12 }}>Contrôle local · Bilan et définition QPUC</p>
    <div data-review="bilan" style={{ maxWidth: 420, margin: "0 auto" }}>{renderDesktopResultsDockPanel()}</div>
    <DefinitionOverlays runtime={{
      definitionModal,
      wordInfoModal: { open: false },
      closeDefinition,
      closeWordInfoModal: noop,
      openDefinition,
      darkMode,
      menuDarkMode: darkMode,
      GUIDED_RESULTS_STEPS: {},
      isAccountAuthenticated: true,
      isWordInVault: () => saved,
      handleDefinitionVaultAction: () => setSaved(true),
      playCloseSound: noop,
    }} />
  </main>;
}
