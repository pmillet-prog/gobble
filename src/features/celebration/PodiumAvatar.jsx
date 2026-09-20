import React from "react";

export default React.memo(function PodiumAvatar({ actor, pose }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const canvas = ref.current;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(actor.frames[pose], 0, 0);
  }, [actor, pose]);
  return <canvas ref={ref} width="600" height="600" role="img" aria-label={`Avatar de ${actor.nick}`} />;
});
