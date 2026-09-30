import React from "react";
import { drawAvatarMedals } from "../avatar/avatarMedals.js";

export default React.memo(function PodiumAvatar({ actor, pose, medals }) {
  const ref = React.useRef(null);
  const gold = medals?.gold || 0, silver = medals?.silver || 0, bronze = medals?.bronze || 0;
  React.useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const frame = actor.frames[pose];
    context.drawImage(frame, 0, 0);
    // Refresh only the displayed canvas: cached poses and animation stay intact.
    drawAvatarMedals(context, frame.gobbleViewport, { gold, silver, bronze });
  }, [actor, pose, gold, silver, bronze]);
  return <canvas ref={ref} width="600" height="600" role="img" aria-label={`Avatar de ${actor.nick}`} />;
});
