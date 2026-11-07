import React from "react";
import { createWorkshopTournament } from "./workshopTournament.js";
import { usePerspectiveWheel } from "./usePerspectiveWheel.js";
import { useCameraTimeline } from "./useCameraTimeline.js";
import { useWheelSoundtrack } from "./useWheelSoundtrack.js";
import { DEFAULT_REFLECTIONS } from "./sphericalReflections.js";
import { useTournamentRoundFlow } from "./useTournamentRoundFlow.js";
import { TournamentExchangeOverlay } from "./TournamentExchange.jsx";
import InfortuneWheelPlay from "../../src/components/infortune/InfortuneWheelPlay.jsx";
import InfortuneStageTransition from '../../src/components/infortune/InfortuneStageTransition.jsx';
import InfortuneLeaderWalk, { usePreloadLeaderScene } from '../../src/components/infortune/InfortuneLeaderWalk.jsx';
import { INFORTUNE_LEADER_WALK_MS } from '../../shared/infortuneLeaders.js';
import useWorkshopAvatar from './useWorkshopAvatar.js';

const Finale = React.lazy(() => import("./WorkshopTournamentFinale.jsx"));
const commitCamera = () => {};

export function TournamentRound({ controller, state, contestants, muted, onMutedChange, onClose, onPresented }) {
  const [size, setSize] = React.useState({ width: 720, height: 554 });
  const [selectedId, setSelectedId] = React.useState(null);
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { contestants, muted, gestureMode: "power",
    exchangeEnabled: state.exchangeEnabled, banks: state.economy, onResult: controller.recordResult, onLaunch: controller.launched,
    inputDisabled: state.self.spin !== "pending",
    selectedContestant: state.activeExchange ? (state.activeExchange.to === state.selfId ? state.activeExchange.from : state.activeExchange.to) : state.choosing ? selectedId : null,
    onChoose: state.choosing ? setSelectedId : null });
  const sound = useWheelSoundtrack(wheel.muted, wheel.audioEvents);
  const ready = wheel.stageStatus.phase === "ready" && !wheel.renderError;
  const timeline = useCameraTimeline({ applyCamera: wheel.setCamera, commitCamera,
    stageReady: ready && sound.ready, spinProgress: wheel.spinProgress, setInputLocked: wheel.setInputLocked, syncIntroAudio: sound.sync,
    onResultPresented: () => wheel.resultExit.start() });
  const presentationReady = wheel.view.phase === "finished" && !timeline.transport.playing && wheel.resultExit.state.phase === 'done';
  React.useEffect(() => { if (presentationReady) onPresented?.(state.round); }, [presentationReady, state.round, onPresented]);
  const flow = useTournamentRoundFlow({ controller, state, wheel, presentationReady, soundtrack: sound });
  const timers = React.useRef([]), opponentsStarted = React.useRef(false);
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current); return () => observer.disconnect();
  }, [wheel.scene]);
  React.useEffect(() => { onMutedChange(wheel.muted); }, [wheel.muted, onMutedChange]);
  React.useEffect(() => {
    if (!ready || wheel.inputLocked || opponentsStarted.current) return;
    opponentsStarted.current = true;
    timers.current = state.opponentIds.map((id, index) => setTimeout(() => controller.revealOpponent(id), 3500 + index * 3000));
  }, [ready, wheel.inputLocked, controller, state.opponentIds]);
  React.useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; opponentsStarted.current = false; }, []);
  const busy = !["ready", "finished"].includes(wheel.view.phase);
  const status = state.choosing ? "Choisis ton échange sur le plateau."
    : state.activeExchange ? "Les échanges se suivent dans l’ordre annoncé."
    : state.canAdvance ? `Lancer terminé · ${state.self.result?.label || "résultats enregistrés"}`
    : state.self.spin === "done" ? "En attente des autres candidats…"
    : flow.automatic ? "Temps écoulé : lancement automatique." : undefined;
  return <InfortuneWheelPlay wheel={wheel} sound={sound} subtitle={`Essai · lancer ${state.round} / 4`} bank={state.balance}
    launchBank={state.self.launchBank}
    until={flow.launchUntil} status={status} onClose={onClose} exchanging={state.choosing || Boolean(state.activeExchange)}
    settings={<><label>Scénario d’essai au quatrième lancer<select value={state.scenario} disabled={state.round === 4 && (busy || state.self.spin !== "pending")}
      onChange={event => controller.setScenario(event.target.value)}>
      <option value="random">Résultats naturels</option><option value="self-exchange">Forcer ton échange</option><option value="opponents-exchange">Forcer les échanges des adversaires</option><option value="all-exchange">Forcer les trois échanges</option>
    </select></label><p>Essai local : aucun gain réel. Un scénario forcé remplace le résultat comptabilisé au quatrième lancer.</p></>}>
    <div onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
      <TournamentExchangeOverlay state={state} contestants={contestants} selectedId={selectedId} onSelect={setSelectedId} wheel={wheel}
        onConfirm={() => controller.chooseExchange(selectedId)} onDecline={() => controller.chooseExchange(null)} ready={presentationReady} choiceUntil={flow.choiceUntil} />
    </div>
  </InfortuneWheelPlay>;
}

function TournamentSession({ contestants, rules, onRulesChange, onRestart, onClose }) {
  const selfAppearance = useWorkshopAvatar();
  const controller = React.useMemo(() => createWorkshopTournament({ contestants }), [contestants]);
  const state = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [muted, setMuted] = React.useState(false);
  const [presented, setPresented] = React.useState(null), [closing, setClosing] = React.useState(null);
  usePreloadLeaderScene(closing, true);
  React.useEffect(() => {
    if (!state.canAdvance || presented !== state.round || closing?.roundNumber === state.round) return;
    if (state.round === 4) { controller.beginFinale(); return; }
    const startsAt = Date.now();
    setClosing({ id: `workshop:${startsAt}:${state.round}`, roundNumber: state.round, startsAt, endsAt: startsAt + INFORTUNE_LEADER_WALK_MS,
      leaders: state.leaders.map(player => ({ ...player, ...(player.id === state.selfId ? selfAppearance : { avatar: contestants.find(candidate => candidate.id === player.id)?.avatar }) })) });
  }, [state.canAdvance, state.round, state.leaders, state.selfId, presented, closing?.roundNumber, selfAppearance, contestants, controller]);
  React.useEffect(() => {
    if (!closing || closing.roundNumber !== state.round) return;
    const timer = setTimeout(() => controller.nextRound(), Math.max(0, closing.endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [closing, state.round, controller]);
  const showingLeaders = closing?.roundNumber === state.round && state.phase !== 'finale';
  return <InfortuneStageTransition viewKey={state.phase === 'finale' ? 'finale' : showingLeaders ? `leaders:${state.round}` : state.round}>{state.phase === "finale"
    ? <React.Suspense fallback={<p role="status">Préparation de la finale…</p>}><Finale bank={state.finaleBank} rules={rules}
      onRulesChange={onRulesChange} onRestart={onRestart} onClose={onClose} history={state.history} /></React.Suspense>
    : showingLeaders ? <InfortuneLeaderWalk key={closing.id} cue={closing} bank={state.balance} onClose={onClose} />
    : <TournamentRound key={state.round} controller={controller} state={state} contestants={contestants} muted={muted} onMutedChange={setMuted} onClose={onClose} onPresented={setPresented} />}</InfortuneStageTransition>;
}

export default function WorkshopTournament(props) {
  const [trial, setTrial] = React.useState(0);
  return <TournamentSession key={trial} {...props} onRestart={() => setTrial(value => value + 1)} />;
}
