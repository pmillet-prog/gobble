import React from "react";
import { createRoot } from "react-dom/client";
import { TROPHY_REWARDS, TROPHY_BY_ID } from "../../shared/trophyCatalog.js";
import { trophyRewardCount } from "../../src/features/trophies/trophyPresentation.js";
import { createApplicationKernel } from "../../src/app/core/createApplicationKernel.js";
import { ApplicationRuntimeProvider } from "../../src/app/react/ApplicationRuntimeProvider.jsx";
import { createNotificationsFeature } from "../../src/features/notifications/createNotificationsFeature.js";
import NotificationToastLayer from "../../src/features/notifications/NotificationToastLayer.jsx";
import { createTrophiesFeature } from "../../src/features/trophies/createTrophiesFeature.js";
import ProfileTrophyShelf from "../../src/features/trophies/ProfileTrophyShelf.jsx";
import TrophyRewardToast from "../../src/features/trophies/TrophyRewardToast.jsx";
import "../../src/index.css";
import "../../src/components/profile/playerProfile.css";
import "./preview.css";

function createPreviewRuntime(mode, devAllowed) {
  const examples = { weekly_gold: 3, weekly_silver: 8, weekly_bronze: 12, volume_100: 1, word_16: 16, three_words_1000: 4,
    "julien_1000:bronze": 1, "gobbles_10000:bronze": 1, "marathon_10000:bronze": 1, "marathon_10000:silver": 1,
    "double_gobbles_1000:bronze": 1, "double_gobbles_1000:silver": 1, double_gobbles_1000: 3,
    "targets_1000:bronze": 1, "targets_1000:silver": 1, targets_1000: 2,
    "words_100000:bronze": 1, "words_100000:silver": 1, words_100000: 16 };
  const counts = Object.fromEntries(TROPHY_REWARDS.map((trophy, index) => [trophy.id,
    trophyRewardCount(trophy, mode === "counts" ? [9, 99, 999, 9999, 99999, 999999][index % 6] : mode === "all" ? index + 1 : mode === "examples" ? examples[trophy.id] || 0 : 0),
  ]));
  const devCounts = {};
  const pending = new Set();
  let sequence = 0;
  // Local-only transport: this preview never opens a game socket or writes player data.
  const kernel = createApplicationKernel({ ports: { realtime: {
    connected: true,
    bind: () => () => {},
    emit: (event, payload, acknowledge) => {
      const respond = response => {
        const timer = setTimeout(() => { pending.delete(timer); acknowledge?.(response); }, 140);
        pending.add(timer);
      };
      if (event === "achievement:sync") return respond({ ok: true, achievements: { counts }, awards: [] });
      if (event === "dev:achievement:status") return respond({ ok: true, allowed: devAllowed });
      if (event === "dev:achievement:grant") {
        if (!devAllowed) return respond({ ok: false, error: "forbidden" });
        if (!TROPHY_BY_ID[payload.id]) return respond({ ok: false, error: "invalid_achievement" });
        const count = trophyRewardCount(payload.id, (devCounts[payload.id] || 0) + 1);
        devCounts[payload.id] = count;
        return respond({ ok: true, award: { id: payload.id, eventId: `achievement-dev:preview-${++sequence}`,
          userId: 7, delta: 1, count, roundId: "preview-round", earnedAt: Date.now(), dev: true } });
      }
      if (event === "dev:achievement:reset") {
        if (!devAllowed) return respond({ ok: false, error: "forbidden" });
        for (const id of Object.keys(devCounts)) delete devCounts[id];
        return respond({ ok: true });
      }
      return respond({ ok: true });
    },
  } } });
  kernel.features.define("notifications", createNotificationsFeature);
  kernel.features.define("achievements", createTrophiesFeature);
  kernel.commands.session.setAuthState({ status: "authenticated", user: { id: 7 } });
  kernel.commands.session.setNickname("Tigre");
  kernel.commands.realtime.setRoundId("preview-round");
  return { kernel, counts, dispose: () => { kernel.dispose(); for (const timer of pending) clearTimeout(timer); pending.clear(); } };
}

function PreviewStage({ mode, compact, devAllowed }) {
  const [{ kernel, counts, dispose }] = React.useState(() => createPreviewRuntime(mode, devAllowed));
  const sequence = React.useRef(0);
  React.useEffect(() => dispose, [dispose]);
  const demo = () => {
    const feature = kernel.features.prepare("achievements");
    const available = TROPHY_REWARDS.filter(trophy => trophy.repeat !== "once" || !feature.store.getState().counts[trophy.id]);
    const trophy = available[sequence.current++ % available.length];
    const count = trophyRewardCount(trophy, (feature.store.getState().counts[trophy.id] || 0) + 1);
    feature.receive({ id: trophy.id, count, delta: 1, eventId: `preview-${sequence.current}`,
      roundId: "preview-round", userId: 7, earnedAt: Date.now() });
  };
  return <ApplicationRuntimeProvider kernel={kernel}>
    <div className="trophy-preview-actions"><button type="button" onClick={demo}>Obtenir un trophée · notification</button></div>
    <div className={`trophy-preview-stage${compact ? " is-compact" : ""}`}>
      <div className="trophy-preview-card"><ProfileTrophyShelf achievements={{ counts }} userId={7} /></div>
      <div className="trophy-preview-toast"><TrophyRewardToast reward={{ id: "word_17", count: 1, delta: 1 }} /></div>
    </div>
    <NotificationToastLayer darkMode />
  </ApplicationRuntimeProvider>;
}

function Preview() {
  const [mode, setMode] = React.useState("examples");
  const [compact, setCompact] = React.useState(false);
  const [devAllowed, setDevAllowed] = React.useState(false);
  return <main className="trophy-preview"><h1>L’étagère des trophées</h1>
    <p>Aperçu local avec les vrais composants. Les comptes et les succès sont fictifs.</p>
    <div className="trophy-preview-controls" aria-label="Réglages de l’aperçu">
      {[["empty", "Collection vide"], ["examples", "Quelques exploits"], ["all", "Tout acquis"], ["counts", "Grands compteurs"]].map(([key, label]) =>
        <button type="button" key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}
      <button type="button" aria-pressed={compact} onClick={() => setCompact(value => !value)}>Largeur mobile</button>
      <button type="button" aria-pressed={devAllowed} onClick={() => setDevAllowed(value => !value)}>Accès dev</button>
    </div>
    <PreviewStage key={`${mode}-${devAllowed}`} mode={mode} compact={compact} devAllowed={devAllowed} />
  </main>;
}

createRoot(document.getElementById("root")).render(<Preview />);
