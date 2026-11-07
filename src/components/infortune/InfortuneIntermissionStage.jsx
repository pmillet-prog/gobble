import React from "react";
import { usePerspectiveWheel } from "../../../dev/infortune-perspective/usePerspectiveWheel.js";
import { DEFAULT_REFLECTIONS } from "../../../dev/infortune-perspective/sphericalReflections.js";
import { useWheelSoundtrack } from "../../../dev/infortune-perspective/useWheelSoundtrack.js";
import { useInfortuneCamera } from "../../features/infortune/useInfortuneCamera.js";
import { useInfortuneContestants } from "../../features/infortune/useInfortuneContestants.js";
import StageExchangeChoice from "../../../dev/infortune-perspective/StageExchangeChoice.jsx";
import InfortuneWheelPlay from "./InfortuneWheelPlay.jsx";
import InfortuneGameSurface from "./InfortuneGameSurface.jsx";
import InfortuneExchangeAnimation from "./InfortuneExchangeAnimation.jsx";
import InfortuneWheelProgress from './InfortuneWheelProgress.jsx';
import { exchangeReplayEconomy } from "../../features/infortune/plateauExchangeReplay.js";

export default function InfortuneIntermissionStage({ feature, muted, preparing = false, plateau, economy, groups, serverOffset, stage, launchUntil, spinUntil, choiceUntil, exchangeReplay, economyError, onRetry }) {
  const { loading, contestants } = useInfortuneContestants(plateau);
  if (loading) return <InfortuneGameSurface><div className="infortune-intermission__waiting" role="status">Les avatars rejoignent le plateau…</div></InfortuneGameSurface>;
  return <WheelStage feature={feature} muted={muted} preparing={preparing} contestants={contestants} economy={economy} groups={groups} serverOffset={serverOffset} stage={stage} launchUntil={launchUntil} spinUntil={spinUntil} choiceUntil={choiceUntil} plateau={plateau} exchangeReplay={exchangeReplay} economyError={economyError} onRetry={onRetry} />;
}

function WheelStage({ feature, muted, preparing, contestants, economy, groups, serverOffset, stage, launchUntil, spinUntil, choiceUntil, plateau, exchangeReplay, economyError, onRetry }) {
  const [selectedId, setSelectedId] = React.useState(null), [size, setSize] = React.useState({ width: 720, height: 554 });
  const displayedEconomy = React.useMemo(() => exchangeReplayEconomy(economy, exchangeReplay), [economy, exchangeReplay]);
  const wheel = usePerspectiveWheel(size, DEFAULT_REFLECTIONS, { muted, preparing, onLaunch: feature.launched, onResult: feature.recordResult,
    contestants, exchangeEnabled: economy?.exchangeEnabled, banks: displayedEconomy,
    selectedContestant: stage === "exchange" || stage === "exchange-wait" ? selectedId : null,
    onChoose: stage === "exchange" ? setSelectedId : null, inputDisabled: stage !== "wheel" });
  const sound = useWheelSoundtrack(preparing || wheel.muted, wheel.audioEvents);
  const selfId = plateau?.self?.id;
  React.useEffect(() => {
    if (exchangeReplay) sound.exchange(exchangeReplay.activeExchange, selfId, `${economy.roundNumber}:${exchangeReplay.index}`);
  }, [exchangeReplay, selfId, economy?.roundNumber, sound.exchange]);
  useInfortuneCamera(wheel, sound, feature, { enabled: !preparing });
  const latestWheel = React.useRef(wheel); latestWheel.current = wheel;
  React.useEffect(() => {
    if (!wheel.inputLocked && wheel.stageStatus.phase === "ready" && stage === "wheel") feature.ready();
  }, [wheel.inputLocked, wheel.stageStatus.phase, stage, feature]);
  React.useEffect(() => {
    if (!launchUntil || stage !== "wheel") return;
    let timer;
    const launch = () => { if (!latestWheel.current.autoLaunch()) timer = setTimeout(launch, 250); };
    timer = setTimeout(launch, Math.max(0, launchUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [launchUntil, stage]);
  React.useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wheel.scene.current); return () => observer.disconnect();
  }, [wheel.scene]);
  const bank = displayedEconomy?.members?.[plateau?.self?.id]?.bank;
  const byId = id => plateau?.members.find(player => player.id === id)?.nick;
  const chosen = economy?.members?.[plateau?.self?.id]?.target;
  const exchanges = stage === "settled" ? economy?.exchangeOrder?.[plateau?.id]?.filter(id => economy.members[id]?.target)
    .map(id => `${byId(id)} ↔ ${byId(economy.members[id].target)}`).join(" · ") : null;
  const status = economyError ? <><span role="alert">{economyError}</span> <button type="button" onClick={onRetry}>Réessayer</button></>
    : { exchange: "Sélectionne un avatar du plateau.", "exchange-wait": `Les candidats terminent leurs choix…${chosen ? ` Ton choix : ${byId(chosen)}.` : ""}`,
      accounting: "Enregistrement du lancer…", waiting: "Ton lancer est terminé.", settled: exchangeReplay ? `Les échanges du plateau · ${exchangeReplay.index + 1} / ${exchangeReplay.exchanges.length}` : `Ta cagnotte est à jour.${exchanges ? ` ${exchanges}` : ""}` }[stage];
  return <InfortuneWheelPlay wheel={wheel} sound={wheel.flat ? null : sound} subtitle={`Lancer ${economy?.roundNumber || 1}/4`} bank={bank}
    launchBank={economy?.members?.[selfId]?.launchBank} onLaunchLand={feature.landLaunch}
    until={stage === "wheel" ? launchUntil : null} status={status} exchanging={stage !== "wheel"}
    progress={<InfortuneWheelProgress economy={economy} groups={groups} serverOffset={serverOffset} spinUntil={spinUntil} stage={stage} selfId={selfId} />}
    onClose={wheel.renderError ? () => feature.complete() : undefined} closeLabel="Passer aux résultats">
    {stage === "exchange" && wheel.stageStatus.phase === "ready" && <StageExchangeChoice wheel={wheel} contestants={contestants}
      selectedId={selectedId} onSelect={setSelectedId} bank={bank} until={choiceUntil} onConfirm={() => feature.chooseExchange(selectedId)} onDecline={() => feature.chooseExchange(null)} />}
    {exchangeReplay && <InfortuneExchangeAnimation key={exchangeReplay.index} exchange={exchangeReplay.activeExchange}
      index={exchangeReplay.index} total={exchangeReplay.exchanges.length} players={[plateau.self, ...contestants]}
      banks={exchangeReplay.banks} selfId={plateau.self.id} />}
  </InfortuneWheelPlay>;
}
