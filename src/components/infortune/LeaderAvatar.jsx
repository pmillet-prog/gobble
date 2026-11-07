import React from 'react';

export default function LeaderAvatar({ poses, nick }) {
  const portrait = React.useRef(null);
  React.useLayoutEffect(() => {
    const target = portrait.current, source = poses?.happy;
    if (!target || !source?.width) return;
    target.width = source.width; target.height = source.height * 2;
    const context = target.getContext('2d');
    context.drawImage(source, 0, 0);
    context.drawImage(poses.blink?.width ? poses.blink : source, 0, source.height, source.width, source.height);
    return () => { target.width = 0; target.height = 0; };
  }, [poses]);
  return <div className="wheel-leaders__portrait" data-ready={Boolean(poses)} aria-hidden="true">
    {poses ? <canvas ref={portrait} className="wheel-leaders__faces" />
      : <span className="wheel-leaders__initial">{Array.from(nick || '?')[0]}</span>}
  </div>;
}
