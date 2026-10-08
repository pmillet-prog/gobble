import React from "react";
import PodiumAvatar from "./PodiumAvatar.jsx";
import { createPodiumBotReactions } from "./podiumBotReactions.js";
import { playPresenterPunch } from "../../components/botInterventions/presenterReactions.js";
import { useOptionalApplicationKernel } from "../../app/react/ApplicationRuntimeProvider.jsx";
import { resolvePresenterKey } from "../presenters/presenterIdentity.js";
import { reportPresenterHit } from "../presenters/presenterHitReporter.js";

export default React.memo(function PodiumBotAvatar({ actor, pose, enabled, sound }) {
  const kernel = useOptionalApplicationKernel();
  const reactions = React.useMemo(() => createPodiumBotReactions(), [actor]);
  const { reaction, hits } = React.useSyncExternalStore(reactions.subscribe, reactions.getSnapshot, reactions.getSnapshot);
  React.useEffect(() => { reactions.start(); return () => reactions.stop(); }, [reactions]);
  return <div className="podium-bot-avatar" data-reaction={reaction || "neutral"} data-hits={hits}>
    <PodiumAvatar actor={actor} pose={reaction || pose} />
    <button type="button" className="podium-bot-hit-target" style={actor.podiumHitTarget}
      disabled={!enabled || reaction === "stars"}
      aria-label={reaction === "stars" ? `${actor.nick} est sonné` : `Donner un coup à ${actor.nick}`}
      onClick={() => {
        if (!reactions.hit()) return;
        if (sound) playPresenterPunch();
        if (actor.isBot === true) reportPresenterHit(kernel, resolvePresenterKey(actor), { surface: "podium" });
      }} />
  </div>;
});
